import { aiImplementation } from "@/lib/ai-info";
import { samplePlan } from "@/lib/course";
import { schemaVersion } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Liveness and configuration, without secrets. */
export async function GET(): Promise<Response> {
  let database: { ok: boolean; schema_version?: number; latest?: number } = { ok: false };
  try {
    const v = await schemaVersion();
    database = { ok: v.version === v.latest, schema_version: v.version, latest: v.latest };
  } catch {
    database = { ok: false };
  }
  let sample: "real" | "dev" | null = null;
  try {
    sample = (await samplePlan()).source;
  } catch {
    sample = null;
  }
  const ok = database.ok && sample !== null;
  return json(
    { ok, database, ai: aiImplementation(), sample, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    ok ? 200 : 503,
  );
}
