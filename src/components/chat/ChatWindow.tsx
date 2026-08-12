import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { ArrowLeft, MessageSquarePlus, Phone, Send, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";

type OtherUser = {
  _id: string;
  name?: string;
  image?: string;
} | null;

export function ChatWindow({
  otherUser,
  conversationId,
  isOnline,
  inCall,
  onCall,
  onBack,
}: {
  otherUser: OtherUser;
  conversationId: Id<"conversations"> | null;
  isOnline: boolean;
  inCall: boolean;
  onCall: (kind: "video" | "audio") => void;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const myId = user?._id;
  const messages = useQuery(
    api.messages.list,
    conversationId ? { conversationId } : "skip",
  );
  const sendMessage = useMutation(api.messages.send);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length, conversationId]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || !conversationId || sending) return;
    setSending(true);
    try {
      await sendMessage({ conversationId, body });
      setDraft("");
    } catch {
      /* error toast handled globally? keep quiet */
    } finally {
      setSending(false);
    }
  };

  if (!conversationId || !otherUser) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="glass-strong flex size-20 items-center justify-center rounded-3xl">
          <MessageSquarePlus className="size-9 text-sky-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            Pick someone to talk to
          </h2>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
            Choose a person from the People tab to start chatting, or make a
            free video or voice call.
          </p>
        </div>
      </div>
    );
  }

  const statusText = isOnline ? (inCall ? "In a call" : "Online") : "Offline";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="glass-soft flex items-center gap-3 border-b border-white/60 px-4 py-3">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 rounded-full text-slate-600 hover:bg-white/70 hover:text-slate-800 md:hidden"
            onClick={onBack}
            title="Back to chats"
            aria-label="Back to chats"
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <UserAvatar
          name={otherUser.name}
          image={otherUser.image}
          id={otherUser._id}
          className="size-10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800">
            {otherUser.name ?? "Guest"}
          </p>
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs",
              isOnline ? "text-emerald-600" : "text-slate-400",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                isOnline ? "bg-emerald-500" : "bg-slate-300",
              )}
            />
            {statusText}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-sky-700 hover:bg-sky-500/10 hover:text-sky-700"
          onClick={() => onCall("audio")}
          title="Free voice call"
        >
          <Phone className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-sky-700 hover:bg-sky-500/10 hover:text-sky-700"
          onClick={() => onCall("video")}
          title="Free video call"
        >
          <Video className="size-5" />
        </Button>
      </div>

      {/* messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {!messages ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-slate-600">
              No messages yet
            </p>
            <p className="max-w-xs text-xs text-slate-400">
              Say hello — or skip the typing and start a free call.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((message) => {
              const mine = message.senderId === myId;
              return (
                <div
                  key={message._id}
                  className={cn("flex w-full", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[65%]",
                      mine
                        ? "rounded-br-md bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-sky-500/25"
                        : "glass-soft rounded-bl-md text-slate-700",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {message.body}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-right text-[10px]",
                        mine ? "text-white/70" : "text-slate-400",
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
      <div className="border-t border-white/60 px-4 py-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Type a message…"
            className="glass-soft min-h-10 max-h-36 flex-1 resize-none rounded-2xl border-white/70 text-sm"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || sending}
            className="btn-gradient size-10 shrink-0 rounded-full"
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
