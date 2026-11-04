import { customType } from "drizzle-orm/pg-core";
import { openJson, openText, sealJson, sealText } from "./fieldCrypto";

/**
 * text column whose value is encrypted on write (when DATA_ENCRYPTION_KEY is
 * set) and decrypted on read. Legacy plaintext reads as is. NOTE: SQL
 * comparisons (eq/ilike/LIKE) against these columns do not work on encrypted
 * rows; filter in memory after reading.
 */
export function encryptedText(name: string, field: string, fallback: string | null = null) {
  return customType<{ data: string; driverData: string }>({
    dataType: () => "text",
    toDriver: (value) => sealText(field, value),
    fromDriver: (value) => openText(field, value, fallback) as string,
  })(name);
}

/** jsonb column; encrypted values are stored as a JSON string holding the envelope. */
export function encryptedJsonb<T>(name: string, field: string, fallback: T) {
  return customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: (value) => sealJson(field, value),
    fromDriver: (value) => openJson<T>(field, value, fallback),
  })(name);
}
