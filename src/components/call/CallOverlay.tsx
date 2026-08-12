import { motion } from "framer-motion";
import {
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCall } from "@/hooks/use-call";
import { UserAvatar } from "@/components/UserAvatar";

function useCallTimer(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  const elapsed = startedAt ? Math.max(0, now - startedAt) : 0;
  const mm = String(Math.floor(elapsed / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((elapsed % 60_000) / 1000)).padStart(2, "0");
  return `${mm}:${ss}`;
}

function connectionLabel(state: string): string {
  if (state === "connected") return "Connected";
  if (state === "connecting") return "Connecting…";
  if (state === "disconnected") return "Reconnecting…";
  if (state === "failed") return "Connection lost";
  return "Connecting…";
}

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
        className="size-28 text-3xl ring-4 ring-white/90"
      />
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  active,
  danger,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
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
      className={cn(
        "flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-colors",
        danger
          ? "bg-rose-500 shadow-rose-500/40 hover:bg-rose-500/90"
          : active
            ? "glass-strong text-slate-800"
            : "bg-sky-600/90 shadow-sky-600/40 hover:bg-sky-600",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export function CallOverlay() {
  const call = useCall();
  const { session, localStream, remoteStream, micOn, camOn, connectionState } =
    call;
  const timer = useCallTimer(session?.startedAt);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (!session) return null;

  const isCaller = call.isCaller;
  const other = isCaller ? session.callee : session.caller;
  const ringing = session.status === "ringing";

  return (
    <motion.div
      key={session._id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[100]"
    >
      <div className="app-bg absolute inset-0">
        <div className="absolute -top-32 -right-24 h-[32rem] w-[32rem] rounded-full bg-sky-300/50 blur-3xl" />
        <div className="absolute bottom-0 -left-32 h-[28rem] w-[28rem] rounded-full bg-indigo-300/40 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-200/50 blur-3xl" />
      </div>

      {ringing ? (
        <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
          <div className="flex flex-col items-center gap-6 text-center">
            <RingAvatar name={other.name} id={other._id} />
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700/70">
                {isCaller
                  ? session.kind === "video"
                    ? "Video call"
                    : "Voice call"
                  : "Incoming call"}
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-800">
                {other.name ?? "Guest"}
              </h2>
              <p className="mt-1 text-slate-500">
                {isCaller
                  ? "Ringing…"
                  : session.kind === "video"
                    ? "wants to video call you"
                    : "wants to talk to you"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {isCaller ? (
              <ControlButton label="Cancel call" onClick={call.endCall} danger>
                <PhoneOff className="size-6" />
              </ControlButton>
            ) : (
              <>
                <ControlButton
                  label="Decline"
                  onClick={call.declineCall}
                  danger
                  className="size-16"
                >
                  <PhoneOff className="size-7" />
                </ControlButton>
                <ControlButton
                  label="Accept"
                  onClick={call.acceptCall}
                  className="size-16 bg-emerald-500/95 shadow-emerald-500/40 hover:bg-emerald-500"
                >
                  <Phone className="size-7" />
                </ControlButton>
              </>
            )}
          </div>
        </div>
      ) : session.kind === "video" ? (
        <div className="relative h-full w-full overflow-hidden">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-sky-400/50"
                  animate={{ scale: [1, 1.4], opacity: [0.7, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                />
                <UserAvatar
                  name={other.name}
                  id={other._id}
                  className="size-24 text-2xl ring-4 ring-white/90"
                />
              </div>
              <p className="text-sm font-medium text-slate-600">
                Waiting for {other.name ?? "them"} to connect…
              </p>
            </div>
          )}

          {/* scrim for readability */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-white/40 to-transparent" />

          {/* top pill */}
          <div className="absolute inset-x-0 top-4 flex justify-center px-4">
            <div className="glass-strong flex items-center gap-3 rounded-full py-2 pl-4 pr-5">
              <UserAvatar name={other.name} id={other._id} className="size-8" />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-800">
                  {other.name ?? "Guest"}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  {connectionState !== "connected" && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  {timer} · {connectionLabel(connectionState)}
                </p>
              </div>
            </div>
          </div>

          {/* self preview */}
          <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
            <div className="glass-ring relative h-32 w-24 overflow-hidden rounded-2xl sm:h-40 sm:w-32">
              {localStream && camOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full -scale-x-100 object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-sky-500/20">
                  <CameraOff className="size-5 text-slate-500" />
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/50" />
            </div>
          </div>

          {/* controls */}
          <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-4">
            <ControlButton
              label={micOn ? "Mute microphone" : "Unmute microphone"}
              onClick={call.toggleMic}
              active={!micOn}
            >
              {micOn ? (
                <Mic className="size-6" />
              ) : (
                <MicOff className="size-6 text-rose-500" />
              )}
            </ControlButton>
            <ControlButton
              label={camOn ? "Turn camera off" : "Turn camera on"}
              onClick={call.toggleCam}
              active={!camOn}
            >
              {camOn ? (
                <Video className="size-6" />
              ) : (
                <CameraOff className="size-6 text-rose-500" />
              )}
            </ControlButton>
            <ControlButton label="End call" onClick={call.endCall} danger>
              <PhoneOff className="size-6" />
            </ControlButton>
          </div>
        </div>
      ) : (
        /* audio-only call */
        <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
          <div className="flex items-center gap-8 sm:gap-12">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={connectionState === "connected" ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <UserAvatar
                  name={other.name}
                  id={other._id}
                  className="size-24 text-2xl ring-4 ring-white/90 sm:size-32 sm:text-3xl"
                />
              </motion.div>
              <p className="text-sm font-semibold text-slate-700">
                {other.name ?? "Guest"}
              </p>
            </div>
            <div className="text-slate-500">
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                <Mic className="size-6" />
              </motion.div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <UserAvatar
                name="You"
                id={session.callerId === other._id ? session.calleeId : session.callerId}
                className="size-24 text-2xl ring-4 ring-white/90 sm:size-32 sm:text-3xl"
              />
              <p className="text-sm font-semibold text-slate-700">You</p>
            </div>
          </div>

          <div className="text-center">
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
              {connectionState !== "connected" && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {timer} · {connectionLabel(connectionState)}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <ControlButton
              label={micOn ? "Mute microphone" : "Unmute microphone"}
              onClick={call.toggleMic}
              active={!micOn}
            >
              {micOn ? (
                <Mic className="size-6" />
              ) : (
                <MicOff className="size-6 text-rose-500" />
              )}
            </ControlButton>
            <ControlButton label="End call" onClick={call.endCall} danger>
              <PhoneOff className="size-6" />
            </ControlButton>
          </div>
        </div>
      )}
    </motion.div>
  );
}
