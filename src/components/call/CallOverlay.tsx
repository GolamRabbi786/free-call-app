import { motion } from "framer-motion";
import {
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCall } from "@/hooks/use-call";
import type { useGroupCall } from "@/hooks/use-group-call";
import { useAuth } from "@/hooks/use-auth";
import { attachMedia } from "@/lib/webrtc";
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

function GroupCallScreen({
  groupCall,
}: {
  groupCall: ReturnType<typeof useGroupCall>;
}) {
  const { user } = useAuth();
  const myId = user?._id;
  const { session, localStream, remoteStreams, micOn, camOn } = groupCall;
  const timer = useCallTimer(session?.startedAt);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    if (localVideoRef.current) {
      attachMedia(localVideoRef.current, localStream);
    }
  }, [localStream]);

  useEffect(() => {
    for (const [peerId, stream] of Object.entries(remoteStreams)) {
      const el = videoRefs.current[peerId];
      if (el) attachMedia(el, stream);
      const audioEl = audioRefs.current[peerId];
      if (audioEl) attachMedia(audioEl, stream);
    }
  }, [remoteStreams]);

  if (!session) return null;

  const participants = session.participantIds.filter((p) => p !== myId);
  const memberOf = (id: string) =>
    session.members.find((m) => m._id === id) ?? {
      _id: id,
      name: undefined,
      image: undefined,
    };

  const isVideo = session.kind === "video";

  return (
    <div className="relative flex h-full flex-col">
      {/* top pill */}
      <div className="absolute inset-x-0 top-4 z-10 flex justify-center px-4">
        <div className="glass-strong flex items-center gap-3 rounded-full py-2 pl-4 pr-5">
          <span className="btn-gradient flex size-8 items-center justify-center rounded-full text-white">
            <Users className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800">
              {session.group.name} · {participants.length + 1} people
            </p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              {timer} · {isVideo ? "Group video call" : "Group voice call"}
            </p>
          </div>
        </div>
      </div>

      {isVideo ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-20 sm:p-6 sm:pt-24">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((participantId) => {
              const member = memberOf(participantId);
              const stream = remoteStreams[participantId];
              return (
                <div
                  key={participantId}
                  className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400/60 to-indigo-400/60 ring-1 ring-white/60"
                >
                  {stream ? (
                    <video
                      ref={(el) => {
                        videoRefs.current[participantId] = el;
                      }}
                      autoPlay
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <UserAvatar
                        name={member.name}
                        image={member.image}
                        id={member._id}
                        className="size-14 text-xl ring-4 ring-white/80"
                      />
                      <p className="text-xs font-semibold text-white/90">
                        {member.name ?? "Guest"}
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent px-3 pb-2 pt-6">
                    <p className="truncate text-xs font-semibold text-white">
                      {member.name ?? "Guest"}
                    </p>
                  </div>
                </div>
              );
            })}
            {/* me */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400/60 to-indigo-400/60 ring-1 ring-white/60">
              {localStream && camOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <UserAvatar
                    name={user?.name}
                    image={user?.image}
                    id={user?._id}
                    className="size-14 text-xl ring-4 ring-white/80"
                  />
                  <p className="text-xs font-semibold text-white/90">
                    {user?.name ?? "You"} (You)
                  </p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent px-3 pb-2 pt-6">
                <p className="truncate text-xs font-semibold text-white">
                  {user?.name ?? "You"} (You)
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pt-16">
          {/* remote audio — voice calls have no video element, so play each
              participant's stream through a hidden audio element instead */}
          {Object.keys(remoteStreams).map((peerId) => (
            <audio
              key={peerId}
              ref={(el) => {
                audioRefs.current[peerId] = el;
              }}
              autoPlay
              playsInline
              className="hidden"
            />
          ))}
          <div className="flex flex-wrap items-center justify-center gap-6">
            {participants.map((participantId) => {
              const member = memberOf(participantId);
              return (
                <div
                  key={participantId}
                  className="flex flex-col items-center gap-2.5"
                >
                  <motion.div
                    animate={remoteStreams[participantId] ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <UserAvatar
                      name={member.name}
                      image={member.image}
                      id={member._id}
                      className="size-20 text-xl ring-4 ring-white/90 sm:size-24"
                    />
                  </motion.div>
                  <p className="text-sm font-semibold text-slate-700">
                    {member.name ?? "Guest"}
                  </p>
                </div>
              );
            })}
            <div className="flex flex-col items-center gap-2.5">
              <UserAvatar
                name={user?.name}
                image={user?.image}
                id={user?._id}
                className="size-20 text-xl ring-4 ring-white/90 sm:size-24"
              />
              <p className="text-sm font-semibold text-slate-700">
                {user?.name ?? "You"} (You)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <Mic className="size-5" />
            </motion.div>
            <p className="text-sm">{timer}</p>
          </div>
        </div>
      )}

      {/* controls */}
      <div className="relative z-10 flex items-center justify-center gap-4 pb-8">
        <ControlButton
          label={micOn ? "Mute microphone" : "Unmute microphone"}
          onClick={groupCall.toggleMic}
          active={!micOn}
        >
          {micOn ? (
            <Mic className="size-6" />
          ) : (
            <MicOff className="size-6 text-rose-500" />
          )}
        </ControlButton>
        {isVideo && (
          <ControlButton
            label={camOn ? "Turn camera off" : "Turn camera on"}
            onClick={groupCall.toggleCam}
            active={!camOn}
          >
            {camOn ? (
              <Video className="size-6" />
            ) : (
              <CameraOff className="size-6 text-rose-500" />
            )}
          </ControlButton>
        )}
        <ControlButton label="End call" onClick={groupCall.endGroupCall} danger>
          <PhoneOff className="size-6" />
        </ControlButton>
      </div>
    </div>
  );
}

export function CallOverlay({
  call,
  groupCall,
}: {
  call: ReturnType<typeof useCall>;
  groupCall?: ReturnType<typeof useGroupCall>;
}) {
  const { session, localStream, remoteStream, micOn, camOn, connectionState } =
    call;
  const timer = useCallTimer(session?.startedAt);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current) {
      attachMedia(remoteVideoRef.current, remoteStream);
    }
    if (remoteAudioRef.current) {
      attachMedia(remoteAudioRef.current, remoteStream);
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current) {
      attachMedia(localVideoRef.current, localStream);
    }
  }, [localStream]);

  const groupSession = groupCall?.session;
  if (!session && !groupSession) return null;

  return (
    <motion.div
      key={groupSession?._id ?? session?._id}
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

      {groupSession ? (
        <div className="relative h-full">
          <GroupCallScreen groupCall={groupCall!} />
        </div>
      ) : !session ? null : (
        (() => {
          const isCaller = call.isCaller;
          const other = isCaller ? session.callee : session.caller;
          const ringing = session.status === "ringing";

          if (ringing) {
            return (
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
            );
          }

          if (session.kind === "video") {
            return (
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
            );
          }

          return (
            /* audio-only call */
            <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
              {/* hidden element that plays the remote side's voice */}
              <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
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
          );
        })()
      )}
    </motion.div>
  );
}
