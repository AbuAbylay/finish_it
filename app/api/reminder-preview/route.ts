import { context, json, requireSetUp, route } from "@/lib/server";
import type { LearnerRecord, Profile } from "@/lib/types";
import { reminderView } from "@/lib/views";

export const dynamic = "force-dynamic";

/** The reminder emails this learner would get, rendered from the templates with real values. */
export const GET = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  const link = `${process.env.APP_URL || req.nextUrl.origin}/lesson`;
  return json(await reminderView({ ...ctx, record: ctx.record as LearnerRecord & { profile: Profile } }, link));
});
