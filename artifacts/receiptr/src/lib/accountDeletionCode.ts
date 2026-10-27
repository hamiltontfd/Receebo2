/** Account deletion step 2: the 6-digit code emailed by POST /account/deletion-code. */

/** Keeps digits only (pasting "482 913" works), max 6. */
export function cleanDeletionCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isCompleteDeletionCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

// PLACEHOLDER COPY (marketing owns the final text).
export function deletionCodeSentMessage(sentTo: string | null | undefined): string {
  return `We emailed a 6-digit code to ${sentTo || "your email"}. It expires in 15 minutes.`;
}
