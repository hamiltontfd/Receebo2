const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "") + "/";

export type PushSupport =
  | { supported: true; permission: NotificationPermission; subscription: PushSubscription | null }
  | { supported: false; reason: string };

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_resolve, reject) => {
      window.setTimeout(
        () => reject(new Error("The notification service did not start. Please reload and try again.")),
        8_000,
      );
    }),
  ]);
}

export async function getPushSupport(): Promise<PushSupport> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return {
      supported: false,
      reason: "Push notifications are not supported in this browser.",
    };
  }

  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const response = await fetch(`${BASE}api/push/status`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!response.ok) throw new Error("Could not verify this device's notification settings.");
    const { subscribed } = (await response.json()) as { subscribed: boolean };
    if (!subscribed) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  return { supported: true, permission: Notification.permission, subscription };
}

export async function enablePushNotifications(): Promise<PushSubscription> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked in your browser settings."
        : "Notification permission was not granted.",
    );
  }

  const keyResponse = await fetch(`${BASE}api/push/vapid-key`, { credentials: "include" });
  if (!keyResponse.ok) throw new Error("Push notifications are not configured yet.");
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const payload = subscription.toJSON();
  const response = await fetch(`${BASE}api/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await subscription.unsubscribe();
    throw new Error("Could not save this device for notifications.");
  }
  return subscription;
}

export async function disablePushNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await fetch(`${BASE}api/push/subscribe`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error("Could not disable notifications.");
  await subscription.unsubscribe();
}