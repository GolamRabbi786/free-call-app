import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { AppBackground } from "@/components/AppBackground";
import { CallOverlay } from "@/components/call/CallOverlay";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Sidebar, type SidebarTab } from "@/components/chat/Sidebar";
import { useCall } from "@/hooks/use-call";
import { useGroupCall } from "@/hooks/use-group-call";
import { usePresence } from "@/hooks/use-presence";

export default function Dashboard() {
  // Keep this user's presence heartbeat alive so others see them online.
  usePresence();

  // Single call instances — own the WebRTC peer connections + signaling.
  const call = useCall();
  const groupCall = useGroupCall();

  const getOrCreate = useMutation(api.conversations.getOrCreate);
  const onlineUsers = useQuery(api.presence.onlineUsers);

  const [tab, setTab] = useState<SidebarTab>("chats");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
    null,
  );
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(
    null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<Id<"groups"> | null>(
    null,
  );

  const convo = useQuery(
    api.conversations.get,
    conversationId ? { conversationId } : "skip",
  );
  const groupView = useQuery(
    api.groups.get,
    selectedGroupId ? { groupId: selectedGroupId } : "skip",
  );
  const otherUser = convo?.otherUser ?? null;
  const group = groupView ? { ...groupView.group, members: groupView.members } : null;

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
    setSelectedGroupId(null);
    try {
      const id = await getOrCreate({ otherUserId: userId });
      setConversationId(id);
    } catch {
      /* e.g. briefly unauthenticated — conversation will be created on retry */
    }
  };

  const handleSelectGroup = (groupId: Id<"groups">) => {
    setSelectedGroupId(groupId);
    setSelectedUserId(null);
    setConversationId(null);
    setTab("groups");
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
    setSelectedGroupId(null);
  };

  // On small screens show either the sidebar or the open chat, never both.
  const showChat = conversationId !== null || selectedGroupId !== null;

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
              activeGroupId={selectedGroupId}
              onSelectUser={(userId) => void handleSelectUser(userId)}
              onSelectGroup={handleSelectGroup}
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
                group={group}
                conversationId={conversationId}
                groupId={selectedGroupId}
                isOnline={selectedStatus.online}
                inCall={selectedStatus.inCall}
                onCall={(kind) => {
                  if (otherUser) {
                    void call.startCall(otherUser._id as Id<"users">, kind);
                  }
                }}
                onGroupCall={(kind) => {
                  if (selectedGroupId) {
                    void groupCall.startGroupCall(selectedGroupId, kind);
                  }
                }}
                onBack={closeChat}
              />
            </div>
          </section>
        </div>
      </div>

      <CallOverlay call={call} groupCall={groupCall} />
    </div>
  );
}
