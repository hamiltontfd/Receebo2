import { describe, expect, it } from "vitest";
import {
  MAX_BODY_TEXT_LENGTH,
  MIN_LISTING_SCORE,
  htmlToText,
  looksLikeReceiptEmail,
  planMessageImport,
  scoreReceiptListing,
} from "./candidates";
import { merchantTier, isEverydayMerchantName } from "./merchants";
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

describe("pre-AI ranking: only clear purchases, groceries and utilities skipped", () => {
  it.each([
    ["Fatura EDP Comercial", "EDP Comercial <faturas@edp.pt>"],
    ["A sua fatura", "Continente <noreply@continente.pt>"],
    ["Recibo da sua compra", "Pingo Doce <recibos@pingodoce.pt>"],
    ["Your receipt", "Uber Receipts <noreply@uber.com>"],
    ["Fatura de eletricidade outubro", "billing@energia.example"],
    ["Fatura", "MEO <faturas@telecom.pt>"],
  ])("skips subject=%s from=%s before any AI read", (subject, from) => {
    const result = scoreReceiptListing({ subject, from, hasAttachments: true });
    expect(result.include).toBe(false);
    expect(["everyday_sender", "utility_bill"]).toContain(result.reason);
  });

  it("ranks durable stores and tickets above marketplaces and unknown senders", () => {
    const worten = scoreReceiptListing({ subject: "Fatura da sua encomenda", from: "Worten <faturas@mail.worten.pt>", hasAttachments: true });
    const tickets = scoreReceiptListing({ subject: "Os seus bilhetes", from: "Ticketline <noreply@ticketline.pt>" });
    const amazon = scoreReceiptListing({ subject: "Your Amazon.es order", from: "auto-confirm@amazon.es" });
    const unknown = scoreReceiptListing({ subject: "Fatura n.º 12", from: "billing@shop.pt" });
    for (const r of [worten, tickets, amazon, unknown]) expect(r.include).toBe(true);
    expect(worten.score).toBeGreaterThan(tickets.score);
    expect(tickets.score).toBeGreaterThan(amazon.score);
    expect(amazon.score).toBeGreaterThan(unknown.score);
  });

  it("drops shipping-only updates and marketing", () => {
    expect(scoreReceiptListing({ subject: "Shipping update", from: "orders@shop.example" }).include).toBe(false);
    expect(scoreReceiptListing({ subject: "Desconto de 20% na sua próxima compra", from: "orders@shop.example" }).include).toBe(false);
  });

  it("never sends an everyday sender's PDF to the AI", () => {
    const plan = planMessageImport(message({
      subject: "Fatura", from: "EDP Comercial <faturas@edp.pt>",
      pdfAttachments: [{ id: "a1", filename: "fatura.pdf" }],
    }));
    expect(plan).toEqual({ kind: "skip", reason: "everyday_sender" });
  });

  it("matches mailing subdomains and display names", () => {
    expect(merchantTier("FNAC <news@em.fnac.pt>")).toBe("durable");
    expect(merchantTier("EDP Comercial <no-reply@invoicing.example>")).toBe("everyday");
    expect(merchantTier("friend@example.com")).toBeNull();
    expect(isEverydayMerchantName("Continente Bom Dia")).toBe(true);
    expect(isEverydayMerchantName("Worten")).toBe(false);
  });
});

describe("stricter listing filter", () => {
  it("requires a higher listing score", () => {
    expect(MIN_LISTING_SCORE).toBe(20);
  });

  it.each([
    ["Fatura em atraso: regularize já", "Vivo <cobranca@vivo.example>"],
    ["Pagamento pendente da sua encomenda", "shop@shop.example"],
    ["A sua encomenda está retida: pague a taxa aduaneira", "alerts@desk.example"],
    ["Como classificaria a sua encomenda?", "Amazon <review@amazon.es>"],
    ["Re: your order", "someone@example.com"],
    ["Código único de acesso à conta", "Amazon <account-update@amazon.es>"],
  ])("excludes collections, customs, review and account mail: %s", (subject, from) => {
    expect(scoreReceiptListing({ subject, from }).include).toBe(false);
  });

  it("excludes carrier notifications", () => {
    const r = scoreReceiptListing({ subject: "A sua encomenda foi enviada", from: "CTT Expresso <noreply@cttexpress.com>" });
    expect(r.include).toBe(false);
    expect(r.reason).toBe("carrier");
  });

  it("penalises marketing senders and emoji subjects", () => {
    expect(scoreReceiptListing({ subject: "🎁 Your order of deals is waiting", from: "Shop <promo@shop.example>" }).include).toBe(false);
    expect(scoreReceiptListing({ subject: "Confirmação de pedido", from: "Loja <info@newsletter.loja.example>" }).include).toBe(false);
    expect(scoreReceiptListing({ subject: "Confirmação de pedido", from: "Loja <info@loja.example>" }).include).toBe(true);
  });

  it("keeps real receipts and tickets", () => {
    for (const [subject, from] of [
      ["Fatura da Apple", "Apple <no_reply@email.apple.com>"],
      ["Pedido efetuado: \u201cRØDE NT1\u201d", "Amazon.es <auto-confirm@amazon.es>"],
      ["Order #40566 confirmed", "Lackto <shop@lackto.example>"],
      ["Os seus bilhetes para o concerto", "Ticketline <info@ticketline.example>"],
    ]) {
      expect(scoreReceiptListing({ subject, from }).include, subject).toBe(true);
    }
  });

  it("no longer treats a bare store domain as a receipt without an attachment", () => {
    expect(looksLikeReceiptEmail({ subject: "Novidades da semana", from: "Amazon <store-news@amazon.es>" })).toBe(false);
    expect(looksLikeReceiptEmail({ subject: "Novidades da semana", from: "Amazon <store-news@amazon.es>", hasAttachments: true })).toBe(true);
  });
});
