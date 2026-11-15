import { readFile } from "node:fs/promises";
import path from "node:path";
import { json, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The one-page example text behind "Try an example text" on the upload page. */
export const GET = route(async () => {
  const text = await readFile(path.join(process.cwd(), "sample", "example-food-safety.txt"), "utf8");
  return json({ text: text.trim() });
});
