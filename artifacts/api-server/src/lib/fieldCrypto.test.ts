import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentDataKeyId, dataKeyId, hasDataEncryptionKey, isFieldEnvelope, openField, openJson, openText,
  parseDataKey, resetFieldCryptoForTests, sealField, sealJson, setFieldCryptoLogger,
} from "@workspace/db";
import { secretMatches } from "./secretCompare";
import { describeDatabaseUrl } from "./dbTls";

const hexKey = () => randomBytes(32).toString("hex");
let logs: Array<{ level: string; message: string; details?: Record<string, unknown> }>;
beforeEach(() => {
  vi.stubEnv("DATA_ENCRYPTION_KEY", "");
  vi.stubEnv("DATA_ENCRYPTION_KEY_PREVIOUS", "");
  resetFieldCryptoForTests();
  logs = [];
  setFieldCryptoLogger((level, message, details) => logs.push({ level, message, details }));
});
afterEach(() => { vi.unstubAllEnvs(); resetFieldCryptoForTests(); });

describe("field encryption envelope", () => {
  it("round-trips with a versioned envelope bound to the field, random IVs", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", hexKey());
    const a = sealField("receipts.ocr_text", "NIF 123456789 — Rua X, cartão ****1234");
    const b = sealField("receipts.ocr_text", "NIF 123456789 — Rua X, cartão ****1234");
    expect(a).toMatch(/^enc:v1:[0-9a-f]{8}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("123456789");
    expect(a.split(":")[2]).toBe(currentDataKeyId());
    expect(openField("receipts.ocr_text", a)).toEqual({ ok: true, value: "NIF 123456789 — Rua X, cartão ****1234", encrypted: true });
    // Moved to another column: authentication fails, no throw, no content logged.
    expect(openField("receipts.summary", a)).toEqual({ ok: false });
    expect(JSON.stringify(logs)).not.toContain("123456789");
    expect(logs.at(-1)?.details).toMatchObject({ field: "receipts.summary" });
  });
  it("accepts hex and base64 keys, rejects other lengths", () => {
    const raw = randomBytes(32);
    expect(parseDataKey(raw.toString("hex"))?.equals(raw)).toBe(true);
    expect(parseDataKey(raw.toString("base64"))?.equals(raw)).toBe(true);
    expect(parseDataKey(raw.toString("base64url"))?.equals(raw)).toBe(true);
    expect(parseDataKey("abc")).toBeNull();
    expect(parseDataKey(randomBytes(16).toString("hex"))).toBeNull();
  });
  it("key ring: previous keys still decrypt after rotation; unknown key id reads as fallback", () => {
    const oldKey = hexKey();
    vi.stubEnv("DATA_ENCRYPTION_KEY", oldKey);
    const sealed = sealField("receipts.summary", "old");
    vi.stubEnv("DATA_ENCRYPTION_KEY", hexKey());
    expect(openText("receipts.summary", sealed, null)).toBeNull();
    vi.stubEnv("DATA_ENCRYPTION_KEY_PREVIOUS", oldKey);
    expect(openText("receipts.summary", sealed, null)).toBe("old");
    expect(sealField("receipts.summary", "new").split(":")[2]).not.toBe(dataKeyId(parseDataKey(oldKey)!));
  });
  it("tampered ciphertext reads as the fallback without throwing", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", hexKey());
    const s = sealField("receipts.ocr_text", "hello world");
    const tampered = s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA");
    expect(openText("receipts.ocr_text", tampered, null)).toBeNull();
  });
  it("legacy plaintext passes through, including text that merely starts like an envelope", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", hexKey());
    expect(openText("receipts.ocr_text", "plain receipt", null)).toBe("plain receipt");
    expect(openText("receipts.ocr_text", "enc:v1:not really", null)).toBe("enc:v1:not really");
    expect(isFieldEnvelope("enc:v1:not really")).toBe(false);
    expect(openJson("receipts.products", [{ name: "TV", quantity: 1, price: 10 }], [])).toEqual([{ name: "TV", quantity: 1, price: 10 }]);
    expect(openJson("receipts.products", '[{"name":"TV"}]', [])).toEqual([{ name: "TV" }]);
  });
  it("jsonb values become a JSON string holding the envelope", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", hexKey());
    const driver = sealJson("receipts.products", [{ name: "Sofa", quantity: 1, price: 499 }]);
    const parsed = JSON.parse(driver) as string;
    expect(isFieldEnvelope(parsed)).toBe(true);
    expect(openJson("receipts.products", parsed, [])).toEqual([{ name: "Sofa", quantity: 1, price: 499 }]);
    expect(openJson("receipts.notable_items", parsed, [])).toEqual([]);
  });
  it("missing key: plaintext writes exactly as before, one warning", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    expect(hasDataEncryptionKey()).toBe(false);
    expect(sealField("receipts.ocr_text", "abc")).toBe("abc");
    expect(sealJson("receipts.products", [{ name: "x" }])).toBe(JSON.stringify([{ name: "x" }]));
    sealField("receipts.summary", "def");
    expect(logs.filter((l) => l.message.includes("not set"))).toHaveLength(1);
  });
  it("invalid key behaves like a missing key and is reported once without its value", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "too-short-key");
    expect(hasDataEncryptionKey()).toBe(false);
    expect(sealField("receipts.ocr_text", "abc")).toBe("abc");
    hasDataEncryptionKey();
    expect(logs.filter((l) => l.level === "error")).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("too-short-key");
  });
});

describe("constant-time secret comparison", () => {
  it("matches only the exact secret and rejects missing/empty/non-string values", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
    expect(secretMatches("s3cret ", "s3cret")).toBe(false);
    expect(secretMatches("s3cre", "s3cret")).toBe(false);
    expect(secretMatches("", "s3cret")).toBe(false);
    expect(secretMatches(["s3cret"], "s3cret")).toBe(false);
    expect(secretMatches("x", undefined)).toBe(false);
    expect(secretMatches("x", "")).toBe(false);
  });
});

describe("database TLS description", () => {
  it("reports only sslmode and loopback, never the host or credentials", () => {
    expect(describeDatabaseUrl("postgres://u:p@db.example.com/x?sslmode=require")).toEqual({ sslmode: "require", loopback: false });
    expect(describeDatabaseUrl("postgres://u:p@127.0.0.1:5432/x")).toEqual({ sslmode: "absent", loopback: true });
    expect(describeDatabaseUrl("postgres://u:p@h/x?sslmode=weird")).toEqual({ sslmode: "other", loopback: false });
    expect(describeDatabaseUrl(undefined)).toEqual({ sslmode: "absent", loopback: false });
  });
});
