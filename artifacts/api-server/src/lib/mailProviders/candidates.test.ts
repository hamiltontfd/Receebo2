import { describe, expect, it } from "vitest";
import {
  MAX_BODY_TEXT_LENGTH,
  htmlToText,
  looksLikeReceiptEmail,
  planMessageImport,
} from "./candidates";
import type { MailMessage } from "./types";

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: "m1",
    subject: null,
    from: null,
    receivedAt: null,
    pdfAttachments: [],
    html: null,
    text: null,
    ...overrides,
  };
}

const AMAZON_HTML = `
  <html><head><style>.x{color:red}</style><title>t</title></head><body>
  <div style="display:none">Preheader hidden text</div>
  <table><tr><td>Bosch Drill PSB 1800</td><td>&euro;89,99</td></tr>
  <tr><td>Total</td><td>&#8364;89,99</td></tr></table>
  <p>Order #123-4567890-1234567 &amp; delivery to Braga</p>
  <script>alert(1)</script></body></html>`;

describe("receipt-like email detection", () => {
  it.each([
    ["Your Amazon.es order of Bosch drill", null],
    ["Recibo da sua compra", null],
    ["Fatura n.º 2026/123", null],
    ["Confirmação de encomenda", null],
    ["Ihre Bestellung", null],
    [null, "Amazon.es <auto-confirm@amazon.es>"],
    ["Shipping update", "orders@shop.example"],
  ])("accepts subject=%s from=%s", (subject, from) => {
    expect(looksLikeReceiptEmail({ subject, from })).toBe(true);
  });

  it.each([
    ["Weekly newsletter: order now!", "news@shop.example"],
    ["Password reset", "no-reply@service.example"],
    ["Lunch on Friday?", "friend@example.com"],
  ])("rejects subject=%s from=%s", (subject, from) => {
    expect(looksLikeReceiptEmail({ subject, from })).toBe(false);
  });
});

describe("planMessageImport (HTML-body candidate selection)", () => {
  it("always prefers PDF attachments, regardless of subject", () => {
    const plan = planMessageImport(message({
      subject: "Hello",
      pdfAttachments: [{ id: "a1", filename: "invoice.pdf" }],
      html: AMAZON_HTML,
    }));
    expect(plan).toEqual({ kind: "pdf", attachments: [{ id: "a1", filename: "invoice.pdf" }] });
  });

  it("uses the HTML body when an order email has no PDF", () => {
    const plan = planMessageImport(message({
      subject: "Your Amazon.es order",
      from: "auto-confirm@amazon.es",
      html: AMAZON_HTML,
    }));
    expect(plan.kind).toBe("html");
    if (plan.kind !== "html") return;
    expect(plan.text).toContain("Bosch Drill PSB 1800");
    expect(plan.text).toContain("€89,99");
    expect(plan.text).toContain("Order #123-4567890-1234567 & delivery to Braga");
    expect(plan.text).not.toContain("alert(1)");
    expect(plan.text).not.toContain("Preheader");
    expect(plan.text).not.toContain("color:red");
  });

  it("falls back to the plain-text body", () => {
    const plan = planMessageImport(message({
      subject: "Receipt for your payment",
      text: "Thanks for your purchase. ".repeat(10),
    }));
    expect(plan.kind).toBe("html");
  });

  it("skips non receipt-like emails without a PDF (no AI call)", () => {
    expect(planMessageImport(message({ subject: "Team lunch", html: AMAZON_HTML })))
      .toEqual({ kind: "skip", reason: "not_receipt_like" });
  });

  it("skips receipt-like emails with an empty body", () => {
    expect(planMessageImport(message({ subject: "Your order", html: "<p> </p>" })))
      .toEqual({ kind: "skip", reason: "no_content" });
  });

  it("caps the text sent to the AI", () => {
    const plan = planMessageImport(message({
      subject: "Your order",
      html: `<p>${"x".repeat(MAX_BODY_TEXT_LENGTH * 2)}</p>`,
    }));
    expect(plan.kind === "html" && plan.text.length).toBe(MAX_BODY_TEXT_LENGTH);
  });
});

describe("htmlToText", () => {
  it("keeps table cells and line breaks readable", () => {
    expect(htmlToText("<table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>"))
      .toBe("A 1\nB 2");
    expect(htmlToText("Line 1<br>Line 2")).toBe("Line 1\nLine 2");
  });
});
