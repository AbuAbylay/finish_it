import { answersSchema, issues } from "@/lib/contracts";
import { saveLearner } from "@/lib/db";
import { gradePlacement, placementDone, startCourse } from "@/lib/rules";
import { HttpError, context, json, publicQuestion, readJson, requireSetUp, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The five short-test questions, without answers. */
export const GET = route(async (req) => {
  const { plan, record } = requireSetUp(await context(req));
  const skipped = new Set((record.profile?.skip ?? []).map((t) => t.trim().toLowerCase()));
  const skippedUnits = new Set(plan.units.filter((u) => skipped.has(u.title.trim().toLowerCase())).map((u) => u.unit_id));
  return json({ questions: plan.placement_test.filter((q) => !skippedUnits.has(q.unit_id)).map(publicQuestion) });
});

/** Grades the short test and writes the initial unit statuses. Allowed until the first lesson is done. */
export const POST = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  if (placementDone(ctx.record)) throw new HttpError(409, "The short test is only taken once.", "already_done");
  const body = (await readJson(req)) as { answers?: unknown };
  const answers = answersSchema.safeParse(body.answers ?? {});
  if (!answers.success) throw new HttpError(400, `Invalid answers: ${issues(answers.error)}`, "bad_answers");

  const { record, results } = gradePlacement(ctx.record, ctx.plan, answers.data, ctx.today);
  await saveLearner(record);
  const titles = new Map(ctx.plan.units.map((u) => [u.unit_id, u.title]));
  return json({
    results: results.map((r) => ({ ...r, unit_title: titles.get(r.unit_id) ?? r.unit_id })),
    known: ctx.plan.units.filter((u) => record.units[u.unit_id]?.status === "known").map((u) => u.title),
    lessons_left: ctx.plan.units.filter((u) => record.units[u.unit_id]?.status !== "known").length,
  });
});

/**
 * Takes the short check back so the survey's topics can be chosen again. Only for a learner who has not
 * studied a lesson yet: every unit returns to `todo`, the survey answers stay.
 */
export const DELETE = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  if (ctx.record.sessions.length > 0) throw new HttpError(409, "You have already studied lessons on this plan.", "has_sessions");
  await saveLearner(startCourse(ctx.record, ctx.record.course_plan_id ?? "", ctx.plan));
  return json({ stage: "test" });
});
