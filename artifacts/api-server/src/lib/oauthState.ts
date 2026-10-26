/**
 * OAuth `state` security shared by the mail provider connect flows.
 *
 * Each connect request generates a random nonce that is:
 *   1. Stored server-side with a 10-minute TTL (pendingOAuthNonces map)
 *   2. Included in an HMAC-SHA256-signed state token sent to the provider
 *
 * The callback verifies the HMAC, then consumes the nonce (one-time use).
 * The provider id is bound into the state so a Gmail state cannot complete an
 * Outlook callback and vice versa. Prevents CSRF and account-linking attacks.
 */
import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface NonceEntry {
  userId: string;
  provider: string;
  expiresAt: number;
}
const pendingOAuthNonces = new Map<string, NonceEntry>();

// Prune expired nonces every 5 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of pendingOAuthNonces) {
    if (entry.expiresAt <= now) pendingOAuthNonces.delete(nonce);
  }
}, 5 * 60 * 1000).unref();

function getStateSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return Buffer.from(secret, "utf8");
}

/** Create a nonce and return the signed state: base64url(payload) + "." + HMAC hex */
export function createOAuthState(userId: string, provider: string): string {
  const nonce = randomBytes(32).toString("hex");
  pendingOAuthNonces.set(nonce, {
    userId,
    provider,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  const payload = Buffer.from(JSON.stringify({ userId, nonce, provider })).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verify a signed state token, consume the nonce, and return userId.
 * Throws if the signature is invalid, the nonce is unknown/expired, or the
 * user/provider do not match the stored entry.
 */
export function verifyAndConsumeOAuthState(state: string, provider: string): string {
  const dotIdx = state.lastIndexOf(".");
  if (dotIdx < 0) throw new Error("Malformed state: no separator");

  const payload = state.slice(0, dotIdx);
  const receivedSig = state.slice(dotIdx + 1);

  // Constant-time signature check
  const expectedSig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  const receivedBuf = Buffer.from(receivedSig, "hex");
  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new Error("Invalid state signature");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    userId?: string;
    nonce?: string;
    provider?: string;
  };
  if (!parsed.userId || !parsed.nonce) throw new Error("Incomplete state payload");

  const entry = pendingOAuthNonces.get(parsed.nonce);
  if (!entry) throw new Error("Unknown or already-used nonce");
  if (entry.expiresAt <= Date.now()) {
    pendingOAuthNonces.delete(parsed.nonce);
    throw new Error("Expired nonce");
  }
  if (entry.userId !== parsed.userId) throw new Error("userId mismatch in state");
  if (entry.provider !== provider || (parsed.provider ?? provider) !== provider) {
    throw new Error("provider mismatch in state");
  }

  // Consume nonce — one-time use
  pendingOAuthNonces.delete(parsed.nonce);

  return parsed.userId;
}
