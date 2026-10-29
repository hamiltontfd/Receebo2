import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("US store table", () => {
  it("is byte-identical in the API and the web app", () => {
    const api = readFileSync(path.resolve(__dirname, "usStorePolicies.ts"), "utf8");
    const web = readFileSync(path.resolve(__dirname, "../../../receiptr/src/lib/usStorePolicies.ts"), "utf8");
    expect(api).toBe(web);
  });
});
