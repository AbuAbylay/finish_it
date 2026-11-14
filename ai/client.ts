// The one place that talks to the Claude API. The rest of the AI layer is plain code around it.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelRequest {
  /** Which of the three calls this is; used in the usage log. */
  call: "setup" | "lesson" | "chat";
  model: string;
  effort: Effort;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** When set, the reply is JSON constrained to this schema (structured outputs). */
  schema?: z.ZodType;
  maxTokens: number;
  /** Hard limit for this request. The SDK's own retries are off; the caller decides about a second try. */
  timeoutMs: number;
}

export type FailureReason = "no_key" | "auth" | "bad_request" | "refusal" | "rate_limited" | "timeout" | "truncated" | "empty" | "api";

export type ModelReply = { ok: true; text: string } | { ok: false; reason: FailureReason; detail: string };

/** Failures a second try cannot fix. */
export const FINAL_FAILURES: readonly FailureReason[] = ["no_key", "auth", "bad_request", "refusal"];

/**
 * If the model declines a request for policy reasons, the API re-runs it on the model's default
 * fallback. On a model without fallbacks the request simply runs on the model that was asked for.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the server environment
  return client;
}

interface Received {
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

async function send(req: ModelRequest, withFallback: boolean): Promise<ModelReply> {
  const started = Date.now();
  const base = { model: req.model, max_tokens: req.maxTokens, system: req.system, messages: req.messages };
  // The SDK's timeout covers the wait for the response; the signal also ends a reply that stalls while it is being read.
  const options = { timeout: req.timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(req.timeoutMs) };
  const message: Received = withFallback
    ? await anthropic().beta.messages.create(
        {
          ...base,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: req.effort, ...(req.schema ? { format: betaZodOutputFormat(req.schema) } : {}) },
        },
        options,
      )
    : await anthropic().messages.create(
        { ...base, output_config: { effort: req.effort, ...(req.schema ? { format: zodOutputFormat(req.schema) } : {}) } },
        options,
      );

  // Token counts per call, for the cost-per-lesson figure. No prompt or reply text is logged.
  console.info(
    `ai ${req.call}: model=${message.model} input_tokens=${message.usage.input_tokens} output_tokens=${message.usage.output_tokens} ms=${Date.now() - started} stop=${message.stop_reason}`,
  );

  if (message.stop_reason === "refusal") {
    return { ok: false, reason: "refusal", detail: `the model declined the request (${message.stop_details?.category ?? "no category"})` };
  }
  if (message.stop_reason === "max_tokens") {
    return { ok: false, reason: "truncated", detail: `the reply was cut off at max_tokens=${req.maxTokens}` };
  }
  // A reply can start with thinking blocks, so the text is read by block type, not by position.
  const text = message.content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
  if (text.trim() === "") return { ok: false, reason: "empty", detail: `the reply had no text (stop_reason ${message.stop_reason})` };
  return { ok: true, text };
}

function failure(err: unknown): ModelReply {
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return { ok: false, reason: "timeout", detail: "the request timed out" };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { ok: false, reason: "auth", detail: `the API key was rejected (${err.status})` };
  }
  if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited", detail: "rate limited by the API (429)" };
  if (err instanceof Anthropic.BadRequestError) return { ok: false, reason: "bad_request", detail: `bad request (400): ${err.message}` };
  if (err instanceof Anthropic.APIError) return { ok: false, reason: "api", detail: `API error ${err.status ?? "(no status)"}: ${err.message}` };
  return { ok: false, reason: "api", detail: err instanceof Error ? err.message : String(err) };
}

/** One request to the Messages API. Never throws: every failure comes back as a reason and a detail for the log. */
export async function callModel(req: ModelRequest): Promise<ModelReply> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: "no_key", detail: "ANTHROPIC_API_KEY is not set" };
  const deadline = Date.now() + req.timeoutMs;
  try {
    return await send(req, true);
  } catch (err) {
    const left = deadline - Date.now();
    if (err instanceof Anthropic.BadRequestError && left > 5_000) {
      // The fallback option is the only part of the request the lesson does not need. If the API
      // rejects the request, send it once more without it before giving up.
      console.warn(`ai ${req.call}: request rejected (${err.message}); retrying without the fallback option`);
      try {
        return await send({ ...req, timeoutMs: left }, false);
      } catch (second) {
        return failure(second);
      }
    }
    return failure(err);
  }
}
