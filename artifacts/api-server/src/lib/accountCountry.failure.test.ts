import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  userPreferencesTable: { country: "country", userId: "user_id" },
  db: { select: () => { throw new Error("fixture database unavailable"); } },
}));
vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));
import { countryForRequest } from "./accountCountry";

describe("country persistence failures never block the request", () => {
  it("returns detected country on a read/write failure, but never invents unknown", async () => {
    expect(await countryForRequest("fixture", "PT")).toBe("PT");
    expect(await countryForRequest("fixture", null)).toBeNull();
  });
});
