/** Thin wrappers around the browser Notification API (no-op when unsupported). */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported";

export function notificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a browser notification (only fires when permission is granted). */
export function showNotification(
  title: string,
  body: string,
  onClick?: () => void,
): void {
  if (!notificationsSupported() || Notification.permission !== "granted") {
    return;
  }
  try {
    const notification = new Notification(title, {
      body,
      icon: "/logo.svg",
      tag: `freecall-${Date.now()}`,
    });
    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
    // Auto-dismiss so stale alerts never pile up.
    setTimeout(() => notification.close(), 15_000);
  } catch {
    /* blocked or unsupported — in-app alerts still cover it */
  }
}
