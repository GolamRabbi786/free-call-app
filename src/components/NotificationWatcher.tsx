import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getActiveChat } from "@/lib/active-chat";
import { showNotification } from "@/lib/notify";

// Module-level (not refs) so dedupe survives StrictMode double-mounts and
// component remounts within the same page session.
const notifiedCalls = new Set<string>();
const seenMessages = new Set<string>();
let seededUser: string | null = null;

const MESSAGE_ALERT_WINDOW_MS = 2 * 60_000;

/**
 * Mounted once at the app root. Watches for incoming calls and new messages
 * and alerts the user with browser notifications (when permitted) and in-app
 * toasts — no matter which page they're on.
 */
export function NotificationWatcher() {
  const { user } = useAuth();
  const myId = user?._id;
  const navigate = useNavigate();
  const location = useLocation();

  const incoming = useQuery(
    api.notifications.incomingCall,
    myId ? {} : "skip",
  );
  const newMessages = useQuery(
    api.notifications.newMessages,
    myId ? {} : "skip",
  );

  // Incoming call alert — only fires for calls we haven't already alerted on.
  useEffect(() => {
    if (!incoming || !myId) return;
    if (notifiedCalls.has(incoming._id)) return;
    notifiedCalls.add(incoming._id);

    const onDashboard = location.pathname === "/dashboard";
    if (document.hidden || !onDashboard) {
      showNotification(
        "Incoming call",
        `${incoming.caller.name ?? "Someone"} wants a ${
          incoming.kind === "video" ? "video" : "voice"
        } call`,
        () => navigate("/dashboard"),
      );
    }
  }, [incoming, myId, location.pathname, navigate]);

  // Message alerts — seed once per user, then notify for new message ids.
  useEffect(() => {
    if (!newMessages || !myId) return;

    if (seededUser !== myId) {
      seededUser = myId;
      seenMessages.clear();
      for (const m of newMessages) seenMessages.add(m.messageId);
      return;
    }

    for (const item of newMessages) {
      if (seenMessages.has(item.messageId)) continue;
      seenMessages.add(item.messageId);
      // Never spam stale history after a reload — only genuinely fresh items.
      if (Date.now() - item.time > MESSAGE_ALERT_WINDOW_MS) continue;

      const hidden = document.hidden;
      const isOpenChat = getActiveChat() === item.key;
      if (!hidden && isOpenChat) continue; // already looking at it

      if (hidden) {
        showNotification(item.title, item.body, () => navigate("/dashboard"));
      } else {
        toast(item.body, {
          description: item.title,
          action: {
            label: "Open",
            onClick: () => navigate("/dashboard"),
          },
        });
      }
    }
  }, [newMessages, myId, navigate]);

  return null;
}
