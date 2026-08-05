/**
 * AES-256-GCM symmetric encryption for Gmail OAuth tokens at rest.
 *
 * Encrypted format (stored in DB):  `enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 * Plaintext values do NOT start with `enc:v1:` — used to detect unencrypted legacy rows
 * and trigger an in-place migration on first read.
 *
 * Key: GMAIL_TOKEN_ENCRYPTION_KEY env var — 64-char hex string (32 raw bytes).
 * Generate with:  openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const TAG_BYTES = 16;
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.trim().length === 0) {
    throw new Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY is not set. " +
        "Generate one with `openssl rand -hex 32` and add it as a Replit Secret.",
    );
  }
  const trimmed = hex.trim();
  if (trimmed.length !== 64) {
    throw new Error(
      `GMAIL_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes), ` +
        `got ${trimmed.length} characters.`,
    );
  }
  return Buffer.from(trimmed, "hex");
}

/**
 * Encrypt a plaintext token string.
 * Returns the `enc:v1:…` encoded ciphertext to store in the DB.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return (
    PREFIX +
    iv.toString("hex") +
    ":" +
    authTag.toString("hex") +
    ":" +
    ciphertext.toString("hex")
  );
}

/**
 * Decrypt a token value from the DB.
 *
 * - If the value starts with `enc:v1:` it is decrypted normally.
 * - If it does NOT (legacy plaintext row), the raw value is returned as-is
 *   so the caller can re-encrypt and persist it.
 *
 * `isPlaintext` in the result lets the caller know re-encryption is needed.
 */
export function decryptToken(stored: string): {
  plaintext: string;
  wasPlaintext: boolean;
} {
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext token — return it so the caller can re-encrypt
    return { plaintext: stored, wasPlaintext: true };
  }

  const rest = stored.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 3) {
    throw new Error("tokenCrypto: malformed encrypted token (wrong segment count)");
  }

  const key = getKey();
  const iv = Buffer.from(parts[0]!, "hex");
  const authTag = Buffer.from(parts[1]!, "hex");
  const ciphertext = Buffer.from(parts[2]!, "hex");

  if (iv.length !== IV_BYTES) {
    throw new Error(`tokenCrypto: IV length ${iv.length} != ${IV_BYTES}`);
  }
  if (authTag.length !== TAG_BYTES) {
    throw new Error(`tokenCrypto: authTag length ${authTag.length} != ${TAG_BYTES}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  return { plaintext, wasPlaintext: false };
}

/**
 * Convenience: decrypt a nullable token (returns null for null input).
 * Re-encrypts and persists the updated value if the stored token was plaintext,
 * using the provided `persist` callback.
 */
export async function decryptNullableToken(
  stored: string | null,
  persist: (encrypted: string) => Promise<void>,
): Promise<string | null> {
  if (stored === null) return null;
  try {
    const { plaintext, wasPlaintext } = decryptToken(stored);
    if (wasPlaintext) {
      // Migrate legacy plaintext in the background — don't block the caller
      const encrypted = encryptToken(plaintext);
      persist(encrypted).catch((err) =>
        logger.warn({ err }, "tokenCrypto: failed to re-encrypt legacy token"),
      );
    }
    return plaintext;
  } catch (err) {
    logger.error({ err }, "tokenCrypto: decryption failed");
    throw err;
  }
}
