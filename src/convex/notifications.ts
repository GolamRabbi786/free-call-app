import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./users";

// Keep in sync with the ringing timeout in calls.ts.
const RING_TIMEOUT_MS = 45_000;

/**
 * The ringing call where the current user is the callee, with the caller
 * attached. Used by the client to alert the user wherever they are in the app.
 */
export const incomingCall = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;

    const session = await ctx.db
      .query("callSessions")
      .withIndex("by_callee", (q) => q.eq("calleeId", me._id))
      .filter((q) => q.eq(q.field("status"), "ringing"))
      .order("desc")
      .first();
    if (!session) return null;
    if (Date.now() - session._creationTime > RING_TIMEOUT_MS) return null;

    const caller = await ctx.db.get(session.callerId);
    if (!caller) return null;

    return {
      _id: session._id,
      kind: session.kind,
      caller: { _id: caller._id, name: caller.name, image: caller.image },
    };
  },
});

function messagePreview(msg: {
  body?: string;
  attachment?: { name?: string } | null;
  kind?: string;
  callKind?: string;
  callStatus?: string;
  callDurationMs?: number;
}): string {
  if (msg.body) return msg.body.slice(0, 140);
  if (msg.attachment?.name) return `📎 ${msg.attachment.name}`;
  if (msg.kind === "call") {
    const label = msg.callKind === "video" ? "Video call" : "Voice call";
    if (msg.callStatus === "ended" && msg.callDurationMs) {
      const totalSeconds = Math.round(msg.callDurationMs / 1000);
      const mm = Math.floor(totalSeconds / 60);
      const ss = totalSeconds % 60;
      return `${label} · ${mm}m ${ss}s`;
    }
    if (msg.callStatus === "missed") {
      return `Missed ${msg.callKind === "video" ? "video" : "voice"} call`;
    }
    if (msg.callStatus === "declined") return `${label} declined`;
    return label;
  }
  return "New message";
}

/**
 * The latest incoming message for each of the current user's conversations
 * (direct chats + groups), with the sender/group name and a preview. The
 * client watches this query and only alerts when a brand-new messageId shows
 * up, so it can ring everywhere — even on the landing page.
 */
export const newMessages = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const results: {
      key: string;
      messageId: Id<"messages">;
      time: number;
      title: string;
      senderName: string;
      body: string;
    }[] = [];

    // Direct conversations where I'm a participant.
    const convos = await ctx.db.query("conversations").collect();
    for (const convo of convos) {
      if (convo.userA !== me._id && convo.userB !== me._id) continue;
      const last = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", convo._id),
        )
        .order("desc")
        .first();
      if (!last || last.senderId === me._id) continue;
      const sender = await ctx.db.get(last.senderId);
      const senderName = sender?.name ?? "Guest";
      results.push({
        key: `dm:${convo._id}`,
        messageId: last._id,
        time: last._creationTime,
        title: senderName,
        senderName,
        body: messagePreview(last),
      });
    }

    // Group chats where I'm a member.
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();
    for (const membership of memberships) {
      const group = await ctx.db.get(membership.groupId);
      if (!group) continue;
      const last = await ctx.db
        .query("messages")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();
      if (!last || last.senderId === me._id) continue;
      const sender = await ctx.db.get(last.senderId);
      const senderName = sender?.name ?? "Guest";
      results.push({
        key: `group:${group._id}`,
        messageId: last._id,
        time: last._creationTime,
        title: group.name,
        senderName,
        body: `${senderName}: ${messagePreview(last)}`,
      });
    }

    return results.sort((a, b) => b.time - a.time);
  },
});
