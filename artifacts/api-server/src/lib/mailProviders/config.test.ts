import { describe, expect, it } from "vitest";
import { enabledMailProviders, isMailProviderEnabled } from "./config";

describe("MAIL_PROVIDERS_ENABLED feature flag", () => {
  it("defaults to Outlook only (Gmail hidden) when unset", () => {
    expect(enabledMailProviders({})).toEqual(["outlook"]);
    expect(isMailProviderEnabled("gmail", {})).toBe(false);
    expect(isMailProviderEnabled("outlook", {})).toBe(true);
  });

  it("parses a comma list, trimming, lower-casing and de-duplicating", () => {
    expect(enabledMailProviders({ MAIL_PROVIDERS_ENABLED: " Gmail , outlook,gmail" }))
      .toEqual(["gmail", "outlook"]);
  });

  it("ignores unknown providers", () => {
    expect(enabledMailProviders({ MAIL_PROVIDERS_ENABLED: "yahoo,gmail" })).toEqual(["gmail"]);
  });

  it("disables everything with 'none' or an empty value", () => {
    expect(enabledMailProviders({ MAIL_PROVIDERS_ENABLED: "none" })).toEqual([]);
    expect(enabledMailProviders({ MAIL_PROVIDERS_ENABLED: "" })).toEqual([]);
    expect(isMailProviderEnabled("outlook", { MAIL_PROVIDERS_ENABLED: "" })).toBe(false);
  });
});
