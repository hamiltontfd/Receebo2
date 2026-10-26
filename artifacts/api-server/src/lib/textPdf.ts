/**
 * Minimal, dependency-free text → PDF renderer.
 *
 * Used to keep a durable "proof of purchase" document for order emails that
 * have no PDF attachment (HTML-body imports). Downstream code (storage,
 * approval, receipt preview) then treats the import like any other PDF.
 *
 * Uses the built-in Courier font with WinAnsiEncoding, which covers Western
 * European characters (accents, ç, ã, €). Other characters render as "?".
 */

const PAGE_WIDTH = 595; // A4 in points
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const FONT_SIZE = 9;
const LEADING = 11;
const CHARS_PER_LINE = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (FONT_SIZE * 0.6));
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LEADING);
const MAX_PAGES = 40;

const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function toWinAnsiBytes(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
    } else if (WIN_ANSI_EXTRA[ch] !== undefined) {
      bytes.push(WIN_ANSI_EXTRA[ch]!);
    } else if (ch === "\t") {
      bytes.push(0x20);
    } else {
      bytes.push(0x3f); // "?"
    }
  }
  return bytes;
}

/** PDF literal string from WinAnsi bytes, escaping \ ( ). */
function pdfString(bytes: number[]): string {
  let out = "(";
  for (const b of bytes) {
    if (b === 0x5c || b === 0x28 || b === 0x29) out += "\\" + String.fromCharCode(b);
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

export function wrapLines(text: string, width = CHARS_PER_LINE): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = raw.replace(/\t/g, "  ");
    if (line.length === 0) {
      lines.push("");
      continue;
    }
    while (line.length > width) {
      let cut = line.lastIndexOf(" ", width);
      if (cut <= width * 0.5) cut = width;
      lines.push(line.slice(0, cut).trimEnd());
      line = line.slice(cut).trimStart();
    }
    lines.push(line);
  }
  return lines;
}

export function renderTextPdf(text: string): Buffer {
  const allLines = wrapLines(text);
  const pages: string[][] = [];
  for (let i = 0; i < allLines.length && pages.length < MAX_PAGES; i += LINES_PER_PAGE) {
    pages.push(allLines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([""]);

  // Object numbering: 1 catalog, 2 pages, 3 font, then (page, content) pairs.
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] ` +
    `/Count ${pages.length} >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";

  pages.forEach((lines, i) => {
    const pageId = pageObjectIds[i]!;
    const contentId = pageId + 1;
    let stream = `BT /F1 ${FONT_SIZE} Tf ${LEADING} TL ${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n`;
    for (const line of lines) stream += `${pdfString(toWinAnsiBytes(line))} '\n`;
    stream += "ET";
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
