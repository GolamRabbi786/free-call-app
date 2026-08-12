import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format, isToday, isYesterday } from "date-fns";
import {
  LogOut,
  Pencil,
  Phone,
  Search,
  Video,
  Wifi,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { describeCallMessage } from "@/lib/call-history";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";

export type SidebarTab = "chats" | "people";

function conversationTime(ts?: number): string {
  if (!ts) return "";
  if (isToday(ts)) return format(ts, "h:mm a");
  if (isYesterday(ts)) return "Yesterday";
  return format(ts, "MMM d");
}

export function Sidebar({
  activeConversationId,
  activeOtherUserId,
  onSelectUser,
  onStartCall,
  tab,
  onTabChange,
}: {
  activeConversationId: Id<"conversations"> | null;
  activeOtherUserId: Id<"users"> | null;
  onSelectUser: (userId: Id<"users">) => void;
  onStartCall: (userId: Id<"users">, kind: "video" | "audio") => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const conversations = useQuery(api.conversations.listForMe);
  const people = useQuery(api.users.listPeople);
  const onlineUsers = useQuery(api.presence.onlineUsers);
  const updateProfile = useMutation(api.users.updateProfile);

  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const onlineMap = useMemo(() => {
    const map = new Map<string, { online: boolean; inCall: boolean }>();
    for (const u of onlineUsers ?? []) {
      map.set(u.userId, { online: true, inCall: Boolean(u.data?.inCall) });
    }
    return map;
  }, [onlineUsers]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people ?? [];
    if (!q) return list;
    return list.filter((p) => (p.name ?? "").toLowerCase().includes(q));
  }, [people, query]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const openEdit = () => {
    setNameDraft(user?.name ?? "");
    setEditOpen(true);
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setSavingName(true);
    try {
      await updateProfile({ name });
      setEditOpen(false);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-3xl">
      {/* app header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="size-10 shrink-0 overflow-hidden rounded-xl shadow-lg">
          <img
            src={logo}
            alt="Free Call"
            className="size-full object-cover"
            draggable={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight tracking-tight text-slate-800">
            Free Call
          </p>
          <p className="text-[11px] text-slate-500">Voice, video &amp; chat</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-slate-500 hover:bg-white/60 hover:text-slate-700"
          onClick={handleSignOut}
          title="Sign out"
        >
          <LogOut className="size-4" />
        </Button>
      </div>

      {/* my profile */}
      <div className="mx-4 mt-1 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/45 px-3 py-2.5">
        <UserAvatar
          name={user?.name}
          image={user?.image}
          id={user?._id}
          className="size-9"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {user?.name ?? "Guest"}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-emerald-600">
            <Wifi className="size-3" /> You&apos;re online
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-slate-500 hover:bg-white/70 hover:text-slate-700"
          onClick={openEdit}
          title="Edit display name"
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      {/* search */}
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="glass-soft rounded-xl border-white/70 pl-9 text-sm"
          />
        </div>
      </div>

      {/* tabs */}
      <div className="px-4 pt-3">
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as SidebarTab)}
        >
          <TabsList className="glass-soft w-full rounded-xl">
            <TabsTrigger
              value="chats"
              className="flex-1 rounded-lg data-[state=active]:bg-white/80"
            >
              Chats
            </TabsTrigger>
            <TabsTrigger
              value="people"
              className="flex-1 rounded-lg data-[state=active]:bg-white/80"
            >
              People
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tab === "chats" ? (
          <div className="flex flex-col gap-1">
            {!conversations ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">
                Loading…
              </p>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs leading-5 text-slate-400">
                No chats yet.
                <br />
                Head to People and start one!
              </p>
            ) : (
              conversations.map(({ conversation, otherUser, lastMessage }) => {
                if (!otherUser) return null;
                const active =
                  conversation._id === activeConversationId ||
                  otherUser._id === activeOtherUserId;
                const online = onlineMap.has(otherUser._id);
                return (
                  <button
                    key={conversation._id}
                    type="button"
                    onClick={() => onSelectUser(otherUser._id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-white/80 shadow-sm ring-1 ring-white/70"
                        : "hover:bg-white/50",
                    )}
                  >
                    <div className="relative">
                      <UserAvatar
                        name={otherUser.name}
                        image={otherUser.image}
                        id={otherUser._id}
                        className="size-10"
                      />
                      <span
                        className={cn(
                          "absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white",
                          online ? "bg-emerald-500" : "bg-slate-300",
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {otherUser.name ?? "Guest"}
                        </p>
                        {lastMessage && (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {conversationTime(lastMessage._creationTime)}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {lastMessage
                          ? lastMessage.kind === "call"
                            ? `${lastMessage.senderId === user?._id ? "You: " : ""}${describeCallMessage(lastMessage)}`
                            : lastMessage.senderId === user?._id
                              ? `You: ${lastMessage.body}`
                              : lastMessage.body
                          : "Say hello 👋"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {!filteredPeople ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">
                Loading…
              </p>
            ) : filteredPeople.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Avatar className="mx-auto size-12 ring-2 ring-white/80">
                  <AvatarFallback className="bg-sky-100 font-semibold text-sky-600">
                    {query ? "0" : "👋"}
                  </AvatarFallback>
                </Avatar>
                <p className="mt-3 text-sm font-medium text-slate-600">
                  {query ? "No one matches that name" : "No one here yet"}
                </p>
                <p className="mx-auto mt-1 max-w-[200px] text-xs leading-5 text-slate-400">
                  {query
                    ? "Try a different name."
                    : "Sign in from another browser or device with a different account to see them here."}
                </p>
              </div>
            ) : (
              filteredPeople.map((person) => {
                const status = onlineMap.get(person._id);
                const active = person._id === activeOtherUserId;
                return (
                  <div
                    key={person._id}
                    className={cn(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors",
                      active ? "bg-white/80 shadow-sm ring-1 ring-white/70" : "hover:bg-white/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectUser(person._id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="relative">
                        <UserAvatar
                          name={person.name}
                          image={person.image}
                          id={person._id}
                          className="size-10"
                        />
                        <span
                          className={cn(
                            "absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white",
                            status?.online ? "bg-emerald-500" : "bg-slate-300",
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {person.name ?? "Guest"}
                        </p>
                        <p
                          className={cn(
                            "text-[11px]",
                            status?.inCall
                              ? "text-sky-600"
                              : status?.online
                                ? "text-emerald-600"
                                : "text-slate-400",
                          )}
                        >
                          {status?.inCall
                            ? "In a call"
                            : status?.online
                              ? "Online"
                              : "Offline"}
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full text-sky-700 hover:bg-sky-500/10 hover:text-sky-700"
                        onClick={() => onStartCall(person._id, "audio")}
                        title="Free voice call"
                      >
                        <Phone className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full text-sky-700 hover:bg-sky-500/10 hover:text-sky-700"
                        onClick={() => onStartCall(person._id, "video")}
                        title="Free video call"
                      >
                        <Video className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* edit name dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="glass-strong max-w-sm rounded-3xl border-white/70">
          <DialogHeader>
            <DialogTitle>Edit display name</DialogTitle>
            <DialogDescription>
              This is the name people see when you call or chat.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Your name"
            className="glass-soft rounded-xl border-white/70"
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveName();
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!nameDraft.trim() || savingName}
              onClick={() => void saveName()}
              className="btn-gradient"
            >
              {savingName ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
