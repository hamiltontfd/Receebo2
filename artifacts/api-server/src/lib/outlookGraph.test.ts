import { describe, expect, it, vi } from "vitest";
import {
  OutlookGraphError,
  OutlookOAuthError,
  buildOutlookAuthUrl,
  downloadOutlookAttachment,
  exchangeOutlookCode,
  getOutlookConfig,
  getOutlookMessage,
  graphGet,
  listOutlookCandidateIds,
  refreshOutlookToken,
} from "./outlookGraph";
import { isReconnectRequiredError } from "./mailProviders/types";

const config = { clientId: "synthetic-client", clientSecret: "SYNTHETIC-secret", tenant: "common" };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const cancel = vi.fn().mockResolvedValue(undefined);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    body: { cancel },
  } as unknown as Response;
}

describe("Outlook configuration", () => {
  it("is inert without client id and secret", () => {
    expect(getOutlookConfig({})).toBeNull();
    expect(getOutlookConfig({ MICROSOFT_CLIENT_ID: "id" })).toBeNull();
  });

  it("defaults the tenant to common", () => {
    expect(getOutlookConfig({ MICROSOFT_CLIENT_ID: "id", MICROSOFT_CLIENT_SECRET: "s" }))
      .toEqual({ clientId: "id", clientSecret: "s", tenant: "common" });
    expect(getOutlookConfig({
      MICROSOFT_CLIENT_ID: "id", MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_TENANT: "consumers",
    })?.tenant).toBe("consumers");
  });

  it("builds the Microsoft authorize URL with read-only mail scopes", () => {
    const url = new URL(buildOutlookAuthUrl(config, "https://receebo.net/api/outlook/callback", "st"));
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe("/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://receebo.net/api/outlook/callback");
    expect(url.searchParams.get("scope")!.split(" ").sort())
      .toEqual(["Mail.Read", "User.Read", "email", "offline_access", "openid"]);
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });
});

describe("Outlook token requests", () => {
  it("exchanges an authorization code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      access_token: "AT", refresh_token: "RT", expires_in: 3600,
    }));
    const tokens = await exchangeOutlookCode(config, "CODE", "https://x/cb", fetchImpl);
    expect(tokens.accessToken).toBe("AT");
    expect(tokens.refreshToken).toBe("RT");
    expect(tokens.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("CODE");
  });

  it("returns the rotated refresh token on refresh", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      access_token: "AT2", refresh_token: "RT2", expires_in: 3600,
    }));
    const tokens = await refreshOutlookToken(config, "RT1", fetchImpl);
    expect(tokens.refreshToken).toBe("RT2");
    const body = new URLSearchParams(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("RT1");
  });

  it("maps invalid_grant to a reconnect-required error without leaking the body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, {
      error: "invalid_grant", error_description: "AADSTS700082: SYNTHETIC-private",
    }));
    const err = await refreshOutlookToken(config, "RT", fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(OutlookOAuthError);
    expect(err.code).toBe("invalid_grant");
    expect(err.status).toBe(400);
    expect(String(err.message)).not.toContain("SYNTHETIC");
    expect(isReconnectRequiredError(err)).toBe(true);
  });

  it("does not ask for reconnect on transient token failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, { error: "temporarily_unavailable" }));
    const err = await refreshOutlookToken(config, "RT", fetchImpl).catch((e) => e);
    expect(isReconnectRequiredError(err)).toBe(false);
  });
});

describe("Microsoft Graph client", () => {
  it("retries 429 using Retry-After, then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "Retry-After": "7" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    await expect(graphGet("AT", "/me", { fetchImpl, sleep })).resolves.toEqual({ ok: 1 });
    expect(sleep).toHaveBeenCalledWith(7000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after max retries and never reads the error body", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const res = jsonResponse(429, { secret: "SYNTHETIC-mail" }, { "Retry-After": "1" });
    const fetchImpl = vi.fn().mockResolvedValue(res);
    const err = await graphGet("AT", "/me", { fetchImpl, sleep, maxRetries: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(OutlookGraphError);
    expect(err.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.json).not.toHaveBeenCalled();
    expect(res.text).not.toHaveBeenCalled();
  });

  it("refuses to send the token outside Microsoft Graph", async () => {
    const fetchImpl = vi.fn();
    await expect(graphGet("AT", "https://evil.example/v1.0/me", { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lists last-90-day candidates across pages and filters in code", async () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        value: [
          { id: "1", subject: "Your Amazon.es order", from: { emailAddress: { address: "auto-confirm@amazon.es" } } },
          { id: "2", subject: "Lunch?", from: { emailAddress: { address: "friend@example.com" } } },
        ],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        value: [
          { id: "3", subject: "Fatura n.º 12", from: { emailAddress: { address: "billing@shop.pt" } } },
          { id: "4", subject: "Newsletter: order now", from: { emailAddress: { address: "news@shop.pt" } } },
        ],
      }));
    const ids = await listOutlookCandidateIds("AT", { fetchImpl, now });
    expect(ids).toEqual(["1", "3"]);
    const firstUrl = decodeURIComponent(fetchImpl.mock.calls[0]![0] as string);
    expect(firstUrl).toContain("/me/messages?$filter=receivedDateTime ge 2026-07-28T12:00:00.000Z");
    expect(firstUrl).toContain("$orderby=receivedDateTime desc");
    expect(fetchImpl.mock.calls[1]![0]).toBe("https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc");
    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe("Bearer AT");
  });

  it("returns the best purchase candidates first and never lists grocery/utility senders", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(200, {
      value: [
        { id: "unknown", subject: "Fatura n.º 12", from: { emailAddress: { address: "billing@shop.pt" } } },
        { id: "edp", subject: "Fatura", from: { emailAddress: { name: "EDP Comercial", address: "faturas@edp.pt" } } },
        { id: "worten", subject: "Fatura da encomenda", hasAttachments: true, from: { emailAddress: { address: "faturas@worten.pt" } } },
        { id: "continente", subject: "Recibo", from: { emailAddress: { address: "recibos@continente.pt" } } },
        { id: "amazon", subject: "Your Amazon.es order", from: { emailAddress: { address: "auto-confirm@amazon.es" } } },
      ],
    }));
    expect(await listOutlookCandidateIds("AT", { fetchImpl })).toEqual(["worten", "amazon", "unknown"]);
  });

  it("stops at the per-run candidate cap", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      value: Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, subject: "Your order" })),
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next",
    }));
    const ids = await listOutlookCandidateIds("AT", { fetchImpl, maxCandidates: 60 });
    expect(ids).toHaveLength(60);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reads a message with HTML body and only non-inline PDF file attachments", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        id: "m/1=", subject: "Invoice", hasAttachments: true,
        from: { emailAddress: { name: "Shop", address: "billing@shop.pt" } },
        receivedDateTime: "2026-10-20T10:00:00Z",
        body: { contentType: "html", content: "<p>Total 10€</p>" },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        value: [
          { "@odata.type": "#microsoft.graph.fileAttachment", id: "a1", name: "invoice.pdf", contentType: "application/pdf", size: 1000 },
          { "@odata.type": "#microsoft.graph.fileAttachment", id: "a2", name: "logo.png", contentType: "image/png", isInline: true },
          { "@odata.type": "#microsoft.graph.fileAttachment", id: "a3", name: "scan.PDF", contentType: "application/octet-stream" },
          { "@odata.type": "#microsoft.graph.itemAttachment", id: "a4", name: "fwd.pdf" },
        ],
      }));
    const msg = await getOutlookMessage("AT", "m/1=", { fetchImpl });
    expect(msg).toEqual({
      id: "m/1=",
      subject: "Invoice",
      from: "Shop <billing@shop.pt>",
      receivedAt: "2026-10-20T10:00:00Z",
      pdfAttachments: [{ id: "a1", filename: "invoice.pdf" }, { id: "a3", filename: "scan.PDF" }],
      html: "<p>Total 10€</p>",
      text: null,
    });
    expect(fetchImpl.mock.calls[0]![0]).toContain("/me/messages/m%2F1%3D?");
    expect(fetchImpl.mock.calls[0]![1].headers.Prefer).toBe('outlook.body-content-type="html"');
  });

  it("downloads attachment bytes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      contentBytes: Buffer.from("%PDF-1.4").toString("base64"),
    }));
    const buf = await downloadOutlookAttachment("AT", "m1", "a1", { fetchImpl });
    expect(buf.toString()).toBe("%PDF-1.4");
  });
});
