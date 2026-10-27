import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create } } },
}));
vi.mock("./objectStorage", () => ({ ObjectStorageService: class {} }));

import { EMAIL_PRECHECK_MAX_CHARS, EMAIL_PRECHECK_MODEL, precheckEmailIsReceipt } from "./receiptExtraction";

const reply = (content: string) => ({ choices: [{ message: { content } }] });

afterEach(() => create.mockReset());

describe("precheckEmailIsReceipt", () => {
  it("uses the cheap model with a short, truncated input", async () => {
    create.mockResolvedValue(reply('{"isReceipt":true}'));
    expect(await precheckEmailIsReceipt("x".repeat(10_000), { subject: "Order", from: "a@b.c" })).toBe(true);
    const args = create.mock.calls[0][0];
    expect(args.model).toBe(EMAIL_PRECHECK_MODEL);
    expect(args.model).not.toBe("gpt-5.4");
    expect(args.max_completion_tokens).toBeLessThanOrEqual(50);
    const user = args.messages[1].content as string;
    expect(user).toContain("Subject: Order");
    expect(user.length).toBeLessThan(EMAIL_PRECHECK_MAX_CHARS + 100);
  });

  it("rejects only on an explicit isReceipt=false", async () => {
    create.mockResolvedValueOnce(reply('{"isReceipt":false}'));
    expect(await precheckEmailIsReceipt("newsletter")).toBe(false);
    create.mockResolvedValueOnce(reply("{}"));
    expect(await precheckEmailIsReceipt("?")).toBe(true);
    create.mockResolvedValueOnce(reply("not json"));
    expect(await precheckEmailIsReceipt("?")).toBe(true);
  });

  it("fails open when the model call errors", async () => {
    create.mockRejectedValueOnce(new Error("503"));
    expect(await precheckEmailIsReceipt("order")).toBe(true);
  });
});
