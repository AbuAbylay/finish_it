// A small one-page PDF with a real text layer, built by hand so tests need no PDF library and no fixture file.

/** Wraps `text` at about 90 characters and writes it as lines of Helvetica. With no text the page is empty, like a scan. */
export function makePdf(text: string): Uint8Array {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > 90) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  const escaped = (s: string) => s.replace(/[\\()]/g, (ch) => `\\${ch}`);
  // 70 lines fit on a page; a PDF with no text still has one (empty) page, like a scan.
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += 70) pages.push(lines.slice(i, i + 70));
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((page, i) => {
    const stream = page.length ? `BT /F1 9 Tf 40 800 Td 11 TL\n${page.map((l) => `(${escaped(l)}) Tj T*`).join("\n")}\nET` : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
