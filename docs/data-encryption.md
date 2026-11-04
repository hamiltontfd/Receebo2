# Content field encryption (DATA_ENCRYPTION_KEY)

Added 4 Nov 2026 (Hamilton: "Vamos seguir com 4 e 2"). Application-level
AES-256-GCM for receipt content and other personal fields, so a database dump,
a leaked backup or someone in the database console no longer reads them.

## What is encrypted

| Table.column | Type kept | Notes |
|---|---|---|
| `receipts.ocr_text` | text | full AI transcription (can hold NIF/CPF, address, card digits) |
| `receipts.summary` | text | AI sentence about what was bought (repeats item names) |
| `receipts.products` | jsonb | stored as a JSON **string** holding the envelope |
| `receipts.notable_items` | jsonb | same |
| `pending_imports.extraction_data` | jsonb | same (merchant, items, ocrText, sender domain) |
| `gmail_connections.gmail_email` | text | display only, never used for lookups |
| `email_connections.account_email` | text | display only, never used for lookups |
| `push_subscriptions.p256dh`, `.auth` | text | `endpoint` stays plaintext (unique key used for lookups) |

Plaintext on purpose: `merchant`, `total`, `currency`, `purchase_date`,
`delivery_date`, `category`, warranty fields and dates (stats, ordering,
duplicate check and reminders query them in SQL), `transaction_number`
(an order/NF-e number, low sensitivity), `original_file_name`, `object_path`.
Not encrypted (yet): `email_feedback.comment` (its CHECK constraint limits it to
1000 characters; the envelope is longer, so it needs a constraint change),
receipt files in Object Storage, the Clerk identity (not in our database).

No schema change: the column types are unchanged (`drizzle-kit export` output is
identical), so publishing needs no database migration review for this.

## Format

`enc:v1:<keyId>:<iv>:<tag>:<ciphertext>`

- `keyId`: 8 hex chars, HMAC-SHA256(key, "receebo-data-key-id"); not secret.
- `iv` 12 bytes, `tag` 16 bytes, ciphertext; all base64url.
- AES-256-GCM; additional authenticated data = field name
  (`receipts.ocr_text`), so a value cannot be copied into another column.
- Only values matching the strict envelope pattern are treated as encrypted;
  anything else is legacy plaintext.

Code: `lib/db/src/fieldCrypto.ts` (envelope, key ring) and
`lib/db/src/encryptedColumns.ts` (Drizzle column types). Every Drizzle read and
write of these columns encrypts/decrypts transparently, so routes, AI
extraction, emails, push, account export and deletion are unchanged.
OAuth tokens keep their own key and format (`tokenCrypto.ts`).

## Turning it on

1. Generate a key on your own machine (prints a new random value; never paste it in chat):
   `openssl rand -hex 32`
   (base64 also works: `openssl rand -base64 32`)
2. Add it as `DATA_ENCRYPTION_KEY` in **Replit Secrets (dev)** and, with a
   **different** value, in **Deployment secrets (production)**.
3. Restart / publish. The log says `Content field encryption on` with the key id,
   new writes are encrypted, and a background job encrypts existing rows.

**Never remove or change the key once rows are encrypted** (see rotation):
values encrypted with a key that is no longer configured read as empty
(null / []), and a later save of that receipt could overwrite them.
Keep a copy of the production key outside Replit (password manager).

## Without the key

Exactly as before: plaintext writes, one warning in the log
(`DATA_ENCRYPTION_KEY not set ...`). Reads always accept plaintext, so it is
safe to publish the code before the secret exists. An invalid key (not 32 bytes)
is reported once (without its value) and treated as missing.

## Backfill

`artifacts/api-server/src/lib/dataEncryptionBackfill.ts`, started after the
server listens, only with a key. One instance at a time (session advisory lock),
100 rows per batch in key order with a short pause, compare-and-set updates (a
row changed meanwhile is left for the next start), `updated_at` untouched,
logs counts per table only. Idempotent: every start re-checks and skips rows
already encrypted.

## Decryption failures

A value that fails to decrypt (unknown key id, tampering) never throws: the
field reads as null (text) or [] / null (jsonb) and the log gets the field
name, key id and a 12-hex fingerprint of the stored value, never content. The
Drizzle column type does not see the row id; to find the row:
`SELECT id FROM receipts WHERE left(encode(sha256(convert_to(ocr_text,'UTF8')),'hex'),12) = '<fingerprint>'`
(for a jsonb column use `products #>> '{}'` instead of the column).

## Search

`GET /receipts?q=` (`lib/receiptSearch.ts`): merchant, category, file name and
currency are matched in SQL with ILIKE as before; summary/ocr_text/products/
notable_items are matched in SQL while still plaintext. Rows holding any of
them encrypted are loaded (same order, same 10 000 cap, now counting
candidates) and matched in memory after decryption with the same ILIKE rules
(`%`, `_`, `\`; jsonb compared in PostgreSQL's text form). Fine for hundreds or
a few thousand receipts per user; beyond that a blind index (HMAC of words)
would be needed.

## Rotation (later, no format change)

1. Move the current key to `DATA_ENCRYPTION_KEY_PREVIOUS` (comma-separated list
   allowed) and put a new key in `DATA_ENCRYPTION_KEY`.
2. Restart: new writes use the new key id; old values still decrypt.
3. A re-encryption job (not built yet: the backfill only encrypts plaintext)
   rewrites values whose key id is not the current one; then drop the old key.

## Limits

Protects against database dumps, backups and console access. It does **not**
protect against someone who controls the running server or its secrets
(Replit workspace with production secrets, an app compromise): the server needs
the key to search, compute stats and call the AI. Dev and production must use
different keys.

## Database TLS (item 4)

`lib/db/src/index.ts` passes only `DATABASE_URL` to node-postgres, so TLS
depends on the URL (`sslmode=`). The code does not force TLS: Replit's
database host may be an internal one without TLS, and forcing it could take
production down. At startup the server now logs whether its own connection is
TLS-encrypted (`Database connection uses TLS` / `... is NOT TLS-encrypted`),
with only the URL's `sslmode` value and whether the host is loopback (never
the host or credentials). If production logs "NOT TLS", add `sslmode=require`
to the production `DATABASE_URL` only after confirming the provider supports it.
