import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMailConnectionUrl,
  normalizeMailStatus,
  readMailOAuthResult,
} from "./mailConnection";

afterEach(() => vi.unstubAllGlobals());

describe("Outlook connection URL", () => {
  it("fetches the authenticated Outlook URL", async () => {
    const url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=t";
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) });
    vi.stubGlobal("fetch", request);
    await expect(getMailConnectionUrl("/", "outlook")).resolves.toBe(url);
    expect(request).toHaveBeenCalledWith("/api/outlook/connect-url", {
      credentials: "include",
      cache: "no-store",
    });
  });

  it.each([
    "https://accounts.google.com/o/oauth2/v2/auth",
    "https://login.microsoftonline.com.evil.example/authorize",
    "javascript:alert(1)",
  ])("rejects a non-Microsoft redirect: %s", async (url) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) }));
    await expect(getMailConnectionUrl("/", "outlook")).rejects.toThrow();
  });

  it("does not accept a Microsoft URL for Gmail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize" }),
    }));
    await expect(getMailConnectionUrl("/", "gmail")).rejects.toThrow("unexpected address");
  });
});

describe("mail status helpers", () => {
  it("tolerates partial responses", () => {
    expect(normalizeMailStatus({ optOut: false })).toEqual({
      enabledProviders: [], providers: [], needsReconnect: false, pendingCount: 0,
    });
  });

  it("flags reconnect only for enabled providers", () => {
    const base = { label: "x", configured: true, connected: true, accountEmail: null, lastSyncedAt: null };
    expect(normalizeMailStatus({
      providers: [{ ...base, id: "gmail", enabled: false, needsReconnect: true }],
    }).needsReconnect).toBe(false);
    expect(normalizeMailStatus({
      providers: [{ ...base, id: "outlook", enabled: true, needsReconnect: true }],
    }).needsReconnect).toBe(true);
  });

  it("reads the OAuth redirect result for either provider", () => {
    expect(readMailOAuthResult("?outlook=connected")).toEqual({ provider: "outlook", result: "connected" });
    expect(readMailOAuthResult("?gmail=error")).toEqual({ provider: "gmail", result: "error" });
    expect(readMailOAuthResult("?checkout=success")).toBeNull();
  });
});
