import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareText, X } from "lucide-react";
import { useEffect } from "react";
import { UserAvatar } from "@/components/UserAvatar";

export type PopupMessage = {
  key: string; // "dm:<conversationId>" | "group:<groupId>"
  messageId: string;
  title: string; // sender name (DM) or group name
  senderName: string;
  body: string;
};

const AUTO_DISMISS_MS = 10_000;

function PopupCard({
  message,
  onOpen,
  onDismiss,
}: {
  message: PopupMessage;
  onOpen: (key: string) => void;
  onDismiss: (messageId: string) => void;
}) {
  // Auto-dismiss after a few seconds so popups never pile up.
  useEffect(() => {
    const timer = setTimeout(
      () => onDismiss(message.messageId),
      AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [message.messageId, onDismiss]);

  const isGroup = message.key.startsWith("group:");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="glass-strong pointer-events-auto relative w-full overflow-hidden rounded-2xl border-white/70 dark:border-white/15 shadow-xl shadow-sky-900/10"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="relative shrink-0">
          {isGroup ? (
            <div className="btn-gradient flex size-10 items-center justify-center rounded-full text-white">
              <MessageSquareText className="size-4" />
            </div>
          ) : (
            <UserAvatar name={message.senderName} className="size-10" />
          )}
          <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-sky-500 ring-2 ring-white dark:ring-white/25" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {message.title}
            <span className="truncate text-[10px] font-normal text-slate-400 dark:text-slate-500">
              {isGroup ? "Group message" : "New message"}
            </span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
            {message.body}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss(message.messageId)}
          className="rounded-full p-1 text-slate-400 dark:text-slate-500 transition-colors hover: bg-white/70 dark:bg-white/10 hover:text-slate-600"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onOpen(message.key)}
        className="btn-gradient block w-full px-3 py-2 text-center text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        Open chat
      </button>
    </motion.div>
  );
}

/**
 * Stacked glass popup windows for incoming messages. Rendered at the app root
 * so a new message pops up no matter which page the user is on.
 */
export function MessagePopups({
  messages,
  onOpen,
  onDismiss,
}: {
  messages: PopupMessage[];
  onOpen: (key: string) => void;
  onDismiss: (messageId: string) => void;
}) {
  if (messages.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[80] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:top-24 sm:bottom-auto sm:w-80">
      <AnimatePresence mode="popLayout">
        {messages.map((message) => (
          <PopupCard
            key={message.messageId}
            message={message}
            onOpen={onOpen}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
