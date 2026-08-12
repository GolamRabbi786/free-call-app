import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { AppBackground } from "@/components/AppBackground";
import { CallOverlay } from "@/components/call/CallOverlay";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Sidebar, type SidebarTab } from "@/components/chat/Sidebar";
import { useCall } from "@/hooks/use-call";
import { usePresence } from "@/hooks/use-presence";

export default function Dashboard() {
  // Keep this user's presence heartbeat alive so others see them online.
  usePresence();

  // Single call instance — owns the WebRTC peer connection + signaling. It is
  // passed to CallOverlay (which renders it) and used here to start calls.
  const call = useCall();

  const getOrCreate = useMutation(api.conversations.getOrCreate);
  const onlineUsers = useQuery(api.presence.onlineUsers);

  const [tab, setTab] = useState<SidebarTab>("chats");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
    null,
  );
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(
    null,
  );

  const convo = useQuery(
    api.conversations.get,
    conversationId ? { conversationId } : "skip",
  );
  const otherUser = convo?.otherUser ?? null;

  const onlineMap = useMemo(() => {
    const map = new Map<string, { online: boolean; inCall: boolean }>();
    for (const u of onlineUsers ?? []) {
      map.set(u.userId, { online: true, inCall: Boolean(u.data?.inCall) });
    }
    return map;
  }, [onlineUsers]);

  const selectedStatus = selectedUserId
    ? onlineMap.get(selectedUserId) ?? { online: false, inCall: false }
    : { online: false, inCall: false };

  const handleSelectUser = async (userId: Id<"users">) => {
    setSelectedUserId(userId);
    try {
      const id = await getOrCreate({ otherUserId: userId });
      setConversationId(id);
    } catch {
      /* e.g. briefly unauthenticated — conversation will be created on retry */
    }
  };

  const handleStartCall = async (
    userId: Id<"users">,
    kind: "video" | "audio",
  ) => {
    // Make sure a conversation exists so the chat thread is ready too.
    if (userId !== selectedUserId) {
      await handleSelectUser(userId);
    }
    void call.startCall(userId, kind);
  };

  const closeChat = () => {
    setConversationId(null);
    setSelectedUserId(null);
  };

  // On small screens show either the sidebar or the open chat, never both.
  const showChat = conversationId !== null;

  return (
    <div className="app-bg min-h-screen text-foreground">
      <AppBackground />

      <div className="relative mx-auto flex h-screen max-w-7xl flex-col gap-4 p-3 sm:p-4 lg:p-6">
        <div className="flex min-h-0 flex-1 gap-4">
          <aside
            className={`w-full min-h-0 shrink-0 md:w-80 lg:w-96 ${
              showChat ? "hidden md:block" : "block"
            }`}
          >
            <Sidebar
              activeConversationId={conversationId}
              activeOtherUserId={selectedUserId}
              onSelectUser={(userId) => void handleSelectUser(userId)}
              onStartCall={(userId, kind) => void handleStartCall(userId, kind)}
              tab={tab}
              onTabChange={setTab}
            />
          </aside>

          <section
            className={`min-h-0 flex-1 ${
              showChat ? "flex" : "hidden md:flex"
            }`}
          >
            <div className="glass flex h-full w-full min-h-0 flex-col overflow-hidden rounded-3xl">
              <ChatWindow
                otherUser={otherUser}
                conversationId={conversationId}
                isOnline={selectedStatus.online}
                inCall={selectedStatus.inCall}
                onCall={(kind) => {
                  if (otherUser) {
                    void call.startCall(otherUser._id as Id<"users">, kind);
                  }
                }}
                onBack={closeChat}
              />
            </div>
          </section>
        </div>
      </div>

      <CallOverlay call={call} />
    </div>
  );
}
