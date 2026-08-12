import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ADMIN_PASSWORD, ADMIN_USERNAME } from "./adminConfig";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PRESENCE_ONLINE_MS = 25_000;

function randomToken(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Verifies the admin token and throws if it is missing or expired. */
async function requireAdmin(ctx: QueryCtx, token: string) {
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!session) throw new Error("Not authorized");
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    throw new Error("Session expired");
  }
  return session;
}

/** Admin login with the configured username/password. Returns a session token. */
export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      throw new Error("Invalid admin credentials");
    }
    const token = randomToken();
    await ctx.db.insert("adminSessions", { token, createdAt: Date.now() });
    return token;
  },
});

/** Ends an admin session. */
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (session) await ctx.db.delete(session._id);
  },
});

type ActivityItem = {
  id: string;
  type: "message" | "call";
  text: string;
  at: number;
};

/**
 * Everything the admin panel shows: user list, daily counts and a recent
 * activity feed. Returns null when the token is invalid/expired so the
 * client can send the admin back to the login form.
 */
export const stats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await requireAdmin(ctx, token).catch(() => null);
    if (!session) return null;

    const [users, messages, callSessions, groupCallSessions, presenceDocs] =
      await Promise.all([
        ctx.db.query("users").collect(),
        ctx.db.query("messages").order("desc").take(200),
        ctx.db.query("callSessions").order("desc").take(100),
        ctx.db.query("groupCallSessions").order("desc").take(100),
        ctx.db.query("presence").collect(),
      ]);

    const now = Date.now();
    const dayStart = now - 24 * 60 * 60 * 1000;
    const presenceMap = new Map(presenceDocs.map((p) => [p.userId, p.updatedAt]));
    const nameOf = (id: Id<"users"> | string) =>
      users.find((u) => u._id === id)?.name ?? "Someone";

    const userRows = users.map((u) => {
      const lastSeen = presenceMap.get(u._id);
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        image: u.image,
        isAnonymous: Boolean(u.isAnonymous),
        createdAt: u._creationTime,
        isOnline: lastSeen !== undefined && now - lastSeen < PRESENCE_ONLINE_MS,
        lastSeen: lastSeen ?? u._creationTime,
      };
    });
    userRows.sort((a, b) => b.createdAt - a.createdAt);

    const activity: ActivityItem[] = [];
    for (const m of messages) {
      activity.push({
        id: `m-${m._id}`,
        type: "message",
        text: `${nameOf(m.senderId)} sent ${
          m.attachment
            ? `a ${m.attachment.type.startsWith("video/") ? "video" : m.attachment.type.startsWith("image/") ? "photo" : "file"}`
            : "a message"
        } in ${m.groupId ? "a group chat" : "a chat"}`,
        at: m._creationTime,
      });
    }
    for (const c of callSessions) {
      activity.push({
        id: `c-${c._id}`,
        type: "call",
        text: `${nameOf(c.callerId)} made a ${c.kind} call to ${nameOf(
          c.calleeId,
        )} — ${c.status}`,
        at: c._creationTime,
      });
    }
    for (const g of groupCallSessions) {
      activity.push({
        id: `gc-${g._id}`,
        type: "call",
        text: `${nameOf(g.initiatorId)} started a group ${g.kind} call with ${
          g.participantIds.length
        } people`,
        at: g._creationTime,
      });
    }
    activity.sort((a, b) => b.at - a.at);

    return {
      totalUsers: users.length,
      newToday: users.filter((u) => u._creationTime > dayStart).length,
      messagesToday: messages.filter((m) => m._creationTime > dayStart).length,
      callsToday: [
        ...callSessions.filter((c) => c._creationTime > dayStart),
        ...groupCallSessions.filter((g) => g._creationTime > dayStart),
      ].length,
      users: userRows.slice(0, 100),
      activity: activity.slice(0, 25),
    };
  },
});

/** Permanently remove a user and all of their data. */
export const removeUser = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, { token, userId }) => {
    await requireAdmin(ctx, token);

    const target = await ctx.db.get(userId);
    if (!target) return;

    // Presence
    const presences = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const p of presences) await ctx.db.delete(p._id);

    // Group memberships
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);

    // 1:1 conversations (+ their messages)
    const [convosA, convosB] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_userA", (q) => q.eq("userA", userId))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_userB", (q) => q.eq("userB", userId))
        .collect(),
    ]);
    for (const convo of new Set([...convosA, ...convosB].map((c) => c._id))) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", convo))
        .collect();
      for (const m of msgs) await ctx.db.delete(m._id);
      await ctx.db.delete(convo);
    }

    // Messages sent by the user (group chats etc.)
    const userMessages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("senderId"), userId))
      .collect();
    for (const m of userMessages) await ctx.db.delete(m._id);

    // 1:1 calls + their signals
    const calls = await ctx.db
      .query("callSessions")
      .filter((q) =>
        q.or(
          q.eq(q.field("callerId"), userId),
          q.eq(q.field("calleeId"), userId),
        ),
      )
      .collect();
    for (const c of calls) await ctx.db.delete(c._id);
    const signals = await ctx.db
      .query("callSignals")
      .filter((q) => q.eq(q.field("authorId"), userId))
      .collect();
    for (const s of signals) await ctx.db.delete(s._id);

    // Group calls + their signals
    const groupCalls = await ctx.db
      .query("groupCallSessions")
      .filter((q) => q.eq(q.field("initiatorId"), userId))
      .collect();
    for (const g of groupCalls) await ctx.db.delete(g._id);
    const groupSignals = await ctx.db
      .query("groupCallSignals")
      .filter((q) =>
        q.or(
          q.eq(q.field("from"), userId),
          q.eq(q.field("to"), userId),
        ),
      )
      .collect();
    for (const s of groupSignals) await ctx.db.delete(s._id);

    await ctx.db.delete(userId);
  },
});
