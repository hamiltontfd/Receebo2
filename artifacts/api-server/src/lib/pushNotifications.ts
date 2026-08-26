import webpush from "web-push";
import { createECDH, createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { logger } from "./logger";

export interface PushPayload {
  title: string;
  body: string;
  receiptId?: number;
}

function deriveVapidKeys(secret: string): { publicKey: string; privateKey: string } | null {
  for (let counter = 0; counter < 10; counter += 1) {
    const privateKey = createHash("sha256")
      .update(`receebo:web-push:v1:${counter}:`)
      .update(secret)
      .digest();
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(privateKey);
      return {
        publicKey: ecdh.getPublicKey().toString("base64url"),
        privateKey: privateKey.toString("base64url"),
      };
    } catch {
      // An invalid P-256 scalar is extraordinarily unlikely; retry with a
      // different domain-separated digest rather than weakening validation.
    }
  }
  return null;
}

function getPushConfig(): { publicKey: string; privateKey: string } | null {
  let publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  let privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!publicKey || !privateKey) {
    const sessionSecret = process.env.SESSION_SECRET?.trim();
    if (!sessionSecret) return null;
    const derived = deriveVapidKeys(sessionSecret);
    if (!derived) return null;
    publicKey = derived.publicKey;
    privateKey = derived.privateKey;
  }

  webpush.setVapidDetails("mailto:contact@receebo.net", publicKey, privateKey);
  return { publicKey, privateKey };
}

export function getVapidPublicKey(): string | null {
  return getPushConfig()?.publicKey ?? null;
}

export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  if (!getPushConfig()) {
    logger.info("Web push is not configured; skipping push notification");
    return false;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (subscriptions.length === 0) return false;

  let sent = false;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 86_400 },
        );
        sent = true;
      } catch (err: any) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptionsTable)
            .where(
              and(
                eq(pushSubscriptionsTable.userId, userId),
                eq(pushSubscriptionsTable.endpoint, subscription.endpoint),
              ),
            );
          logger.info({ userId }, "Removed expired web push subscription");
        } else {
          logger.warn({ err, userId }, "Web push notification failed");
        }
      }
    }),
  );

  return sent;
}