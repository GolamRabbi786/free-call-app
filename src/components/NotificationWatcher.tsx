import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getActiveChat } from "@/lib/active-chat";
import { isNativeApp, registerForFcm } from "@/lib/fcm";
import { showNotification } from "@/lib/notify";
import {
  playMessageDing,
  startRingtone,
  stopRingtone,
  vibrateCall,
  vibrateMessage,
} from "@/lib/sounds";
import {
  isPushEnabled,
  pushSupported,
  setPushEnabled,
  subscribeToPush,
} from "@/lib/push";
import {
  CallRinger,
  type ActiveGroupCallInfo,
  type IncomingCallInfo,
} from "@/components/notify/CallRinger";
import { MessagePopups, type PopupMessage } from "@/components/notify/MessagePopups";

// Module-level (not refs) so dedupe survives StrictMode double-mounts and
// component remounts within the same page session.
const notifiedCalls = new Set<string>();
const seenMessages = new Set<string>();
const groupCallShown = new Set<string>();
let seededUser: string | null = null;
// Set at page load: messages sent after this point are "new" and worth
// alerting about — messages from before (e.g. after a reload) are history.
// This also covers mobile tabs the OS froze: when the tab resumes, messages
// that arrived meanwhile are newer than this timestamp and still alert.
const sessionStartTime = Date.now();

const PROMPT_KEY_PREFIX = "freecall-notif-prompted-";

/**
 * Mounted once at the app root. Watches for incoming calls, active group
 * calls and new messages, and alerts the user everywhere:
 *  - visible tab  -> in-app popup windows (ring screen / message cards)
 *  - background   -> browser notification (or Web Push, when subscribed)
 *  - app closed   -> Web Push (needs VAPID keys + permission)
 */
export function NotificationWatcher() {
  const { user } = useAuth();
  const myId = user?._id;
  const navigate = useNavigate();
  const location = useLocation();
  const onDashboard = location.pathname === "/dashboard";

  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const incoming = useQuery(
    api.notifications.incomingCall,
    myId ? {} : "skip",
  );
  const newMessages = useQuery(
    api.notifications.newMessages,
    myId ? {} : "skip",
  );
  const activeGroup = useQuery(
    api.groupCalls.activeGroupCallFor,
    myId ? {} : "skip",
  );
  const vapidPublicKey = useQuery(api.webPush.vapidPublicKey);
  const acceptCallMutation = useMutation(api.calls.acceptCall);
  const declineCallMutation = useMutation(api.calls.declineCall);
  const savePushSubscription = useMutation(api.webPush.saveSubscription);
  const saveFcmToken = useMutation(api.fcm.saveFcmToken);

  const [ringCall, setRingCall] = useState<IncomingCallInfo | null>(null);
  const [groupCallInfo, setGroupCallInfo] =
    useState<ActiveGroupCallInfo | null>(null);
  const [popups, setPopups] = useState<PopupMessage[]>([]);

  // ---- Incoming 1:1 call: ringtone -------------------------------------
  useEffect(() => {
    if (incoming && !hidden) {
      startRingtone();
      vibrateCall();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [incoming?._id, incoming !== null, hidden]);

  // ---- Incoming 1:1 call: alerts ---------------------------------------
  useEffect(() => {
    if (!incoming || !myId) return;
    const sessionId = incoming._id;

    if (onDashboard) {
      // CallOverlay renders the ring; still notify via the browser when the
      // tab is in the background (unless Web Push covers it).
      if (
        hidden &&
        !notifiedCalls.has(sessionId) &&
        !isPushEnabled()
      ) {
        notifiedCalls.add(sessionId);
        showNotification(
          "Incoming call",
          `${incoming.caller.name ?? "Someone"} wants a ${
            incoming.kind === "video" ? "video" : "voice"
          } call`,
          () => navigate("/dashboard"),
        );
      }
      setRingCall(null);
      return;
    }

    if (hidden) {
      if (!notifiedCalls.has(sessionId) && !isPushEnabled()) {
        notifiedCalls.add(sessionId);
        showNotification(
          "Incoming call",
          `${incoming.caller.name ?? "Someone"} wants a ${
            incoming.kind === "video" ? "video" : "voice"
          } call`,
          () => navigate("/dashboard"),
        );
      }
      setRingCall(null);
    } else {
      setRingCall({
        sessionId,
        kind: incoming.kind,
        caller: incoming.caller,
      });
    }
  }, [incoming, myId, onDashboard, hidden, navigate]);

  // ---- Active group call ------------------------------------------------
  useEffect(() => {
    if (!activeGroup || !myId) return;
    const sessionId = activeGroup._id;
    const initiator = activeGroup.members.find(
      (m) => m._id === activeGroup.initiatorId,
    );

    if (onDashboard || hidden) {
      if (
        hidden &&
        !groupCallShown.has(sessionId) &&
        !isPushEnabled()
      ) {
        groupCallShown.add(sessionId);
        showNotification(
          `${initiator?.name ?? "Someone"} started a group call`,
          `${activeGroup.kind === "video" ? "Video" : "Voice"} call in ${
            activeGroup.group.name
          }`,
          () => navigate("/dashboard"),
        );
      }
      setGroupCallInfo(null);
      return;
    }

    if (groupCallShown.has(sessionId)) {
      setGroupCallInfo(null);
      return;
    }
    groupCallShown.add(sessionId);
    setGroupCallInfo({
      sessionId,
      kind: activeGroup.kind,
      groupName: activeGroup.group.name,
      initiatorName: initiator?.name ?? "Someone",
    });
  }, [activeGroup, myId, onDashboard, hidden, navigate]);

  // ---- New messages -----------------------------------------------------
  useEffect(() => {
    if (!newMessages || !myId) return;

    // Seed once per user, then alert only for genuinely new message ids.
    if (seededUser !== myId) {
      seededUser = myId;
      seenMessages.clear();
      for (const m of newMessages) seenMessages.add(m.messageId);
      return;
    }

    const fresh: PopupMessage[] = [];
    for (const item of newMessages) {
      if (seenMessages.has(item.messageId)) continue;
      seenMessages.add(item.messageId);
      // Only genuinely fresh items (after this page session started) — never
      // spam the history that was already there before the user arrived.
      if (item.time < sessionStartTime) continue;
      fresh.push({
        key: item.key,
        messageId: item.messageId,
        title: item.title,
        senderName: item.senderName,
        body: item.body,
      });
    }
    if (fresh.length === 0) return;

    if (hidden) {
      // Background tab — system notification (Web Push already covers it when
      // subscribed, so don't double-notify).
      if (!isPushEnabled()) {
        const first = fresh[0];
        showNotification(first.title, first.body, () =>
          navigate("/dashboard"),
        );
      }
      return;
    }

    // Skip the chat the user is currently looking at.
    const openChat = getActiveChat();
    const visible = fresh.filter((item) => item.key !== openChat);
    if (visible.length === 0) return;

    setPopups((prev) => {
      const next = [...prev, ...visible];
      return next.slice(-3);
    });
    // Audible + haptic cue so a new message is noticed even when the popup
    // isn't glanced at right away.
    playMessageDing();
    vibrateMessage();
  }, [newMessages, myId, hidden, navigate]);

  // ---- One-time notification/push auto-enable ---------------------------
  useEffect(() => {
    if (!myId) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const flagKey = `${PROMPT_KEY_PREFIX}${myId}`;
    let prompted = false;
    try {
      prompted = window.localStorage.getItem(flagKey) === "1";
    } catch {
      /* storage unavailable */
    }

    if (Notification.permission === "granted") {
      // Already allowed — quietly make sure this device is subscribed.
      if (vapidPublicKey && pushSupported() && !isPushEnabled()) {
        void subscribeToPush(vapidPublicKey, (args) =>
          savePushSubscription(args),
        ).then((ok) => setPushEnabled(ok));
      }
      return;
    }
    if (Notification.permission === "denied" || prompted) return;

    // One-time gentle prompt (browsers need a user gesture to ask, so the
    // toast's action button provides it).
    try {
      window.localStorage.setItem(flagKey, "1");
    } catch {
      /* storage unavailable */
    }
    toast("Get call & message alerts even when you're not in the app", {
      action: {
        label: "Enable",
        onClick: () => {
          void (async () => {
            try {
              const perm = await Notification.requestPermission();
              if (perm === "granted") {
                if (vapidPublicKey && pushSupported()) {
                  const ok = await subscribeToPush(vapidPublicKey, (args) =>
                    savePushSubscription(args),
                  );
                  setPushEnabled(ok);
                  toast.success(
                    ok
                      ? "Alerts on — even when the app is closed."
                      : "Alerts on for when you're in the app.",
                  );
                } else {
                  toast.success("Alerts on for when you're in the app.");
                }
              }
            } catch {
              /* permission request failed — in-app alerts still work */
            }
          })();
        },
      },
    });
  }, [myId, vapidPublicKey, savePushSubscription]);

  // ---- Native Android: register with FCM (rings even when app is closed) --
  useEffect(() => {
    if (!isNativeApp()) return;
    if (!myId) return;
    void registerForFcm(
      (token) => saveFcmToken({ token }),
      (url) => navigate(url),
    );
    // Clean up this device's token on unmount only when we leave the app for
    // good (sign-out is handled by the Sidebar while still authenticated).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, saveFcmToken, navigate]);

  const acceptCall = useCallback(
    async (sessionId: string) => {
      try {
        await acceptCallMutation({
          sessionId: sessionId as Id<"callSessions">,
        });
        navigate("/dashboard");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not accept the call",
        );
      }
    },
    [acceptCallMutation, navigate],
  );

  const declineCall = useCallback(
    async (sessionId: string) => {
      try {
        await declineCallMutation({
          sessionId: sessionId as Id<"callSessions">,
        });
      } catch {
        /* call already gone — fine */
      }
    },
    [declineCallMutation],
  );

  const dismissGroup = useCallback(() => setGroupCallInfo(null), []);

  return (
    <>
      <CallRinger
        call={ringCall}
        groupCall={groupCallInfo}
        onAccept={() => ringCall && void acceptCall(ringCall.sessionId)}
        onDecline={() => ringCall && void declineCall(ringCall.sessionId)}
        onJoinGroup={() => navigate("/dashboard")}
        onDismissGroup={dismissGroup}
      />
      <MessagePopups
        messages={popups}
        onOpen={(key) =>
          navigate(`/dashboard?chat=${encodeURIComponent(key)}`)
        }
        onDismiss={(messageId) =>
          setPopups((prev) => prev.filter((p) => p.messageId !== messageId))
        }
      />
    </>
  );
}
