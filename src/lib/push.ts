/**
 * Browser-side Web Push subscription helper.
 *
 * Requires a registered service worker (production builds only) and a VAPID
 * public key from the backend. In the dev preview there is no service worker,
 * so subscribeToPush returns false and in-app alerts still cover everything.
 */

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof window.atob === "function"
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export type SaveSubscriptionFn = (args: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) => Promise<unknown>;

/**
 * Subscribe the current device to Web Push and store the subscription in the
 * backend. Returns true when the subscription was created and saved.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
  saveSubscription: SaveSubscriptionFn,
): Promise<boolean> {
  if (!pushSupported()) return false;

  // The service worker is only registered in production builds — bail early
  // (don't hang on `ready`) when there is no active registration yet.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const raw = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys.auth) return false;
    await saveSubscription({
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    });
    return true;
  } catch {
    // Subscription refused (e.g. non-secure context or blocked) — the app's
    // in-app alerts still work, so this is not fatal.
    return false;
  }
}
