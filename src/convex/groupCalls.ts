import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser } from "./users";
import { callKindValidator } from "./schema";

function toPublicUser(user: { _id: string; name?: string; image?: string }) {
  return { _id: user._id, name: user.name, image: user.image };
}

async function isGroupMember(
  ctx: MutationCtx | Parameters<typeof getCurrentUser>[0],
  groupId: Id<"groups">,
  userId: Id<"users">,
) {
  return Boolean(
    await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first(),
  );
}

/** Start a group call: everyone in the group is a participant, join anytime. */
export const startGroupCall = mutation({
  args: { groupId: v.id("groups"), kind: callKindValidator },
  handler: async (ctx, { groupId, kind }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    if (!(await isGroupMember(ctx, groupId, me._id))) {
      throw new Error("Not a member of this group");
    }

    // Only one live group call per group at a time.
    const live = await ctx.db
      .query("groupCallSessions")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (live) {
      await ctx.db.patch(live._id, { status: "ended", endedAt: Date.now() });
    }

    const memberDocs = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const participantIds = memberDocs.map((m) => m.userId);

    return await ctx.db.insert("groupCallSessions", {
      groupId,
      initiatorId: me._id,
      kind,
      status: "active",
      participantIds,
      startedAt: Date.now(),
    });
  },
});

/** Either participant ends the group call. */
export const endGroupCall = mutation({
  args: { sessionId: v.id("groupCallSessions") },
  handler: async (ctx, { sessionId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Call not found");
    if (!session.participantIds.includes(me._id)) {
      throw new Error("Not part of this call");
    }
    if (session.status === "ended") return;

    const now = Date.now();
    await ctx.db.patch(sessionId, { status: "ended", endedAt: now });

    // Record the call in the group chat (once per session).
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_groupCallSession", (q) =>
        q.eq("callGroupSessionId", sessionId),
      )
      .first();
    if (existing) return;

    await ctx.db.insert("messages", {
      groupId: session.groupId,
      senderId: session.initiatorId,
      body: "",
      kind: "call",
      callKind: session.kind,
      callStatus: "ended",
      callDurationMs: session.startedAt ? now - session.startedAt : undefined,
      callGroupSessionId: sessionId,
    });
  },
});

/** Store a targeted WebRTC signaling message for a pair of participants. */
export const sendSignal = mutation({
  args: {
    sessionId: v.id("groupCallSessions"),
    to: v.id("users"),
    payload: v.any(),
  },
  handler: async (ctx, { sessionId, to, payload }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Call not found");
    if (!session.participantIds.includes(me._id)) {
      throw new Error("Not part of this call");
    }

    return await ctx.db.insert("groupCallSignals", {
      sessionId,
      from: me._id,
      to,
      payload,
    });
  },
});

/** All signaling messages for a group call (clients filter by target). */
export const listSignals = query({
  args: { sessionId: v.id("groupCallSessions") },
  handler: async (ctx, { sessionId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const session = await ctx.db.get(sessionId);
    if (!session || !session.participantIds.includes(me._id)) return [];

    return await ctx.db
      .query("groupCallSignals")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
  },
});

/**
 * The active group call involving the current user (if any), with the group
 * and its members attached for rendering the overlay.
 */
export const activeGroupCallFor = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;

    // Active sessions where this user is a participant (small table — scan).
    const sessions = await ctx.db
      .query("groupCallSessions")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const session = sessions
      .filter((s) => s.participantIds.includes(me._id))
      .sort((a, b) => b._creationTime - a._creationTime)[0];
    if (!session) return null;

    const group = await ctx.db.get(session.groupId);
    if (!group) return null;

    const memberDocs = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const memberUsers = (
      await Promise.all(memberDocs.map((m) => ctx.db.get(m.userId)))
    ).filter((u) => u !== null);

    return {
      ...session,
      group: { _id: group._id, name: group.name, image: group.image },
      members: memberUsers.map(toPublicUser),
    };
  },
});
