import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Users, Video, X } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

export type IncomingCallInfo = {
  sessionId: string;
  kind: "video" | "audio";
  caller: { _id: string; name?: string; image?: string };
};

export type ActiveGroupCallInfo = {
  sessionId: string;
  kind: "video" | "audio";
  groupName: string;
  initiatorName: string;
};

function RingAvatar({ name, id }: { name?: string; id?: string }) {
  return (
    <div className="relative">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-sky-400/50"
        animate={{ scale: [1, 1.55], opacity: [0.8, 0] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-indigo-400/40"
        animate={{ scale: [1, 1.55], opacity: [0.6, 0] }}
        transition={{
          duration: 1.9,
          repeat: Infinity,
          ease: "easeOut",
          delay: 0.35,
        }}
      />
      <UserAvatar
        name={name}
        id={id}
        className="size-28 text-3xl ring-4 ring-white/90 dark:ring-white/25"
      />
    </div>
  );
}

function RingButton({
  label,
  onClick,
  danger,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.06, y: -2 }}
      whileTap={{ scale: 0.94 }}
      className={`flex size-16 items-center justify-center rounded-full text-white shadow-lg transition-colors ${
        danger
          ? "bg-rose-500 shadow-rose-500/40 hover:bg-rose-500/90"
          : "bg-emerald-500/95 shadow-emerald-500/40 hover:bg-emerald-500"
      } ${className ?? ""}`}
    >
      {children}
    </motion.button>
  );
}

/**
 * Global call alerts rendered at the app root:
 *  - a full-screen incoming-call ring with Accept / Decline, and
 *  - a smaller "group call in progress" card with a Join button.
 *
 * Shown on every page (landing page included). On /dashboard the in-dashboard
 * CallOverlay already renders the call UI, so this component hides there.
 */
export function CallRinger({
  call,
  groupCall,
  onAccept,
  onDecline,
  onJoinGroup,
  onDismissGroup,
}: {
  call: IncomingCallInfo | null;
  groupCall: ActiveGroupCallInfo | null;
  onAccept: () => void;
  onDecline: () => void;
  onJoinGroup: () => void;
  onDismissGroup: () => void;
}) {
  return (
    <>
      <AnimatePresence>
        {call && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100]"
          >
            <div className="app-bg absolute inset-0">
              <div className="absolute -top-32 -right-24 h-[32rem] w-[32rem] rounded-full bg-sky-300/50 blur-3xl" />
              <div className="absolute bottom-0 -left-32 h-[28rem] w-[28rem] rounded-full bg-indigo-300/40 blur-3xl" />
              <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-200/50 blur-3xl" />
            </div>

            <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
              <div className="flex flex-col items-center gap-6 text-center">
                <RingAvatar name={call.caller.name} id={call.caller._id} />
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700/70">
                    Incoming {call.kind === "video" ? "video" : "voice"} call
                  </p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                    {call.caller.name ?? "Guest"}
                  </h2>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {call.kind === "video"
                      ? "wants to video call you"
                      : "wants to talk to you"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <RingButton label="Decline" onClick={onDecline} danger>
                  <PhoneOff className="size-7" />
                </RingButton>
                <RingButton label="Accept" onClick={onAccept}>
                  <Phone className="size-7" />
                </RingButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!call && groupCall && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="glass-strong pointer-events-auto fixed right-4 bottom-4 left-4 z-[90] rounded-2xl border-white/70 dark:border-white/15 p-4 shadow-xl shadow-sky-900/10 sm:left-auto sm:w-80"
          >
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismissGroup}
              className="absolute top-2.5 right-2.5 rounded-full p-1 text-slate-400 dark:text-slate-500 transition-colors hover: bg-white/70 dark:bg-white/10 hover: text-slate-600 dark:text-slate-300"
            >
              <X className="size-3.5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="btn-gradient flex size-11 shrink-0 items-center justify-center rounded-full text-white">
                {groupCall.kind === "video" ? (
                  <Video className="size-5" />
                ) : (
                  <Users className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {groupCall.groupName}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {groupCall.initiatorName} started a{" "}
                  {groupCall.kind === "video" ? "video" : "voice"} call
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onJoinGroup}
              className="btn-gradient mt-3 w-full rounded-xl py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Join call
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
