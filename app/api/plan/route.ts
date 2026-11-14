import { context, json, requireSetUp, route } from "@/lib/server";
import type { LearnerRecord, Profile } from "@/lib/types";
import { planView } from "@/lib/views";

export const dynamic = "force-dynamic";

/** Calendar tracker data, pace line, unit statuses and today's next step. */
export const GET = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  return json(planView({ ...ctx, record: ctx.record as LearnerRecord & { profile: Profile } }));
});
