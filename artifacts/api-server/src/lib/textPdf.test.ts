import { describe, expect, it } from "vitest";
import { renderTextPdf, wrapLines } from "./textPdf";

describe("renderTextPdf", () => {
  it("produces a well-formed PDF with a valid xref offset", () => {
    const pdf = renderTextPdf("Fatura (n.º 1)\nTotal: €89,99 \\ ok");
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    // Parentheses and backslashes are escaped; € maps to WinAnsi 0x80.
    expect(text).toContain("\\(n.");
    expect(text).toContain("\\\\ ok");
    expect(pdf.includes(Buffer.from([0x80]))).toBe(true);
  });

  it("paginates long content", () => {
    const pdf = renderTextPdf(Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"));
    expect(/\/Count (\d+)/.exec(pdf.toString("latin1"))![1]).toBe("3");
  });

  it("wraps long lines on word boundaries", () => {
    const lines = wrapLines("word ".repeat(40).trim(), 20);
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(lines.join(" ")).toBe("word ".repeat(40).trim());
  });
});
