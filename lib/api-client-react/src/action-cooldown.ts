import { ApiError } from "./custom-fetch";

export function temporaryActionError(error: unknown): error is ApiError {
  return error instanceof ApiError &&
    (error.status === 429 || (error.status === 503 &&
      (error.data as { code?: string } | null)?.code === "ACTION_LIMIT_UNAVAILABLE"));
}

export function retryAfterSeconds(error: unknown): number {
  if (!temporaryActionError(error)) return 0;
  const raw = error.headers.get("Retry-After");
  const seconds = raw && /^\d+$/.test(raw) ? Number(raw)
    : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : 0;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : 60;
}
