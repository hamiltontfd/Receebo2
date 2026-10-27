import { describe, expect, it } from "vitest";
import { cleanDeletionCodeInput, deletionCodeSentMessage, isCompleteDeletionCode } from "./accountDeletionCode";

describe("account deletion code input", () => {
  it("keeps only digits, up to 6", () => {
    expect(cleanDeletionCodeInput("482 913")).toBe("482913");
    expect(cleanDeletionCodeInput("48-29-13-99")).toBe("482913");
    expect(cleanDeletionCodeInput("abc")).toBe("");
  });
  it("needs exactly 6 digits", () => {
    expect(isCompleteDeletionCode("482913")).toBe(true);
    expect(isCompleteDeletionCode("48291")).toBe(false);
  });
  it("says where the code went", () => {
    expect(deletionCodeSentMessage("a••@example.com")).toContain("a••@example.com");
    expect(deletionCodeSentMessage(null)).toContain("your email");
  });
});
