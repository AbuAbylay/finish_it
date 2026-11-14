// Identity: the only module that knows how a request maps to a learner.
// Today it is a typed or generated ID plus a session cookie, a placeholder for real sign-in.
// Swapping in real auth should only touch this file: routes call resolveLearner/createSession/signOut.
import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  countAuthAttempts,
  createLearner,
  deleteSession,
  insertSession,
  learnerIdByLoginId,
  learnerIdBySession,
  logAuthAttempt,
  loginIdOf,
} from "./db";
import { HttpError, clientIp } from "./http";
import { newRecord } from "./rules";
import type { LearnerRecord } from "./types";

export const SESSION_COOKIE = "fic_session";
const SESSION_MAX_AGE_S = 180 * 24 * 3600;

/** Crockford base32 without i, l, o, u: easy to read aloud and to type. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const LOGIN_ID = /^[a-z0-9-]{8,40}$/;

const LIMITS = {
  enterWindowMs: 15 * 60 * 1000,
  enterFailures: 10,
  enterTotal: 60,
  generateWindowMs: 60 * 60 * 1000,
  generateTotal: Number(process.env.ID_CAP_PER_IP_HOUR) > 0 ? Number(process.env.ID_CAP_PER_IP_HOUR) : 30,
};

/** 20 random symbols x 5 bits = 100 bits, shown in groups of five: "k7m2q-x2pd9-fhwc4-tnr8b". */
export function generateLoginId(): string {
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]); // 256 is a multiple of 32, so this is uniform
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

export function normalizeLoginId(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidLoginId(id: string): boolean {
  return LOGIN_ID.test(id);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function isHttps(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

/** The learner behind this request, or null when signed out. */
export async function resolveLearner(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  return learnerIdBySession(hashToken(token));
}

/** Starts a session for the learner and sets the cookie on the response. */
export async function createSession(req: NextRequest, res: NextResponse, learnerId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await insertSession(hashToken(token), learnerId);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function signOut(req: NextRequest, res: NextResponse): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: isHttps(req), path: "/", maxAge: 0 });
}

/** The ID to show the learner (their own). */
export async function displayId(learnerId: string): Promise<string | null> {
  return loginIdOf(learnerId);
}

/** Creates a learner with a fresh random ID. `init` prepares the record (for example, attaches the sample course). */
export async function registerLearner(
  req: NextRequest,
  init: (record: LearnerRecord) => Promise<LearnerRecord> | LearnerRecord,
): Promise<{ learnerId: string; loginId: string }> {
  const ip = clientIp(req);
  const since = new Date(Date.now() - LIMITS.generateWindowMs).toISOString();
  if ((await countAuthAttempts(ip, "generate", since)) >= LIMITS.generateTotal) {
    throw new HttpError(429, "Too many new IDs from this network in the last hour. Please try again later.", "rate_limited");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const loginId = generateLoginId();
    const record = await init(newRecord(randomUUID()));
    if (await createLearner(record, loginId)) {
      await logAuthAttempt(ip, "generate", true);
      return { learnerId: record.learner_id, loginId };
    }
  }
  throw new HttpError(500, "Could not create an ID. Please try again.", "server_error");
}

/** Looks up a typed ID. Failed lookups are limited per IP so IDs cannot be enumerated. */
export async function findLearnerByLoginId(req: NextRequest, typed: unknown): Promise<string> {
  const ip = clientIp(req);
  const since = new Date(Date.now() - LIMITS.enterWindowMs).toISOString();
  const [failures, total] = await Promise.all([
    countAuthAttempts(ip, "enter", since, true),
    countAuthAttempts(ip, "enter", since),
  ]);
  if (failures >= LIMITS.enterFailures || total >= LIMITS.enterTotal) {
    throw new HttpError(429, "Too many tries from this network. Wait 15 minutes, then try again.", "rate_limited");
  }
  const id = typeof typed === "string" ? normalizeLoginId(typed) : "";
  if (!isValidLoginId(id)) {
    await logAuthAttempt(ip, "enter", false);
    throw new HttpError(400, "An ID is 8 to 40 characters: letters, digits and dashes.", "bad_id");
  }
  const learnerId = await learnerIdByLoginId(id);
  await logAuthAttempt(ip, "enter", learnerId !== null);
  if (!learnerId) throw new HttpError(404, "We don't recognise that ID. Check it for typos, or get a new one.", "unknown_id");
  return learnerId;
}
