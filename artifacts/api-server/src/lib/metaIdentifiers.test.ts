import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ db: { execute: vi.fn(() => { throw new Error("No database calls allowed"); }) } }));
import { storedMetaIdentifiers } from "./adAttributionStore";

describe("first-touch CAPI identifiers (no database)", () => {
  it("uses stored fbc before deriving it and keeps fbp", () => {
    expect(storedMetaIdentifiers({ fbc: "stored", fbclid: "click", fbp: "browser", captured_at: "2026-11-17T12:00:00Z" }))
      .toEqual({ fbc: "stored", fbp: "browser" });
  });
  it("derives fbc from the stored click and captured-at milliseconds", () => {
    const captured_at = "2026-11-17T12:00:00Z";
    expect(storedMetaIdentifiers({ fbclid: "synthetic-click", captured_at }))
      .toEqual({ fbc: `fb.1.${Date.parse(captured_at)}.synthetic-click` });
  });
  it("does not invent a capture time or a click", () => {
    expect(storedMetaIdentifiers()).toEqual({});
    expect(storedMetaIdentifiers({ fbclid: "click", captured_at: "bad" })).toEqual({});
    expect(storedMetaIdentifiers({ captured_at: new Date() })).toEqual({});
  });
});
