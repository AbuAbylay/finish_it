// Which AI implementation sits behind the ai/index.ts seam. Detected by identity, so ai/real.ts
// does not need to export anything extra.
import "server-only";
import * as active from "@/ai";
import * as stub from "@/ai/stub";

export type AiImplementation = "stub" | "real";

export function aiImplementation(): AiImplementation {
  return active.writeLesson === stub.writeLesson ? "stub" : "real";
}
