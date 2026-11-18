import { createHash } from "node:crypto";
import { logger } from "./logger";
import { metaIdentifiersFor, type StoredMetaIdentifiers } from "./adAttributionStore";

export type ServerMetaEvent = {
  eventName: "CompleteRegistration" | "FirstReceiptSaved" | "Purchase" | "Subscribe";
  eventId: string;
  userId: string;
  email?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  eventSourceUrl?: string | null;
  value?: number | null;
  currency?: string | null;
};

export function metaCapiConfigured(
  env: { META_PIXEL_ID?: string; META_CAPI_ACCESS_TOKEN?: string } = process.env,
): boolean {
  return Boolean(env.META_PIXEL_ID?.trim() && env.META_CAPI_ACCESS_TOKEN?.trim());
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function metaEventBody(event: ServerMetaEvent, testEventCode?: string) {
  let source: string | undefined;
  try {
    const url = new URL(event.eventSourceUrl ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") source = url.origin + url.pathname;
  } catch { /* Omit missing or malformed source URLs. */ }
  return {
    data: [{
      event_name: event.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      action_source: "website",
      ...(source ? { event_source_url: source } : {}),
      user_data: {
        external_id: sha256(event.userId),
        ...(event.email ? { em: sha256(event.email) } : {}),
        ...(event.fbc ? { fbc: event.fbc } : {}),
        ...(event.fbp ? { fbp: event.fbp } : {}),
      },
      ...(event.value != null && event.currency
        ? { custom_data: { value: event.value, currency: event.currency } }
        : {}),
    }],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}

/** No network call unless both the pixel id and the access token are set. */
export async function sendMetaEvent(
  event: ServerMetaEvent,
  fetchImpl: typeof fetch = fetch,
  env: { META_PIXEL_ID?: string; META_CAPI_ACCESS_TOKEN?: string; META_TEST_EVENT_CODE?: string } = process.env,
): Promise<{ sent: boolean; reason?: string }> {
  let fbcSource: "cookie" | StoredMetaIdentifiers["fbcSource"] = event.fbc ? "cookie" : "none";
  let httpStatus: number | null = null;
  let eventsReceived: number | null = null;
  const fields = () => ({
    eventName: event.eventName, eventId: event.eventId,
    userIdHash: sha256(event.userId).slice(0, 16),
    httpStatus, events_received: eventsReceived, fbcSource,
  });
  const failed = (reason: string) => {
    // Fixed reasons only: upstream bodies/errors can echo identifiers or credentials.
    logger.warn({ ...fields(), reason }, "Meta CAPI send failed");
    return { sent: false, reason };
  };
  if (!metaCapiConfigured(env)) return failed("unconfigured");
  const pixel = env.META_PIXEL_ID!.trim();
  const token = env.META_CAPI_ACCESS_TOKEN!.trim();
  const stored = await metaIdentifiersFor(event.userId).catch((): StoredMetaIdentifiers => ({ fbcSource: "none" }));
  fbcSource = event.fbc ? "cookie" : stored.fbcSource;
  const matched = { ...event, fbc: event.fbc || stored.fbc, fbp: event.fbp || stored.fbp };
  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metaEventBody(matched, env.META_TEST_EVENT_CODE?.trim() || undefined)),
      },
    );
    httpStatus = response.status;
    // Never log response bodies; retain only Meta's numeric acknowledgement.
    const acknowledgement: unknown = await response.json().catch(() => null);
    if (acknowledgement && typeof acknowledgement === "object" && "events_received" in acknowledgement) {
      const count = acknowledgement.events_received;
      if (typeof count === "number" && Number.isFinite(count) && count >= 0) eventsReceived = count;
    }
    if (!response.ok) return failed(`http_${response.status}`);
    logger.info(fields(), "Meta CAPI sent");
    return { sent: true };
  } catch {
    return failed("network_error");
  }
}
