import { parseProfile } from "@/lib/contracts";
import { saveLearner } from "@/lib/db";
import { HttpError, context, json, readJson, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Saves the survey answers (PROJECT §4.1) into the learner record. */
export const POST = route(async (req) => {
  const ctx = await context(req);
  if (!ctx.record || !ctx.plan) throw new HttpError(409, "Start with a course first.", "no_course");
  const body = (await readJson(req)) as { profile?: unknown };
  const parsed = parseProfile(body.profile);
  if (!parsed.ok) throw new HttpError(400, `Some answers are missing or invalid: ${parsed.error}`, "bad_profile");
  await saveLearner({ ...ctx.record, profile: parsed.profile });
  return json({ ok: true, profile: parsed.profile });
});
