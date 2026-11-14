import { z } from "zod";
import { sideChat } from "@/ai";
import { issues } from "@/lib/contracts";
import { loadLesson } from "@/lib/db";
import { HttpError, clientIp, context, json, readJson, route, spendGeneration } from "@/lib/server";
import { isAiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  lesson_key: z.string().min(1),
  question: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
});

/** Side chat about the open lesson (off the critical path). */
export const POST = route(async (req) => {
  const ctx = await context(req);
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, issues(body.error), "bad_request");
  const row = await loadLesson(body.data.lesson_key);
  if (!row || row.learner_id !== ctx.learnerId) throw new HttpError(404, "Lesson not found.", "not_found");
  await spendGeneration(ctx.learnerId, clientIp(req), "chat");
  const answer = await sideChat(row.lesson, row.order.unit.excerpt, body.data.history, body.data.question);
  if (isAiError(answer)) throw new HttpError(502, answer.error, "ai_error");
  return json({ answer });
});
