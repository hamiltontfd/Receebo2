import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, clearActionCooldowns, customFetch, setGuestId } from "@workspace/api-client-react";
import { actionWaitMessage, receiptPollInterval } from "./actionLimit";
import { setAccountLocale } from "./locale";
import { syncMail } from "./mailConnection";

let now = 1_800_000_000_000;
beforeEach(() => {
  clearActionCooldowns();
  setAccountLocale("en");
  now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => {
  clearActionCooldowns();
  setGuestId(null);
  setAccountLocale(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function limited(status = 429, retry = "30") {
  return new Response(JSON.stringify({ code: status === 429 ? "ACTION_RATE_LIMITED" : "ACTION_LIMIT_UNAVAILABLE" }), {
    status, headers: { "Content-Type": "application/json", "Retry-After": retry },
  });
}
describe("action wait and recovery", () => {
  it("shares the sync wait across aliases, sends no requests early, then recovers", async () => {
    const network = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(
      new Response(JSON.stringify({ checked: 1, queued: 0 }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", network);
    await expect(syncMail("/")).rejects.toMatchObject({ status: 429 });
    now += 5000;
    for (const alias of ["gmail", "outlook", "mail"]) {
      await expect(customFetch(`/api/${alias}/sync`, { method: "POST" })).rejects.toMatchObject({ status: 429 });
    }
    expect(network).toHaveBeenCalledTimes(1);
    now += 25000;
    expect(await syncMail("/")).toEqual({ checked: 1, queued: 0 });
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("shares search/read wait without affecting uploads; user switch clears client waits", async () => {
    const network = vi.fn().mockResolvedValueOnce(limited()).mockImplementation(async () =>
      new Response("{}", { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", network);
    await expect(customFetch("/api/receipts?q=a")).rejects.toMatchObject({ status: 429 });
    await expect(customFetch("/api/receipts?q=b")).rejects.toMatchObject({ status: 429 });
    await expect(customFetch("/api/receipts/1")).rejects.toMatchObject({ status: 429 });
    expect(network).toHaveBeenCalledTimes(1);
    await customFetch("/api/storage/uploads/request-url", { method: "POST", body: "{}" });
    expect(network).toHaveBeenCalledTimes(2);
    setGuestId("another-guest");
    await customFetch("/api/receipts");
    expect(network).toHaveBeenCalledTimes(3);
  });
  it("handles limiter 503 and HTTP-date Retry-After without automatic retries", async () => {
    const deadline = new Date(now + 10000).toUTCString();
    const network = vi.fn().mockImplementation(async () => limited(503, deadline));
    vi.stubGlobal("fetch", network);
    await expect(customFetch("/api/storage/uploads/request-url", { method: "POST" })).rejects.toMatchObject({ status: 503 });
    await expect(customFetch("/api/storage/uploads/request-url", { method: "POST" })).rejects.toMatchObject({ status: 503 });
    expect(network).toHaveBeenCalledTimes(1);
    now += 10000;
    await expect(customFetch("/api/storage/uploads/request-url", { method: "POST" })).rejects.toMatchObject({ status: 503 });
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("localizes wait in all languages and delays polling without deleting its data", () => {
    const error = new ApiError(limited(), { code: "ACTION_RATE_LIMITED" }, { method: "GET", url: "/api/receipts/1" });
    for (const [locale, text] of [["en", "Please wait 30 seconds"], ["pt-PT", "Aguarde 30 segundos"], ["pt-BR", "Aguarde 30 segundos"]] as const) {
      setAccountLocale(locale);
      expect(actionWaitMessage(error)).toContain(text);
    }
    const state = { error, errorUpdatedAt: now, data: { status: "processing" } };
    expect(receiptPollInterval({ state })).toBe(30000);
    now += 5000;
    expect(receiptPollInterval({ state })).toBe(25000);
    expect(state.data.status).toBe("processing");
    expect(receiptPollInterval({ state: { ...state, error: null } })).toBe(2000);
    expect(actionWaitMessage(new Error("other"))).toBeNull();
  });
});
