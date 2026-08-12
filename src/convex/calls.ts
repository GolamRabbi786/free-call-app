import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser } from "./users";
import { callKindValidator } from "./schema";

// Ringing sessions older than this are treated as stale/missed.
const RING_TIMEOUT_MS = 45_000;
// Sessions older than this are never surfaced as "active" (safety net).
const STALE_SESSION_MS = 5 * 60_000;

function toPublicUser(user: { _id: string; name?: string; image?: string }) {
  return { _id: user._id, name: user.name, image: user.image };
}

/** Find the 1:1 conversation between two users, creating it if needed. */
async function findOrCreateConversation(
  ctx: MutationCtx,
  a: Id<"users">,
  b: Id<"users">,
) {
  const [userA, userB] = a < b ? [a, b] : [b, a];
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_userA", (q) => q.eq("userA", userA))
    .filter((q) => q.eq(q.field("userB"), userB))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("conversations", { userA, userB });
}

/**
 * Write a call-history entry into the conversation between caller and callee
 * once a session reaches a terminal state. Idempotent per session so both
 * participants ending the call never produces a duplicate entry.
 */
async function recordCallMessage(
  ctx: MutationCtx,
  session: {
    _id: Id<"callSessions">;
    callerId: Id<"users">;
    calleeId: Id<"users">;
    kind: "video" | "audio";
    startedAt?: number;
  },
  finalStatus: "ended" | "declined" | "missed",
  now: number,
) {
  const existing = await ctx.db
    .query("messages")
    .withIndex("by_callSession", (q) => q.eq("callSessionId", session._id))
    .first();
  if (existing) return;

  const conversationId = await findOrCreateConversation(
    ctx,
    session.callerId,
    session.calleeId,
  );
  const callDurationMs =
    finalStatus === "ended" && session.startedAt
      ? now - session.startedAt
      : undefined;

  await ctx.db.insert("messages", {
    conversationId,
    senderId: session.callerId,
    body: "",
    kind: "call",
    callKind: session.kind,
    callStatus: finalStatus,
    callDurationMs,
    callSessionId: session._id,
  });
}

/** Start a new call: ends any stale ringing sessions, then inserts a ringing session. */
export const startCall = mutation({
  args: { calleeId: v.id("users"), kind: callKindValidator },
  handler: async (ctx, { calleeId, kind }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");
    if (calleeId === me._id) throw new Error("Cannot call yourself");

    const callee = await ctx.db.get(calleeId);
    if (!callee) throw new Error("User not found");

    const now = Date.now();
    const endStale = async (
      id: Id<"callSessions">,
      status: "ended" | "missed",
    ) => {
      const session = await ctx.db.get(id);
      if (session && session.status === "ringing") {
        await ctx.db.patch(id, { status, endedAt: now });
      }
    };

    // The caller can only be in one ringing call at a time.
    const myRinging = await ctx.db
      .query("callSessions")
      .withIndex("by_caller", (q) => q.eq("callerId", me._id))
      .filter((q) => q.eq(q.field("status"), "ringing"))
      .collect();
    await Promise.all(myRinging.map((s) => endStale(s._id, "missed")));

    // If I'm already the callee of a ringing call, bail out (I'm busy).
    const myIncoming = await ctx.db
      .query("callSessions")
      .withIndex("by_callee", (q) => q.eq("calleeId", me._id))
      .filter((q) => q.eq(q.field("status"), "ringing"))
      .collect();
    if (myIncoming.length > 0) throw new Error("You already have an incoming call");

    // If the callee is already ringing for someone else, don't stack calls.
    const calleeBusy = await ctx.db
      .query("callSessions")
      .withIndex("by_callee", (q) => q.eq("calleeId", calleeId))
      .filter((q) => q.eq(q.field("status"), "ringing"))
      .collect();
    await Promise.all(calleeBusy.map((s) => endStale(s._id, "missed")));

    // Block calling someone who is mid-call (recent active session).
    const calleeActive = await ctx.db
      .query("callSessions")
      .withIndex("by_callee", (q) => q.eq("calleeId", calleeId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .order("desc")
      .first();
    if (calleeActive && now - calleeActive._creationTime < 120_000) {
      throw new Error(`${callee.name ?? "This person"} is already in a call`);
    }

    return await ctx.db.insert("callSessions", {
      callerId: me._id,
      calleeId,
      kind,
      status: "ringing",
    });
  },
});

/** The callee accepts a ringing call: ringing -> active. */
export const acceptCall = mutation({
  args: { sessionId: v.id("callSessions") },
  handler: async (ctx, { sessionId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Call not found");
    if (session.calleeId !== me._id) throw new Error("Not the callee of this call");
    if (session.status !== "ringing") throw new Error("Call is no longer ringing");

    await ctx.db.patch(sessionId, { status: "active", startedAt: Date.now() });
    return sessionId;
  },
});

/** The callee declines a ringing call: ringing -> declined. */
export const declineCall = mutation({
  args: { sessionId: v.id("callSessions") },
  handler: async (ctx, { sessionId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Call not found");
    if (session.calleeId !== me._id) throw new Error("Not the callee of this call");
    if (session.status !== "ringing") throw new Error("Call is no longer ringing");

    const now = Date.now();
    await ctx.db.patch(sessionId, { status: "declined", endedAt: now });
    await recordCallMessage(ctx, session, "declined", now);
  },
});

/** Either participant ends the call; caller can also mark it missed. */
export const endCall = mutation({
  args: {
    sessionId: v.id("callSessions"),
    outcome: v.optional(v.union(v.literal("ended"), v.literal("missed"))),
  },
  handler: async (ctx, { sessionId, outcome }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Call not found");
    if (session.callerId !== me._id && session.calleeId !== me._id) {
      throw new Error("Not part of this call");
    }
    if (session.status === "ended" || session.status === "declined" || session.status === "missed") {
      return;
    }

    const now = Date.now();
    const finalStatus = outcome ?? "ended";
    await ctx.db.patch(sessionId, {
      status: finalStatus,
      endedAt: now,
    });
    await recordCallMessage(ctx, session, finalStatus, now);
  },
});

/** Store a WebRTC signaling message (offer / answer / ICE candidate). */
export const sendSignal = mutation({
  args: { sessionId: v.id("callSessions"), payload: v.any() },
  handler: async (ctx, { sessionId, payload }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Call not found");
    if (session.callerId !== me._id && session.calleeId !== me._id) {
      throw new Error("Not part of this call");
    }

    return await ctx.db.insert("callSignals", {
      sessionId,
      authorId: me._id,
      payload,
    });
  },
});

/** All signaling messages for a call (the client filters out its own). */
export const listSignals = query({
  args: { sessionId: v.id("callSessions") },
  handler: async (ctx, { sessionId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const session = await ctx.db.get(sessionId);
    if (!session || (session.callerId !== me._id && session.calleeId !== me._id)) {
      return [];
    }

    return await ctx.db
      .query("callSignals")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
  },
});

/**
 * The most recent ringing/active call involving the current user, with the
 * two participants attached. Returns null when there is no live call.
 */
export const activeCallFor = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;

    const [asCaller, asCallee] = await Promise.all([
      ctx.db
        .query("callSessions")
        .withIndex("by_caller", (q) => q.eq("callerId", me._id))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "ringing"),
            q.eq(q.field("status"), "active"),
          ),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("callSessions")
        .withIndex("by_callee", (q) => q.eq("calleeId", me._id))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "ringing"),
            q.eq(q.field("status"), "active"),
          ),
        )
        .order("desc")
        .first(),
    ]);

    let session = asCaller ?? asCallee;
    if (asCaller && asCallee) {
      session =
        asCaller._creationTime > asCallee._creationTime ? asCaller : asCallee;
    }
    if (!session) return null;

    const now = Date.now();
    // Never surface a stale ringing session as a live call.
    if (
      session.status === "ringing" &&
      now - session._creationTime > RING_TIMEOUT_MS
    ) {
      return null;
    }
    if (now - session._creationTime > STALE_SESSION_MS) return null;

    const [caller, callee] = await Promise.all([
      ctx.db.get(session.callerId),
      ctx.db.get(session.calleeId),
    ]);
    if (!caller || !callee) return null;

    return {
      ...session,
      caller: toPublicUser(caller),
      callee: toPublicUser(callee),
    };
  },
});
