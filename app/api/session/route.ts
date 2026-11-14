import type { NextRequest } from "next/server";
import { chooseSessionMinutes } from "@/lib/db";
import { parseMinutes, pickNext, placementDone, sessionPlan } from "@/lib/rules";
import { HttpError, context, findLesson, json, readJson, requireSetUp, route, type Ctx } from "@/lib/server";
import type { CoursePlan, LearnerRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type SetUp = Ctx & { record: LearnerRecord; plan: CoursePlan };

async function setUp(req: NextRequest): Promise<SetUp> {
  const ctx = requireSetUp(await context(req));
  if (!placementDone(ctx.record)) throw new HttpError(409, "Take the short test first.", "no_placement");
  return ctx;
}

/** Today's session for the page: the choice (or null), the default, how it splits into lessons, and whether to ask. */
async function view(ctx: SetUp, minutesToday: number | null) {
  const session = sessionPlan(ctx.record, ctx.today, minutesToday);
  const next = pickNext(ctx.record, ctx.plan, ctx.today, minutesToday);
  const open = next.kind === "lesson" ? next.order : null;
  // The chooser opens a day's session: nothing chosen yet, nothing studied today, and no lesson
  // already written for the open unit (one in progress keeps its length). A catch-up day does not
  // ask: its lesson is always the short one.
  let ask = false;
  if (open && open.mode !== "catch_up" && minutesToday === null && session.lessons_done_today === 0) {
    ask = (await findLesson(ctx.record, open)) === null;
  }
  return { today: ctx.today, ...session, ask, open_unit_id: open?.unit.unit_id ?? null };
}

/** GET /api/session -> today's session length and whether the time chooser should be shown. */
export const GET = route(async (req) => {
  const ctx = await setUp(req);
  return json(await view(ctx, ctx.minutesToday));
});

/**
 * POST /api/session { minutes } -> stores today's session length (limited to 10 to 30) and returns the session.
 * The first choice of a day stands: a later value is ignored, so switching cannot cause repeated lesson generations.
 */
export const POST = route(async (req) => {
  const ctx = await setUp(req);
  const body = await readJson(req);
  const sent = typeof body === "object" && body !== null ? (body as { minutes?: unknown }).minutes : undefined;
  const minutes = typeof sent === "number" ? parseMinutes(sent) : null;
  if (minutes === null) throw new HttpError(400, "minutes must be a whole number.", "bad_minutes");
  const stored = ctx.minutesToday ?? (await chooseSessionMinutes(ctx.learnerId, ctx.today, minutes));
  return json(await view(ctx, stored));
});
