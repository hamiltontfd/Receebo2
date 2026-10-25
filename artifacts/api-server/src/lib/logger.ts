import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

// Google client errors may embed credentials in config, response, cause,
// message, stack, or toJSON(). Never serialize the original error for Gmail.
// Even code fields are untrusted: emit only known diagnostic constants.
const safeGmailErrorCodes = new Set([
  "invalid_request", "invalid_client", "invalid_grant", "invalid_scope",
  "unauthorized_client", "unsupported_grant_type", "access_denied",
  "redirect_uri_mismatch", "server_error", "temporarily_unavailable",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "ERR_NETWORK", "ERR_CANCELED",
  "UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED",
  "NOT_FOUND", "INVALID_ARGUMENT", "INTERNAL", "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

export function serializeGmailError(error: unknown): {
  code: string;
  status?: number;
} {
  const err = asRecord(error);
  const response = asRecord(err.response);
  const data = asRecord(response.data);
  const apiError = asRecord(data.error);
  const code = [data.error, apiError.status, err.code].find(
    (value): value is string =>
      typeof value === "string" && safeGmailErrorCodes.has(value),
  ) ?? "unknown_error";
  const status = [response.status, err.status, err.statusCode, err.code].find(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) &&
      value >= 400 && value <= 599,
  );
  return { code, ...(status === undefined ? {} : { status }) };
}

export function createGmailLogger(baseLogger: pino.Logger): pino.Logger {
  return baseLogger.child(
    { integration: "gmail" },
    { serializers: { err: serializeGmailError } },
  );
}

export const gmailLogger = createGmailLogger(logger);
