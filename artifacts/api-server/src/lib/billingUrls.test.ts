import { describe, expect, it } from "vitest";
import { billingOrigin } from "./billingUrls";

describe("trusted billing redirect origins", () => {
  it("uses the verified production origin, ignoring a leftover workspace domain", () => {
    expect(billingOrigin({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "workspace.replit.dev" }))
      .toBe("https://receebo.net");
    expect(billingOrigin({ NODE_ENV: "production" })).toBe("https://receebo.net");
  });
  it("keeps preview checkouts and portal returns inside development", () => {
    expect(billingOrigin({
      NODE_ENV: "development",
      REPLIT_DEV_DOMAIN: "workspace.janeway.replit.dev",
    })).toBe("https://workspace.janeway.replit.dev");
  });
  it.each([
    undefined, "", "receebo.net", "https://workspace.replit.dev",
    "workspace.replit.dev.evil.example", "workspace.replit.dev/path",
    "workspace.replit.dev?next=evil", "evil@workspace.replit.dev",
    "workspace.replit.dev:443", "workspace.replit.dev\n",
  ])("rejects unsafe or missing development configuration: %s", (domain) => {
    expect(() => billingOrigin({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: domain })).toThrow();
  });
});
