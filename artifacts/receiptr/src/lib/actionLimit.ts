import { temporaryActionError, retryAfterSeconds } from "@workspace/api-client-react";
import { appText } from "./appCopy";

export { temporaryActionError };
export function actionWaitMessage(error: unknown): string | null {
  if (!temporaryActionError(error)) return null;
  return appText("Please wait {0} seconds, then try again. Your file and drafts are kept.", [retryAfterSeconds(error)]);
}

/** Polling pauses until the server's deadline, without repeatedly hitting 429. */
export function receiptPollInterval(query: { state: { error: unknown; errorUpdatedAt: number; data?: { status: string } } }): number | false {
  if (temporaryActionError(query.state.error)) {
    return Math.max(1000, query.state.errorUpdatedAt +
      retryAfterSeconds(query.state.error) * 1000 - Date.now());
  }
  return query.state.data?.status === "processing" ? 2000 : false;
}
