import { Router } from "express";
import { db, gmailConnectionsTable, pendingImportsTable } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCurrentLegalAcceptance } from "../lib/legalAcceptance";
import { mailLogger as logger } from "../lib/logger";
import {
  enabledMailProviders,
  isMailProviderEnabled,
  type MailProviderId,
} from "../lib/mailProviders/config";
import { MailReconnectRequiredError } from "../lib/mailProviders/types";
import { isGmailConfigured, syncUserGmail } from "../lib/gmailSync";
import { getOutlookConnection, isOutlookConfigured, syncUserOutlook } from "../lib/outlookSync";

const router = Router();

export interface MailProviderStatus {
  id: MailProviderId;
  label: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  lastSyncedAt: Date | null;
  needsReconnect: boolean;
}

async function providerStatuses(userId: string): Promise<MailProviderStatus[]> {
  const [gmail] = await db
    .select({
      gmailEmail: gmailConnectionsTable.gmailEmail,
      lastSyncedAt: gmailConnectionsTable.lastSyncedAt,
      status: gmailConnectionsTable.status,
    })
    .from(gmailConnectionsTable)
    .where(eq(gmailConnectionsTable.userId, userId))
    .limit(1);
  const outlook = await getOutlookConnection(userId);

  const all: MailProviderStatus[] = [
    {
      id: "outlook",
      label: "Outlook",
      enabled: isMailProviderEnabled("outlook"),
      configured: isOutlookConfigured(),
      connected: !!outlook,
      accountEmail: outlook?.accountEmail ?? null,
      lastSyncedAt: outlook?.lastSyncedAt ?? null,
      needsReconnect: outlook?.status === "needs_reconnect",
    },
    {
      id: "gmail",
      label: "Gmail",
      enabled: isMailProviderEnabled("gmail"),
      configured: isGmailConfigured(),
      connected: !!gmail,
      accountEmail: gmail?.gmailEmail ?? null,
      lastSyncedAt: gmail?.lastSyncedAt ?? null,
      needsReconnect: gmail?.status === "needs_reconnect",
    },
  ];
  // Show providers that are usable, plus any disabled provider the user is
  // still connected to (so they can disconnect and revoke access).
  return all.filter((p) => (p.enabled && p.configured) || p.connected);
}

const PROVIDER_LABELS: Record<MailProviderId, string> = {
  outlook: "Outlook",
  gmail: "Gmail",
};

const PROVIDER_CONFIGURED: Record<MailProviderId, () => boolean> = {
  outlook: isOutlookConfigured,
  gmail: isGmailConfigured,
};

/**
 * Providers a new user can actually connect right now: enabled by
 * MAIL_PROVIDERS_ENABLED and configured with OAuth credentials.
 */
export function availableMailProviders(): { id: MailProviderId; label: string }[] {
  return enabledMailProviders()
    .filter((id) => PROVIDER_CONFIGURED[id]())
    .map((id) => ({ id, label: PROVIDER_LABELS[id] }));
}

// GET /mail/providers — public, no user data. Lets the website and apps word
// their copy from the same flag that controls Settings.
router.get("/mail/providers", (_req, res): void => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ providers: availableMailProviders() });
});

// GET /mail/status — every visible mail provider + shared pending count
router.get("/mail/status", requireAuth, async (req, res): Promise<void> => {
  try {
    const providers = await providerStatuses(req.userId!);
    const [row] = await db
      .select({ n: count() })
      .from(pendingImportsTable)
      .where(
        and(
          eq(pendingImportsTable.userId, req.userId!),
          eq(pendingImportsTable.status, "pending"),
        ),
      );
    res.json({
      enabledProviders: enabledMailProviders(),
      providers,
      needsReconnect: providers.some((p) => p.enabled && p.needsReconnect),
      pendingCount: Number(row?.n ?? 0),
    });
  } catch (err) {
    logger.error({ err }, "GET /mail/status failed");
    res.status(500).json({ error: "Internal error" });
  }
});

const syncers: Record<MailProviderId, (userId: string) => Promise<{ checked: number; queued: number }>> = {
  gmail: syncUserGmail,
  outlook: syncUserOutlook,
};

// POST /mail/sync — sync every enabled + configured + connected provider
router.post("/mail/sync", requireAuth, requireCurrentLegalAcceptance, async (req, res): Promise<void> => {
  try {
    const providers = (await providerStatuses(req.userId!)).filter(
      (p) => p.enabled && p.configured && p.connected,
    );
    let checked = 0;
    let queued = 0;
    const needsReconnect: MailProviderId[] = [];
    const failed: MailProviderId[] = [];
    for (const provider of providers) {
      try {
        const result = await syncers[provider.id](req.userId!);
        checked += result.checked;
        queued += result.queued;
      } catch (err) {
        if (err instanceof MailReconnectRequiredError) {
          needsReconnect.push(provider.id);
        } else {
          logger.error({ err, provider: provider.id }, "POST /mail/sync provider failed");
          failed.push(provider.id);
        }
      }
    }
    if (providers.length > 0 && failed.length === providers.length) {
      res.status(500).json({ error: "Sync failed", failed });
      return;
    }
    res.json({ checked, queued, needsReconnect, failed });
  } catch (err) {
    logger.error({ err }, "POST /mail/sync failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
