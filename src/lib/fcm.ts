/**
 * Native Android (Capacitor + FCM) push registration. On the web / PWA this is
 * a no-op — the browser side uses Web Push (see lib/push.ts) instead. The FCM
 * token is saved to Convex so the backend can ring the phone even when the app
 * is closed.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export type SaveFcmTokenFn = (token: string) => Promise<unknown>;
export type OpenUrlFn = (url: string) => void;

// The last token registered on this device (used to clean up on sign-out).
let registeredToken: string | null = null;

export function getRegisteredFcmToken(): string | null {
  return registeredToken;
}

/** True when running inside the native Android app (not the browser). */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * Request permission, create the notification channels (the "calls" channel
 * plays our bundled ringtone), register with FCM and store the token.
 * Returns true when registration was attempted successfully.
 */
export async function registerForFcm(
  saveToken: SaveFcmTokenFn,
  openUrl: OpenUrlFn,
): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return false;

    // Channels must exist before FCM targets them, otherwise messages are
    // dropped by Android. The "calls" channel uses the bundled ringtone.
    try {
      await PushNotifications.createChannel({
        id: "calls",
        name: "Calls",
        description: "Incoming voice & video calls",
        importance: 5,
        vibration: true,
        lights: true,
        lightColor: "#0ea5e9",
        sound: "freecall_ring.wav",
      });
    } catch {
      /* channel already exists or unsupported — fine */
    }
    try {
      await PushNotifications.createChannel({
        id: "messages",
        name: "Messages",
        description: "New chat messages",
        importance: 4,
        vibration: true,
        sound: "default",
      });
    } catch {
      /* channel already exists or unsupported — fine */
    }

    PushNotifications.addListener("registration", ({ value }) => {
      registeredToken = value;
      void saveToken(value).catch(() => {
        /* backend hiccup — token re-saves on next registration */
      });
    });
    PushNotifications.addListener("registrationError", (error) => {
      console.warn("[FCM] registration error:", error.error);
    });
    PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const url = event.notification.data?.url as string | undefined;
      if (url) openUrl(url);
    });

    await PushNotifications.register();
    return true;
  } catch (error) {
    console.warn("[FCM] registration failed:", error);
    return false;
  }
}
