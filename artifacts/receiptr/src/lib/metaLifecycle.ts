import { newEventId, trackMetaEvent } from "./metaPixel";

const seen = new Set<string>();

/** A response header carries only a milestone name and an opaque dedupe ID. */
export function trackMilestoneResponse(response: Response, allowed: boolean) {
  if (!allowed || !response.ok) return;
  try {
    const event = JSON.parse(response.headers.get("X-Receebo-Meta-Event") ?? "null");
    if (!event || !["CompleteRegistration", "FirstReceiptSaved"].includes(event.name) ||
      typeof event.eventId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(event.eventId) ||
      seen.has(event.eventId)) return;
    seen.add(event.eventId);
    trackMetaEvent({ name: event.name, eventId: event.eventId }, true);
  } catch { /* Missing/malformed optional metadata cannot break a save. */ }
}

/** Marketing-only storage, scoped per account in this browser, never sent to Meta. */
export function recordAuthenticatedOpen(userId: string, allowed: boolean, now = new Date()) {
  if (!allowed) return;
  try {
    const key = `receebo:app-open:${userId}`;
    const today = now.toISOString().slice(0, 10);
    const previous = localStorage.getItem(key);
    if (previous === today) return;
    localStorage.setItem(key, today);
    if (previous && /^\d{4}-\d{2}-\d{2}$/.test(previous) && previous < today) {
      trackMetaEvent({ name: "AppReturned", eventId: newEventId() }, true);
    }
  } catch { /* No browser storage means no return event. */ }
}
