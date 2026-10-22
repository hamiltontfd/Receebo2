import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { gmailOrigin } from "./gmailUrls";

function request(host: string, protocol = "http"): Pick<Request, "protocol" | "get"> {
  return { protocol, get: (() => host) as Request["get"] };
}

describe("Gmail OAuth origin", () => {
  it("uses the canonical HTTPS origin behind the production proxy", () => {
    expect(gmailOrigin(request("localhost:8080"), { NODE_ENV: "production" }))
      .toBe("https://receebo.net");
  });

  it("ignores workspace domain variables in production", () => {
    expect(gmailOrigin(request("internal-host"), {
      NODE_ENV: "production",
      REPLIT_DEV_DOMAIN: "workspace.example.replit.dev",
    })).toBe("https://receebo.net");
  });

  it("does not let an alternate host change the production callback", () => {
    expect(gmailOrigin(request("untrusted.example"), { NODE_ENV: "production" }))
      .toBe("https://receebo.net");
  });

  it("keeps development OAuth on the workspace domain", () => {
    expect(gmailOrigin(request("localhost"), {
      NODE_ENV: "development",
      REPLIT_DEV_DOMAIN: "workspace.example.replit.dev",
    })).toBe("https://workspace.example.replit.dev");
  });

  it("supports local development without a workspace domain", () => {
    expect(gmailOrigin(request("localhost:8080"), { NODE_ENV: "development" }))
      .toBe("http://localhost:8080");
  });
});
