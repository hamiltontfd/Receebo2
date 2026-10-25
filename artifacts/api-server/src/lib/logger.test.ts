import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { createGmailLogger, serializeGmailError } from "./logger";

const secrets = {
  client_secret: "SYNTHETIC-client-secret",
  code: "SYNTHETIC-authorization-code",
  access_token: "SYNTHETIC-access-token",
  refresh_token: "SYNTHETIC-refresh-token",
  state: "SYNTHETIC-oauth-state",
  email: "synthetic-private-email@example.invalid",
  subject: "SYNTHETIC-private-subject",
  body: "SYNTHETIC-private-email-body",
};

function capture() {
  let output = "";
  const base = pino({ level: "trace" }, {
    write: (line: string) => { output += line; },
  });
  return { log: createGmailLogger(base), output: () => output };
}

describe("Gmail log serialization", () => {
  it.each(["exchange", "refresh", "revocation", "message fetch"])(
    "omits all nested Google client data for %s failures",
    (operation) => {
      const { log, output } = capture();
      const privateText = JSON.stringify(secrets);
      const toJSON = vi.fn(() => secrets);
      const err = Object.assign(new Error(privateText), {
        code: "400",
        config: {
          url: `https://oauth2.googleapis.com/token?${new URLSearchParams(secrets)}`,
          headers: { Authorization: `Bearer ${secrets.access_token}` },
          data: new URLSearchParams(secrets).toString(),
          body: secrets,
        },
        response: {
          status: 400,
          config: { data: secrets },
          headers: { authorization: secrets.refresh_token },
          data: { error: "invalid_grant", error_description: privateText, ...secrets },
        },
        credentials: secrets,
        cause: new Error(privateText),
        errors: [secrets],
        toJSON,
      });
      log.error({ err, operation }, "Gmail operation failed");
      const line = output();
      expect(JSON.parse(line).err).toEqual({ code: "invalid_grant", status: 400 });
      expect(JSON.parse(line).integration).toBe("gmail");
      for (const secret of Object.values(secrets)) expect(line).not.toContain(secret);
      for (const key of ["stack", "config", "credentials", "cause", "error_description"]) {
        expect(JSON.parse(line).err).not.toHaveProperty(key);
      }
      expect(toJSON).not.toHaveBeenCalled();
    },
  );

  it.each(Object.values(secrets))("does not trust arbitrary code strings: %s", (secret) => {
    const { log, output } = capture();
    log.warn({
      err: {
        code: secret,
        status: secret,
        response: { status: secret, data: { error: secret } },
      },
    }, "Gmail callback failed");
    expect(JSON.parse(output()).err).toEqual({ code: "unknown_error" });
    expect(output()).not.toContain(secret);
  });

  it.each([
    [{ code: "ECONNRESET" }, { code: "ECONNRESET" }],
    [{ code: 503 }, { code: "unknown_error", status: 503 }],
    [{ statusCode: 401 }, { code: "unknown_error", status: 401 }],
    [{ response: { status: 403, data: { error: { status: "PERMISSION_DENIED" } } } },
      { code: "PERMISSION_DENIED", status: 403 }],
    [{ status: 200 }, { code: "unknown_error" }],
    [{ status: 400.5 }, { code: "unknown_error" }],
    [{ status: "401" }, { code: "unknown_error" }],
  ])("retains only recognized codes and error HTTP statuses", (err, expected) => {
    expect(serializeGmailError(err)).toEqual(expected);
  });

  it.each([null, undefined, secrets.body, new Error(secrets.body), { cause: secrets }])(
    "handles non-Google errors without logging their contents",
    (err) => {
      const { log, output } = capture();
      log.error({ err }, "Gmail operation failed");
      // Pino omits undefined fields before invoking their serializer.
      expect(JSON.parse(output()).err).toEqual(
        err === undefined ? undefined : { code: "unknown_error" },
      );
      for (const secret of Object.values(secrets)) expect(output()).not.toContain(secret);
    },
  );

  it("does not traverse circular causes or call custom serializers", () => {
    const err = { code: "invalid_client", cause: {} };
    err.cause = err;
    const { log, output } = capture();
    log.error({ err }, "Gmail operation failed");
    expect(JSON.parse(output()).err).toEqual({ code: "invalid_client" });
  });
});
