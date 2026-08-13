/**
 * Browser-side Web Push subscription helper.
 *
 * Requires a registered service worker (production builds only) and a VAPID
 * public key from the backend. In the dev preview there is no service worker,
 * so subscribeToPush returns false and in-app alerts still cover everything.
 */

const PUSH_ENABLED_KEY = "freecall-push-enabled";

/** Whether this device has an active push subscription (best effort). */
export function isPushEnabled(): boolean {
  try {
    return window.localStorage.getItem(PUSH_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPushEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(PUSH_ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable — in-app alerts still cover it */
  }
}

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

async function findRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // No registration yet (service worker may still be activating right after
  // page load). `ready` resolves when the active SW claims the page — race it
  // against a timeout so dev (no SW) never hangs.
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) =>
        setTimeout(() => resolve(null), 8000),
      ),
    ]);
  } catch {
    return null;
  }
}

/**
 * Subscribe the current device to Web Push and store the subscription in the
 * backend. Returns true when the subscription is created (or already exists)
 * and saved. The push-enabled flag is set/cleared accordingly.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
  saveSubscription: SaveSubscriptionFn,
): Promise<boolean> {
  if (!pushSupported()) {
    setPushEnabled(false);
    return false;
  }

  const registration = await findRegistration();
  if (!registration) {
    setPushEnabled(false);
    return false;
  }

  const save = async (sub: PushSubscription) => {
    const raw = sub.toJSON() as {
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
  };

  try {
    // Reuse an existing subscription (re-saving it keeps the backend in sync
    // across logins), otherwise create a fresh one.
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const ok = await save(existing);
      setPushEnabled(ok);
      return ok;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const ok = await save(subscription);
    setPushEnabled(ok);
    return ok;
  } catch {
    // Subscription refused (e.g. non-secure context or blocked) — the app's
    // in-app alerts still work, so this is not fatal.
    setPushEnabled(false);
    return false;
  }
}
