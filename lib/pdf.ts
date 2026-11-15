// Text out of a PDF's text layer, for a learner's own course. A scan has no text layer and gives "".
import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * A PDF stores lines, not paragraphs. This joins the lines of a paragraph back together and puts a blank
 * line between paragraphs, so the text reads like a paste. A line ends its paragraph when it is clearly
 * shorter than a full line: a heading, or the last line of a paragraph.
 */
export function reflow(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const full = Math.max(0, ...lines.map((l) => l.length));
  const paragraphs: string[] = [];
  let current = "";
  for (const line of lines) {
    if (line === "") {
      if (current) paragraphs.push(current);
      current = "";
      continue;
    }
    current = current ? `${current} ${line}` : line;
    const short = line.length < full * 0.8;
    const heading = line.length < full * 0.6 && !/[.!?:;,]$/.test(line);
    if (heading || (short && /[.!?:]["')\]]?$/.test(line))) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.join("\n\n");
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return reflow(text.join("\n")).trim();
}
