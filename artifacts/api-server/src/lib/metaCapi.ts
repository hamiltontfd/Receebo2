import { createHash } from "node:crypto";

export type ServerMetaEvent = {
  eventName: "CompleteRegistration" | "Purchase" | "Subscribe";
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
  return {
    data: [{
      event_name: event.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      action_source: "website",
      ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
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
  if (!metaCapiConfigured(env)) return { sent: false, reason: "unconfigured" };
  const pixel = env.META_PIXEL_ID!.trim();
  const token = env.META_CAPI_ACCESS_TOKEN!.trim();
  const response = await fetchImpl(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaEventBody(event, env.META_TEST_EVENT_CODE?.trim() || undefined)),
    },
  );
  if (!response.ok) return { sent: false, reason: `http_${response.status}` };
  return { sent: true };
}
