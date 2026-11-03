import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create } } },
}));
vi.mock("./objectStorage", () => ({
  ObjectStorageService: class {
    async getObjectEntityFile() {
      return { download: async () => [Buffer.from("img")] };
    }
  },
}));

import {
  FISCAL_DOCUMENTS_NOTE,
  PRE_CHECK_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  FULL_PAGE_IMAGE_DETAIL,
  checkIsReceipt,
  extractReceiptData,
} from "./receiptExtraction";

const reply = (content: string) => ({ choices: [{ message: { content } }] });
afterEach(() => create.mockReset());

describe("fiscal invoices (Brazilian DANFE / NF-e, PT faturas)", () => {
  it("the photo pre-check and full extraction both tell the model a DANFE is a receipt", () => {
    for (const prompt of [PRE_CHECK_SYSTEM_PROMPT, SYSTEM_PROMPT]) {
      expect(prompt).toContain(FISCAL_DOCUMENTS_NOTE);
      for (const term of ["DANFE", "NF-e", "Nota Fiscal", "NFC-e", "Cupom Fiscal", "Fatura-Recibo", "A4"]) {
        expect(prompt).toContain(term);
      }
    }
  });

  it("no longer lists every 'document' as a non-receipt, nor demands legible items", () => {
    expect(PRE_CHECK_SYSTEM_PROMPT).not.toMatch(/random documents/);
    expect(PRE_CHECK_SYSTEM_PROMPT).not.toMatch(/must show at least a merchant name, items purchased/);
    expect(SYSTEM_PROMPT).not.toMatch(/landscape photo, document,/);
  });

  it("still names quotes, boletos and statements as non-receipts", () => {
    for (const term of ["Orçamento", "Boleto", "bank statements"]) expect(FISCAL_DOCUMENTS_NOTE).toContain(term);
  });

  it("DANFE field mapping: issuer as merchant, emission date, VALOR TOTAL DA NOTA, BRL/BR", () => {
    expect(SYSTEM_PROMPT).toMatch(/EMITENTE[^\n]*NEVER the buyer \(DESTINATÁRIO/);
    expect(SYSTEM_PROMPT).toContain('"DATA DA EMISSÃO"');
    expect(SYSTEM_PROMPT).toContain('"VALOR TOTAL DA NOTA"');
    expect(SYSTEM_PROMPT).toMatch(/"currency" is "BRL" and "purchaseCountry" is "BR"/);
  });

  it("checkIsReceipt sends the new prompt and keeps its accept/reject contract", async () => {
    create.mockResolvedValueOnce(reply('{"isReceipt":true}'));
    expect(await checkIsReceipt("/objects/x", "image/jpeg")).toEqual({ isReceipt: true, fullPageDocument: false });
    expect(create.mock.calls[0][0].messages[0].content).toBe(PRE_CHECK_SYSTEM_PROMPT);
    create.mockResolvedValueOnce(reply('{"isReceipt":false}'));
    expect(await checkIsReceipt("/objects/x", "image/jpeg")).toEqual({ isReceipt: false, fullPageDocument: false });
    create.mockRejectedValueOnce(new Error("503"));
    expect(await checkIsReceipt("/objects/x", "image/jpeg")).toEqual({ isReceipt: true, fullPageDocument: false });
  });

  it("parses a DANFE-style extraction", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({
      isReceipt: true, merchant: "Loja de Materiais de Construção Ltda", purchaseDate: "2026-10-30",
      total: 1234.5, currency: "BRL", purchaseCountry: "BR", transactionNumber: "000.000.123",
      products: [{ name: "Cimento CP II 50kg", quantity: 10, price: 39.9 }],
    })));
    const data = await extractReceiptData("/objects/x", "image/jpeg");
    expect(create.mock.calls[0][0].messages[0].content).toBe(SYSTEM_PROMPT);
    expect(data).toMatchObject({ isReceipt: true, currency: "BRL", purchaseCountry: "BR", total: 1234.5 });
  });
});

describe("no guessing on hard-to-read photos", () => {
  it("tells the model never to invent values and to flag unreadable photos", () => {
    expect(SYSTEM_PROMPT).toContain('"legible": boolean');
    expect(SYSTEM_PROMPT).toMatch(/NEVER guess/);
    expect(SYSTEM_PROMPT).toMatch(/set "legible" to false/);
  });

  it("the pre-check asks for and parses the full-page flag (only an explicit true counts)", async () => {
    expect(PRE_CHECK_SYSTEM_PROMPT).toContain('"fullPageDocument"');
    create.mockResolvedValueOnce(reply('{"isReceipt":true,"fullPageDocument":true}'));
    expect(await checkIsReceipt("/objects/x", "image/jpeg")).toEqual({ isReceipt: true, fullPageDocument: true });
    create.mockResolvedValueOnce(reply('{"isReceipt":true,"fullPageDocument":"yes"}'));
    expect(await checkIsReceipt("/objects/x", "image/jpeg")).toEqual({ isReceipt: true, fullPageDocument: false });
    expect(create.mock.calls[0][0].messages[1].content[1].image_url.detail).toBeUndefined();
  });

  it("reads full-page documents at original detail and everything else at the default", async () => {
    create.mockResolvedValueOnce(reply('{"isReceipt":true,"legible":false}'));
    const data = await extractReceiptData("/objects/x", "image/jpeg", { fullPageDocument: true });
    expect(FULL_PAGE_IMAGE_DETAIL).toBe("original");
    expect(create.mock.calls[0][0].messages[1].content[1].image_url.detail).toBe("original");
    expect(data.legible).toBe(false);
    create.mockResolvedValueOnce(reply('{"isReceipt":true}'));
    await extractReceiptData("/objects/x", "image/jpeg", { fullPageDocument: false });
    expect(create.mock.calls[1][0].messages[1].content[1].image_url.detail).toBeUndefined();
    create.mockResolvedValueOnce(reply('{"isReceipt":true}'));
    await extractReceiptData("/objects/x", "image/jpeg");
    expect(create.mock.calls[2][0].messages[1].content[1].image_url.detail).toBeUndefined();
  });

  it("a small receipt that fails is not retried (no detail to drop)", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("bad request"), { status: 400 }));
    await expect(extractReceiptData("/objects/x", "image/jpeg")).rejects.toThrow("bad request");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default detail when the gateway rejects it with 400", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("bad detail"), { status: 400 }));
    create.mockResolvedValueOnce(reply('{"isReceipt":true,"legible":true}'));
    const data = await extractReceiptData("/objects/x", "image/jpeg", { fullPageDocument: true });
    expect(create.mock.calls[0][0].messages[1].content[1].image_url.detail).toBe("original");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[1].content[1].image_url.detail).toBeUndefined();
    expect(data.legible).toBe(true);
  });

  it("does not retry other errors, and PDFs carry no detail", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }));
    await expect(extractReceiptData("/objects/x", "image/jpeg", { fullPageDocument: true })).rejects.toThrow("down");
    expect(create).toHaveBeenCalledTimes(1);
    create.mockResolvedValueOnce(reply('{"isReceipt":true}'));
    const data = await extractReceiptData("/objects/x", "application/pdf", { fullPageDocument: true });
    expect(create.mock.calls[1][0].messages[1].content[1].type).toBe("file");
    expect(data.legible).toBeNull();
  });
});
