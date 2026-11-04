/**
 * Application-level encryption for content columns (receipts text, items,
 * pending imports, linked mailbox addresses, push keys). See docs/data-encryption.md.
 *
 * Envelope (stored in the column, or as a JSON string inside a jsonb column):
 *   enc:v1:<keyId>:<iv>:<tag>:<ciphertext>
 *   - keyId: 8 hex chars derived from the key (HMAC), so a key ring can hold
 *     several keys and rotation needs no format change
 *   - iv (12 bytes), tag (16 bytes), ciphertext: base64url
 *   - AES-256-GCM with the field name ("receipts.ocr_text") as additional
 *     authenticated data, so a ciphertext cannot be moved to another column.
 *
 * Keys: DATA_ENCRYPTION_KEY (current, used for writes) and optional
 * DATA_ENCRYPTION_KEY_PREVIOUS (comma-separated; read only). Each key is 32
 * bytes as 64 hex chars or base64/base64url.
 *
 * Without a valid DATA_ENCRYPTION_KEY, writes stay plaintext exactly as before
 * (warning logged once). Reads always accept legacy plaintext. A value that
 * cannot be decrypted never throws: the field reads as its fallback (null / [])
 * and only the field name, key id and a ciphertext fingerprint are logged.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const FIELD_ENVELOPE_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_RE = /^enc:v1:([0-9a-f]{8}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]*)$/;

export type FieldCryptoLog = (level: "warn" | "error", message: string, details?: Record<string, unknown>) => void;
let log: FieldCryptoLog = (level, message, details) =>
  (level === "error" ? console.error : console.warn)(message, details ?? {});
/** The API server routes these messages to its pino logger. */
export function setFieldCryptoLogger(next: FieldCryptoLog): void { log = next; }

type Key = { id: string; key: Buffer };
type Ring = { current: Key | null; all: Map<string, Key>; invalid: string[] };

export function parseDataKey(raw: string): Buffer | null {
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) {
    const b = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (b.length === 32) return b;
  }
  return null;
}

export function dataKeyId(key: Buffer): string {
  return createHmac("sha256", key).update("receebo-data-key-id").digest("hex").slice(0, 8);
}

let cached: { sig: string; ring: Ring } | null = null;
const warned = new Set<string>();
function warnOnce(tag: string, level: "warn" | "error", message: string, details?: Record<string, unknown>) {
  if (warned.has(tag)) return;
  warned.add(tag);
  log(level, message, details);
}

function ring(): Ring {
  const cur = process.env.DATA_ENCRYPTION_KEY ?? "";
  const prev = process.env.DATA_ENCRYPTION_KEY_PREVIOUS ?? "";
  const sig = createHash("sha256").update(cur).update("\0").update(prev).digest("hex");
  if (cached?.sig === sig) return cached.ring;
  const all = new Map<string, Key>();
  const invalid: string[] = [];
  let current: Key | null = null;
  if (cur.trim()) {
    const key = parseDataKey(cur);
    if (key) { current = { id: dataKeyId(key), key }; all.set(current.id, current); }
    else invalid.push("DATA_ENCRYPTION_KEY");
  }
  for (const part of prev.split(",").map((s) => s.trim()).filter(Boolean)) {
    const key = parseDataKey(part);
    if (key) { const k = { id: dataKeyId(key), key }; if (!all.has(k.id)) all.set(k.id, k); }
    else invalid.push("DATA_ENCRYPTION_KEY_PREVIOUS");
  }
  if (invalid.length) {
    warnOnce(`invalid:${sig}`, "error",
      "Data encryption: a key is not 32 bytes (64 hex chars or base64); ignored, writes stay plaintext if it is the current key",
      { variables: [...new Set(invalid)] });
  }
  cached = { sig, ring: { current, all, invalid } };
  return cached.ring;
}

/** True when DATA_ENCRYPTION_KEY is set and valid (new writes are encrypted). */
export function hasDataEncryptionKey(): boolean { return ring().current !== null; }
/** Key id used for new writes, or null. Not secret (derived by HMAC). */
export function currentDataKeyId(): string | null { return ring().current?.id ?? null; }
/** Test hook. */
export function resetFieldCryptoForTests(): void { cached = null; warned.clear(); }

export function isFieldEnvelope(value: unknown): value is string {
  return typeof value === "string" && ENVELOPE_RE.test(value);
}

function fingerprint(envelope: string): string {
  return createHash("sha256").update(envelope).digest("hex").slice(0, 12);
}

/** Encrypt for `field`; returns the plaintext unchanged when no key is configured. */
export function sealField(field: string, plaintext: string): string {
  const key = ring().current;
  if (!key) {
    warnOnce("missing", "warn", "DATA_ENCRYPTION_KEY not set: content fields are stored in plaintext (as before)");
    return plaintext;
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.key, iv);
  cipher.setAAD(Buffer.from(field, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${FIELD_ENVELOPE_PREFIX}${key.id}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

export type OpenResult = { ok: true; value: string; encrypted: boolean } | { ok: false };

/** Decrypt an envelope; non-envelope values are legacy plaintext and returned as is. Never throws. */
export function openField(field: string, stored: string): OpenResult {
  const m = ENVELOPE_RE.exec(stored);
  if (!m) return { ok: true, value: stored, encrypted: false };
  const [, kid, ivB, tagB, ctB] = m;
  const key = ring().all.get(kid!);
  if (!key) {
    log("error", "Data encryption: no key for a stored value; field reads as empty", { field, keyId: kid, fingerprint: fingerprint(stored) });
    return { ok: false };
  }
  try {
    const iv = Buffer.from(ivB!, "base64url");
    const tag = Buffer.from(tagB!, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("bad lengths");
    const decipher = createDecipheriv(ALGORITHM, key.key, iv);
    decipher.setAAD(Buffer.from(field, "utf8"));
    decipher.setAuthTag(tag);
    const value = Buffer.concat([decipher.update(Buffer.from(ctB!, "base64url")), decipher.final()]).toString("utf8");
    return { ok: true, value, encrypted: true };
  } catch {
    log("error", "Data encryption: a stored value failed to decrypt; field reads as empty", { field, keyId: kid, fingerprint: fingerprint(stored) });
    return { ok: false };
  }
}

/** Text value as it should be written (envelope or plaintext). */
export function sealText(field: string, value: string): string {
  return sealField(field, value);
}
/** Text value from the DB; legacy plaintext passes through, failures become `fallback`. */
export function openText<T extends string | null>(field: string, stored: string, fallback: T): string | T {
  const r = openField(field, stored);
  return r.ok ? r.value : fallback;
}

/** JSON value as jsonb driver text: the JSON itself, or a JSON string holding the envelope. */
export function sealJson(field: string, value: unknown): string {
  const json = JSON.stringify(value);
  if (!hasDataEncryptionKey()) { sealField(field, json); return json; }
  return JSON.stringify(sealField(field, json));
}
/** JSON value from the DB (already parsed by pg, or raw text). */
export function openJson<T>(field: string, stored: unknown, fallback: T): T {
  let v: unknown = stored;
  if (typeof v === "string") {
    if (isFieldEnvelope(v)) {
      const r = openField(field, v);
      if (!r.ok) return fallback;
      try { return JSON.parse(r.value) as T; } catch {
        log("error", "Data encryption: decrypted JSON is invalid; field reads as empty", { field });
        return fallback;
      }
    }
    try { v = JSON.parse(v); } catch { /* plain string, as drizzle's jsonb does */ }
  }
  return v as T;
}
