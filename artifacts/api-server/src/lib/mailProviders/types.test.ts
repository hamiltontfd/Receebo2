import { describe, expect, it } from "vitest";
import { MailReconnectRequiredError, isReconnectRequiredError } from "./types";
import { OutlookOAuthError } from "../outlookGraph";

describe("needs_reconnect classification", () => {
  it("recognises Google invalid_grant (google-auth-library shape)", () => {
    expect(isReconnectRequiredError({ response: { status: 400, data: { error: "invalid_grant" } } }))
      .toBe(true);
  });

  it("recognises Microsoft token errors", () => {
    expect(isReconnectRequiredError(new OutlookOAuthError(400, "invalid_grant"))).toBe(true);
    expect(isReconnectRequiredError(new OutlookOAuthError(400, "interaction_required"))).toBe(true);
  });

  it("recognises our own error", () => {
    expect(isReconnectRequiredError(new MailReconnectRequiredError("outlook"))).toBe(true);
  });

  it("does not treat transient failures as reconnect", () => {
    expect(isReconnectRequiredError(new OutlookOAuthError(503, "temporarily_unavailable"))).toBe(false);
    expect(isReconnectRequiredError(new Error("network down"))).toBe(false);
    expect(isReconnectRequiredError({ code: "ECONNRESET" })).toBe(false);
  });
});
