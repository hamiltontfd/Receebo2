import { afterEach, describe, expect, it, vi } from "vitest";
import { getGmailConnectionUrl } from "./gmailConnection";
import { apiNavigationDenylist } from "./navigationRoutes";

afterEach(() => vi.unstubAllGlobals());

describe("Gmail connection", () => {
  it.each(["/", "/receiptr/"])("fetches an authenticated URL under %s", async (base) => {
    const url = "https://accounts.google.com/o/oauth2/v2/auth?state=test";
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url }),
    });
    vi.stubGlobal("fetch", request);
    await expect(getGmailConnectionUrl(base)).resolves.toBe(url);
    expect(request).toHaveBeenCalledWith(`${base}api/gmail/connect-url`, {
      credentials: "include",
      cache: "no-store",
    });
  });

  it("reports a failed request instead of navigating to an API page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(getGmailConnectionUrl("/")).rejects.toThrow("Could not start");
  });

  it.each([{}, { url: "https://example.com" }, { url: "javascript:alert(1)" }])(
    "rejects a missing or unsafe redirect: %j",
    async (data) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, json: async () => data,
      }));
      await expect(getGmailConnectionUrl("/")).rejects.toThrow();
    },
  );
});

describe("offline navigation exclusions", () => {
  it.each([
    "/api/gmail/connect", "/api/gmail/callback?code=example",
    "/receiptr/api/gmail/connect", "/api", "/api/billing/portal",
  ])("keeps %s out of the cached app shell", (path) => {
    expect(apiNavigationDenylist.some((pattern) => pattern.test(path))).toBe(true);
  });

  it.each(["/", "/settings", "/receipts/123", "/receiptr/settings"])(
    "keeps offline app navigation for %s",
    (path) => {
      expect(apiNavigationDenylist.some((pattern) => pattern.test(path))).toBe(false);
    },
  );
});
