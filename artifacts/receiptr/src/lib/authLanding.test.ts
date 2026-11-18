import { describe, expect, it } from "vitest";
import { hasUsLanding, withUsLanding } from "./authLanding";

describe("display-only US authentication context", () => {
  const campaign = "utm_source=meta&utm_medium=paid_social&utm_campaign=trial&utm_content=sample&utm_term=broad&fbclid=synthetic";
  it.each(["/sign-in", "/sign-up"])("carries campaigns onto %s without private query fields", path => {
    const result = new URL(withUsLanding(path, `?${campaign}&private=omit`, true), "https://example.test");
    expect(result.searchParams.get("landing")).toBe("us");
    for (const [key, value] of new URLSearchParams(campaign)) expect(result.searchParams.get(key)).toBe(value);
    expect(result.searchParams.has("private")).toBe(false);
  });
  it.each(["/sign-in", "/sign-up", "/sign-up/verify-email-address", "/sign-in/factor-one"])(
    "preserves context through Clerk cross-links and intermediate route %s", path => {
      const result = withUsLanding(`${path}?clerk_step=keep#step`, `?landing=us&${campaign}`);
      const url = new URL(result, "https://example.test");
      expect(url.searchParams.get("landing")).toBe("us");
      expect(url.searchParams.get("clerk_step")).toBe("keep");
      expect(url.searchParams.get("fbclid")).toBe("synthetic");
      expect(url.hash).toBe("#step");
    },
  );
  it.each(["", "?landing=US", "?landing=br", "?landing=", "?utm_source=meta"])(
    "leaves default auth links unchanged for %s", search => {
      expect(hasUsLanding(search)).toBe(false);
      expect(withUsLanding("/sign-in", search)).toBe("/sign-in");
      expect(withUsLanding("/sign-up?existing=1", search)).toBe("/sign-up?existing=1");
    },
  );
  it("does not modify post-login destinations, external links or existing campaign fields", () => {
    expect(withUsLanding("/search", "?landing=us")).toBe("/search");
    expect(withUsLanding("https://example.test/sign-up", "?landing=us")).toBe("https://example.test/sign-up");
    expect(withUsLanding("//example.test/sign-up", "?landing=us")).toBe("//example.test/sign-up");
    expect(withUsLanding("/sign-up?utm_source=existing", "?landing=us&utm_source=meta"))
      .toBe("/sign-up?utm_source=existing&landing=us");
  });
});
