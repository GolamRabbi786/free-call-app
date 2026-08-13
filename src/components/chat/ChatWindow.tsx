import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Mic,
  MessageSquarePlus,
  Paperclip,
  Pause,
  Phone,
  PhoneMissed,
  Play,
  Send,
  Square,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { setActiveChat } from "@/lib/active-chat";
import { describeCallMessage } from "@/lib/call-history";
import { compressImage, uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";

type OtherUser = {
  _id: string;
  name?: string;
  image?: string;
} | null;

type GroupMember = { _id: string; name?: string; image?: string };

type GroupData = {
  _id: string;
  name: string;
  image?: string;
  members: GroupMember[];
} | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isImageType(type: string) {
  return type.startsWith("image/");
}

function isVideoType(type: string) {
  return type.startsWith("video/");
}

const MAX_VOICE_SECONDS = 60;

/** Play/pause a voice message with a progress bar + duration. */
function VoicePlayer({
  url,
  durationMs,
  mine,
}: {
  url: string;
  durationMs: number;
  mine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().catch(() => {
        setPlaying(false);
      });
      setPlaying(true);
    }
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress(audio.currentTime / audio.duration);
    setElapsed(audio.currentTime * 1000);
  };

  const onEnded = () => {
    setPlaying(false);
    setProgress(0);
    setElapsed(0);
  };

  const shownMs = playing || progress > 0 ? elapsed : durationMs;

  return (
    <div className="flex min-w-[180px] max-w-[240px] items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105",
          mine
            ? "bg-white/25 text-white"
            : "bg-sky-500/15 text-sky-600 dark:text-sky-300",
        )}
      >
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 fill-current pl-0.5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-current opacity-20">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-current opacity-90"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <p
          className={cn(
            "mt-1 text-[10px] tabular-nums",
            mine ? "text-white/70" : "text-slate-400 dark:text-slate-500",
          )}
        >
          {formatDuration(shownMs)}
        </p>
      </div>
    </div>
  );
}

export function ChatWindow({
  otherUser,
  group,
  conversationId,
  groupId,
  isOnline,
  inCall,
  onCall,
  onGroupCall,
  onBack,
}: {
  otherUser: OtherUser;
  group: GroupData;
  conversationId: Id<"conversations"> | null;
  groupId: Id<"groups"> | null;
  isOnline: boolean;
  inCall: boolean;
  onCall: (kind: "video" | "audio") => void;
  onGroupCall: (kind: "video" | "audio") => void;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const myId = user?._id;
  const isGroup = Boolean(groupId && group);

  const directMessages = useQuery(
    api.messages.list,
    conversationId ? { conversationId } : "skip",
  );
  const groupMessages = useQuery(
    api.messages.listGroup,
    groupId ? { groupId } : "skip",
  );
  const messages = conversationId ? directMessages : groupId ? groupMessages : undefined;
  const sendMessage = useMutation(api.messages.send);
  const sendGroup = useMutation(api.messages.sendGroup);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const sendAttachment = useMutation(api.messages.sendAttachment);
  const sendGroupAttachment = useMutation(api.messages.sendGroupAttachment);
  const sendVoice = useMutation(api.messages.sendVoice);
  const sendGroupVoice = useMutation(api.messages.sendGroupVoice);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // voice recording
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, conversationId, groupId]);

  // Tell the global notification watcher which chat is open, so it doesn't
  // alert for a message we're already looking at.
  useEffect(() => {
    const key = groupId
      ? `group:${groupId}`
      : conversationId
        ? `dm:${conversationId}`
        : null;
    setActiveChat(key);
    return () => setActiveChat(null);
  }, [conversationId, groupId]);

  const stopRecordingTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording isn't supported on this device");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        stopRecordingTracks();
        setRecording(false);
        setRecordingSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);
        if (blob.size > 0) void sendRecording(blob, durationMs);
      };
      startedAtRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setRecordingSeconds(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS) {
          stopRecording();
        }
      }, 500);
    } catch (error) {
      toast.error(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access was denied — allow it in your browser settings"
          : "Could not start the microphone",
      );
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      setRecording(false);
      setRecordingSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
      stopRecordingTracks();
    }
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    chunksRef.current = [];
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    stopRecordingTracks();
    setRecording(false);
    setRecordingSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const sendRecording = async (blob: Blob, durationMs: number) => {
    if (!conversationId && !groupId) return;
    setVoiceBusy(true);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, {
        type: blob.type || "audio/webm",
      });
      const storageId = await uploadToConvex(file, () =>
        generateUploadUrl(),
      );
      if (groupId) {
        await sendGroupVoice({
          groupId,
          storageId: storageId as Id<"_storage">,
          durationMs,
        });
      } else if (conversationId) {
        await sendVoice({
          conversationId,
          storageId: storageId as Id<"_storage">,
          durationMs,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the voice message",
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || (!conversationId && !groupId) || sending) return;
    setSending(true);
    try {
      if (groupId) {
        await sendGroup({ groupId, body });
      } else if (conversationId) {
        await sendMessage({ conversationId, body });
      }
      setDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the message",
      );
    } finally {
      setSending(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || (!conversationId && !groupId)) return;
    setUploading(true);
    try {
      const processed = await compressImage(file);
      const storageId = await uploadToConvex(processed, () =>
        generateUploadUrl(),
      );
      const id = storageId as Id<"_storage">;
      const meta = {
        storageId: id,
        name: processed.name,
        type: processed.type,
        size: processed.size,
      };
      if (groupId) {
        await sendGroupAttachment({ groupId, ...meta });
      } else if (conversationId) {
        await sendAttachment({ conversationId, ...meta });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the file",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const placeholder = isGroup
    ? "Message the group…"
    : "Type a message…";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="glass-soft flex items-center gap-3 border-b border-white/60 px-4 py-3 dark:border-white/10">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 rounded-full text-slate-600 hover:bg-white/70 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100 md:hidden"
            onClick={onBack}
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <UserAvatar
          name={isGroup ? group?.name : otherUser?.name}
          image={isGroup ? group?.image : otherUser?.image}
          id={isGroup ? group?._id : otherUser?._id}
          className="size-10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
            {isGroup ? group?.name ?? "Group" : otherUser?.name ?? "Guest"}
          </p>
          {isGroup ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {group?.members.length ?? 0} members
            </p>
          ) : (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                isOnline
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-400 dark:text-slate-500",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isOnline ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600",
                )}
              />
              {inCall ? "In a call" : isOnline ? "Online" : "Offline"}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-sky-700 hover:bg-sky-500/10 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-300"
          onClick={() => (isGroup ? onGroupCall("audio") : onCall("audio"))}
          title={isGroup ? "Free group voice call" : "Free voice call"}
        >
          <Phone className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-sky-700 hover:bg-sky-500/10 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-300"
          onClick={() => (isGroup ? onGroupCall("video") : onCall("video"))}
          title={isGroup ? "Free group video call" : "Free video call"}
        >
          <Video className="size-5" />
        </Button>
      </div>

      {/* messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {!messages ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageSquarePlus className="size-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              No messages yet
            </p>
            <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">
              {isGroup
                ? "Say hello to the group — or start a free group call."
                : "Say hello — or skip the typing and start a free call."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((message) => {
              // Call-history entries render as a centered chip.
              if (message.kind === "call") {
                const missed =
                  message.callStatus === "missed" ||
                  message.callStatus === "declined";
                const cancelled =
                  message.callStatus === "ended" && !message.callDurationMs;
                return (
                  <div
                    key={message._id}
                    className="flex w-full justify-center"
                  >
                    <div
                      className={cn(
                        "glass-soft flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-sm",
                        missed
                          ? "text-rose-600 dark:text-rose-400"
                          : cancelled
                            ? "text-slate-500 dark:text-slate-400"
                            : "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {missed ? (
                        <PhoneMissed className="size-3.5" />
                      ) : message.callKind === "video" ? (
                        <Video className="size-3.5" />
                      ) : (
                        <Phone className="size-3.5" />
                      )}
                      <span>{describeCallMessage(message, { group: isGroup })}</span>
                      <span className="text-slate-400 dark:text-slate-500">
                        {format(message._creationTime, "h:mm a")}
                      </span>
                    </div>
                  </div>
                );
              }

              const mine = message.senderId === myId;
              const senderName = isGroup
                ? group?.members.find((m) => m._id === message.senderId)?.name
                : undefined;
              const attachment = message.attachment;

              return (
                <div
                  key={message._id}
                  className={cn("flex w-full flex-col", mine ? "items-end" : "items-start")}
                >
                  {isGroup && !mine && senderName && (
                    <p className="mb-1 px-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      {senderName}
                    </p>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[65%]",
                      mine
                        ? "rounded-br-md bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-sky-500/25"
                        : "glass-soft rounded-bl-md text-slate-700 dark:text-slate-200",
                    )}
                  >
                    {message.kind === "voice" && message.voice ? (
                      <VoicePlayer
                        url={message.voice.url}
                        durationMs={message.voice.durationMs}
                        mine={mine}
                      />
                    ) : attachment ? (
                      isImageType(attachment.type) ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-xl"
                        >
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            loading="lazy"
                            className="max-h-72 w-full object-cover"
                          />
                        </a>
                      ) : isVideoType(attachment.type) ? (
                        <video
                          src={attachment.url}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-h-72 w-full rounded-xl"
                        />
                      ) : (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-1 py-0.5",
                            mine
                              ? "text-white"
                              : "text-slate-700 dark:text-slate-200",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-xl",
                              mine ? "bg-white/20" : "bg-sky-500/10 text-sky-600 dark:text-sky-300",
                            )}
                          >
                            <FileText className="size-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block max-w-[180px] truncate text-sm font-semibold">
                              {attachment.name}
                            </span>
                            <span
                              className={cn(
                                "block text-[11px]",
                                mine ? "text-white/70" : "text-slate-400 dark:text-slate-500",
                              )}
                            >
                              {formatBytes(attachment.size)} · Tap to open
                            </span>
                          </span>
                        </a>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.body}
                      </p>
                    )}
                    <p
                      className={cn(
                        "mt-1 text-right text-[10px]",
                        mine ? "text-white/70" : "text-slate-400 dark:text-slate-500",
                      )}
                    >
                      {format(message._creationTime, "h:mm a")}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-white/60 px-4 py-3 dark:border-white/10">
        {recording ? (
          <div className="glass-soft flex items-center gap-3 rounded-2xl border border-rose-200/70 px-4 py-2.5 dark:border-rose-400/20">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-rose-500" />
            </span>
            <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Recording…{" "}
              <span className="tabular-nums text-rose-500 dark:text-rose-400">
                {formatDuration(recordingSeconds * 1000)}
              </span>
              <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                / {formatDuration(MAX_VOICE_SECONDS * 1000)}
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              onClick={cancelRecording}
              title="Cancel recording"
              aria-label="Cancel recording"
            >
              <X className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              disabled={voiceBusy}
              onClick={stopRecording}
              className="btn-gradient size-10 shrink-0 rounded-full"
              title="Send voice message"
              aria-label="Send voice message"
            >
              {voiceBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Square className="size-4 fill-current" />
              )}
            </Button>
          </div>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded-full text-slate-500 hover:bg-white/70 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-sky-300"
              title="Share a photo, video or file"
              aria-label="Share a photo, video or file"
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin text-sky-600 dark:text-sky-300" />
              ) : (
                <Paperclip className="size-5" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={voiceBusy || uploading}
              onClick={() => void startRecording()}
              className={cn(
                "shrink-0 rounded-full text-slate-500 hover:bg-white/70 hover:text-rose-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-rose-400",
                voiceBusy && "animate-pulse text-rose-500",
              )}
              title="Record a voice message"
              aria-label="Record a voice message"
            >
              <Mic className="size-5" />
            </Button>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={uploading ? "Uploading…" : placeholder}
              disabled={uploading}
              className="glass-soft min-h-10 max-h-36 flex-1 resize-none rounded-2xl border-white/70 text-sm dark:border-white/15"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || sending || uploading}
              className="btn-gradient size-10 shrink-0 rounded-full"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
