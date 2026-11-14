// The preloaded sample course. sample/course-plan.json (built by scripts/build-sample-plan.mjs) wins over the dev fixture.
import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCoursePlan } from "./contracts";
import type { CoursePlan } from "./types";

const SAMPLE_FILES = ["sample/course-plan.json", "sample/dev-course-plan.json"];

let cached: { id: string; plan: CoursePlan; source: "real" | "dev" } | null = null;

export async function readFirstExisting(files: string[]): Promise<{ file: string; text: string }> {
  for (const file of files) {
    try {
      return { file, text: await readFile(path.join(process.cwd(), file), "utf8") };
    } catch {
      // try the next one
    }
  }
  throw new Error(`None of these files exist: ${files.join(", ")}`);
}

export function contentId(prefix: string, content: string): string {
  return `${prefix}-${createHash("sha256").update(content).digest("hex").slice(0, 12)}`;
}

/** The sample plan and its id. The id changes when the file changes, so learners keep the version they started on. */
export async function samplePlan(): Promise<{ id: string; plan: CoursePlan; source: "real" | "dev" }> {
  if (cached) return cached;
  const { file, text } = await readFirstExisting(SAMPLE_FILES);
  const parsed = parseCoursePlan(JSON.parse(text));
  if (!parsed.ok) throw new Error(`${file} does not match the CoursePlan contract: ${parsed.error}`);
  cached = { id: contentId("sample", text), plan: parsed.plan, source: file === SAMPLE_FILES[0] ? "real" : "dev" };
  return cached;
}
