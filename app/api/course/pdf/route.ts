import { uploadCopy } from "@/lib/copy/pages";
import { pdfText } from "@/lib/pdf";
import { HttpError, context, json, route } from "@/lib/server";
import { COURSE_TEXT_MIN_CHARS, PDF_MAX_BYTES, UPLOAD_MAX_CHARS } from "@/lib/upload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Body: the bytes of a PDF file (at most 10 MB). Answers { text } with the file's text layer, which the
 * upload page puts in its box; the plan is then built by POST /api/course like any pasted text.
 * No model is called here. Errors: 400 not_pdf, 400 no_text (a scan, or under 900 characters of text),
 * 413 file_too_big, 413 too_long (over 60,000 characters).
 */
export const POST = route(async (req) => {
  await context(req); // signed-in learners only
  if (Number(req.headers.get("content-length") ?? 0) > PDF_MAX_BYTES) throw new HttpError(413, uploadCopy.pdfTooBig, "file_too_big");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > PDF_MAX_BYTES) throw new HttpError(413, uploadCopy.pdfTooBig, "file_too_big");
  // Every PDF starts with "%PDF-".
  if (new TextDecoder("latin1").decode(bytes.subarray(0, 5)) !== "%PDF-") throw new HttpError(400, uploadCopy.pdfUnreadable, "not_pdf");

  let text: string;
  try {
    text = await pdfText(bytes);
  } catch (err) {
    console.error("pdfText failed:", err instanceof Error ? err.message : err);
    throw new HttpError(400, uploadCopy.pdfUnreadable, "not_pdf");
  }
  if (text.length < COURSE_TEXT_MIN_CHARS) throw new HttpError(400, uploadCopy.pdfNoText, "no_text");
  if (text.length > UPLOAD_MAX_CHARS) throw new HttpError(413, uploadCopy.pdfTooLong, "too_long");
  return json({ text });
});
