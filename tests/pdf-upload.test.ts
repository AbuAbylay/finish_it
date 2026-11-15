// PDF upload: POST /api/course/pdf reads the text layer and answers { text }; that text then builds a plan
// through POST /api/course like pasted text. Real route handlers, in-memory database, dev stub for the plan.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makePdf } from "./pdf";
import { Client } from "./routes";
import { uploadCopy } from "@/lib/copy/pages";
import { PDF_MAX_BYTES, UPLOAD_MAX_CHARS } from "@/lib/upload";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  course: (await import("@/app/api/course/route")).POST,
  pdf: (await import("@/app/api/course/pdf/route")).POST,
  example: (await import("@/app/api/course/example/route")).GET,
});

let r: Awaited<ReturnType<typeof routes>>;
let client: Client;
const EXAMPLE = readFileSync("sample/example-food-safety.txt", "utf8");

async function sendPdf(bytes: Uint8Array, cookie = client.cookie) {
  const req = new NextRequest(new URL("/api/course/pdf", "http://localhost"), {
    method: "POST",
    headers: { "content-type": "application/pdf", "x-forwarded-for": client.ip, ...(cookie ? { cookie } : {}) },
    body: bytes as BodyInit,
  });
  const res = await r.pdf(req);
  return { status: res.status, data: (await res.json()) as { text?: string; error?: string; code?: string } };
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

beforeAll(async () => {
  r = await routes();
  client = new Client("10.0.9.1");
  expect((await client.call(r.generate, "/api/identity/generate", { method: "POST" })).status).toBe(200);
});

describe("POST /api/course/pdf", () => {
  it("returns the text of a PDF with a text layer, and that text builds a plan like pasted text", async () => {
    const res = await sendPdf(makePdf(EXAMPLE));
    expect(res.status).toBe(200);
    expect(words(res.data.text!)).toEqual(words(EXAMPLE));
    const built = await client.call<{ units: unknown[]; kept: boolean }>(r.course, "/api/course", { method: "POST", body: { source: "upload", text: res.data.text } });
    expect(built.status).toBe(200);
    expect(built.data.units.length).toBeGreaterThanOrEqual(2);
  });

  it("tells a scan from a text PDF: under 900 characters of text is refused with the paste advice", async () => {
    for (const pdf of [makePdf(""), makePdf("Only a title page.")]) {
      const res = await sendPdf(pdf);
      expect(res.status).toBe(400);
      expect(res.data).toMatchObject({ code: "no_text", error: "This PDF has no text layer. It may be a scan. Paste the text instead." });
    }
  });

  it("refuses a file that is not a PDF, a PDF over 10 MB and a PDF with more than 60,000 characters", async () => {
    const notPdf = await sendPdf(new TextEncoder().encode("Just some text pretending to be a file."));
    expect(notPdf.status).toBe(400);
    expect(notPdf.data).toMatchObject({ code: "not_pdf", error: uploadCopy.pdfUnreadable });

    const broken = await sendPdf(new TextEncoder().encode("%PDF-1.4\nnot really a pdf"));
    expect(broken.status).toBe(400);
    expect(broken.data.code).toBe("not_pdf");

    const big = new Uint8Array(PDF_MAX_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-1.4\n"));
    const tooBig = await sendPdf(big);
    expect(tooBig.status).toBe(413);
    expect(tooBig.data.code).toBe("file_too_big");

    const long = await sendPdf(makePdf("food safety ".repeat(Math.ceil(UPLOAD_MAX_CHARS / 12) + 50)));
    expect(long.status).toBe(413);
    expect(long.data.code).toBe("too_long");
  });

  it("needs a signed-in learner", async () => {
    const res = await sendPdf(makePdf(EXAMPLE), "");
    expect(res.status).toBe(401);
  });
});

describe("reflow", () => {
  it("joins the lines of a paragraph and keeps headings and paragraphs apart", async () => {
    const { reflow } = await import("@/lib/pdf");
    const wrapped = [
      "1. The temperature danger zone",
      "Bacteria that cause foodborne illness grow fastest between 41 and 135 degrees Fahrenheit.",
      "This range is called the temperature danger zone. Food that needs time and temperature",
      "control is called TCS food.",
      "Cooling is the step where kitchens fail most often. Cooked food must cool from 135 to 70",
      "degrees within two hours.",
    ].join("\n");
    expect(reflow(wrapped).split("\n\n")).toEqual([
      "1. The temperature danger zone",
      "Bacteria that cause foodborne illness grow fastest between 41 and 135 degrees Fahrenheit. This range is called the temperature danger zone. Food that needs time and temperature control is called TCS food.",
      "Cooling is the step where kitchens fail most often. Cooked food must cool from 135 to 70 degrees within two hours.",
    ]);
  });
});

describe("GET /api/course/example", () => {
  it("returns the example text, which is long enough to be taught from as it stands", async () => {
    const res = await client.call<{ text: string }>(r.example, "/api/course/example");
    expect(res.status).toBe(200);
    expect(res.data.text).toBe(EXAMPLE.trim());
    expect(res.data.text.length).toBeGreaterThanOrEqual(900);
  });
});
