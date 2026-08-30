import { describe, expect, it, vi } from "vitest";
import { createLegalAcceptanceMiddleware } from "./legalAcceptance";

function responseDouble() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json };
}

describe("current legal acceptance middleware", () => {
  it("blocks an authenticated direct API call without current acceptance", async () => {
    const check = vi.fn().mockResolvedValue(false);
    const middleware = createLegalAcceptanceMiddleware(check);
    const res = responseDouble();
    const next = vi.fn();

    await middleware({ userId: "user_123" } as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(428);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LEGAL_ACCEPTANCE_REQUIRED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a direct API call only after current acceptance is verified", async () => {
    const middleware = createLegalAcceptanceMiddleware(
      vi.fn().mockResolvedValue(true),
    );
    const res = responseDouble();
    const next = vi.fn();

    await middleware({ userId: "user_123" } as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails closed when acceptance verification is unavailable", async () => {
    const middleware = createLegalAcceptanceMiddleware(
      vi.fn().mockRejectedValue(new Error("database unavailable")),
    );
    const res = responseDouble();

    await middleware({ userId: "user_123" } as any, res as any, vi.fn());

    expect(res.status).toHaveBeenCalledWith(503);
  });
});