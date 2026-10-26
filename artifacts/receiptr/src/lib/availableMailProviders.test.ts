import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAvailableMailProviders,
  inboxPhrase,
  outlookAccountsNote,
  parseAvailableMailProviders,
  providerNames,
  resetAvailableMailProvidersCache,
} from "./availableMailProviders";

const outlook = { id: "outlook" as const, label: "Outlook" };
const gmail = { id: "gmail" as const, label: "Gmail" };

afterEach(() => {
  resetAvailableMailProvidersCache();
  vi.unstubAllGlobals();
});

describe("available mail provider copy", () => {
  it("names the providers that are switched on", () => {
    expect(providerNames([])).toBeNull();
    expect(providerNames([outlook])).toBe("Outlook");
    expect(providerNames([gmail, outlook])).toBe("Gmail or Outlook");
    expect(inboxPhrase([])).toBe("your inbox");
    expect(inboxPhrase([outlook])).toBe("your Outlook inbox");
  });

  it("adds the Microsoft account note only when Outlook is offered", () => {
    expect(outlookAccountsNote([outlook])).toMatch(/Hotmail/);
    expect(outlookAccountsNote([gmail])).toBeNull();
  });

  it("drops unknown or malformed providers", () => {
    expect(
      parseAvailableMailProviders({ providers: [outlook, { id: "yahoo", label: "Yahoo" }, null] }),
    ).toEqual([outlook]);
    expect(parseAvailableMailProviders(null)).toEqual([]);
  });

  it("falls back to no providers when the endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchAvailableMailProviders()).resolves.toEqual([]);
  });

  it("reads the public endpoint once and caches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ providers: [outlook] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAvailableMailProviders()).resolves.toEqual([outlook]);
    await fetchAvailableMailProviders();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/api\/mail\/providers$/);
  });
});
