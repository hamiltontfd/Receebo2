import { clerkClient } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sendSignupNotification } from "./emailService";
import { signupNotifySkip, type SignupNotifyData } from "./signupNotify";
import { logger } from "./logger";

/** Fail each enrichment independently; slow lookups must not hold notification delivery indefinitely. */
async function optional<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read).catch(() => fallback),
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), 1_500); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function notifyNewTrial(input: {
  userId: string; at: Date; market: string | null; country: string | null;
}): Promise<void> {
  // Integration fixtures must never notify the owner; the explicit smoke script uses development.
  if (process.env.NODE_ENV === "test") return;
  const warn = (reason: string) => logger.warn({ reason }, "Signup notification skipped or failed");
  const skip = signupNotifySkip(process.env);
  if (skip) { warn(skip); return; }
  try {
    const [touch, contact] = await Promise.all([
      optional(async () => {
        const result = await db.execute(sql`
          SELECT utm_source, utm_medium, utm_campaign, utm_content, fbclid
          FROM ad_attributions WHERE user_id = ${input.userId} LIMIT 1`);
        return result.rows[0] as {
          utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; fbclid?: string;
        } | undefined;
      }, undefined),
      optional(async () => {
        const user = await clerkClient.users.getUser(input.userId);
        return {
          email: user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress,
          loginMethod: (user.externalAccounts.some(a => a.provider === "oauth_google") ? "Google" : "e-mail") as SignupNotifyData["loginMethod"],
        };
      }, { email: undefined, loginMethod: "desconhecido" as SignupNotifyData["loginMethod"] }),
    ]);
    await sendSignupNotification({
      at: input.at, market: input.market, country: input.country,
      utmSource: touch?.utm_source, utmMedium: touch?.utm_medium,
      utmCampaign: touch?.utm_campaign, utmContent: touch?.utm_content,
      hasFbclid: !!touch?.fbclid, ...contact,
    }, { warn });
  } catch { warn("network_error"); }
}
