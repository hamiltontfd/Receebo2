import { customFetch, type TrialFunnelInteraction } from "@workspace/api-client-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Dedicated first-party funnel; never sends paths, receipts, identity or PWA events. */
export async function trackTrialInteraction(event: TrialFunnelInteraction): Promise<boolean> {
  try {
    await customFetch(`${base}/api/billing/trial-funnel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    return true;
  } catch {
    // Observability must not block using the app or making a payment.
    return false;
  }
}

export async function recordCheckoutCancellation() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("checkout") !== "cancel") return;
  const attemptId = url.searchParams.get("attempt");
  if (attemptId && await trackTrialInteraction({ event: "checkout_canceled", attemptId })) {
    // Only remove this return marker after acknowledgement, so network errors can retry.
    url.searchParams.delete("checkout");
    url.searchParams.delete("attempt");
    window.history.replaceState(window.history.state, "", url.toString());
  }
}
