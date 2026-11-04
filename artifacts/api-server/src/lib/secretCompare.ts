import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of a provided secret (header, query) with the
 * expected one. Both are hashed first, so neither the content nor the length
 * leaks through timing. False when either side is missing or empty.
 */
export function secretMatches(provided: unknown, expected: string | undefined | null): boolean {
  if (!expected || typeof provided !== "string" || provided.length === 0) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
