import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

/** Deterministic pair key so a 1:1 conversation always maps to one row. */
function pairKey(a: Id<"users">, b: Id<"users">) {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

/**
 * Returns the conversation between the current user and `otherUserId`,
 * creating it on first contact. Called from the client on selection.
 */
export const getOrCreate = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");
    if (otherUserId === me._id) throw new Error("Cannot chat with yourself");

    const other = await ctx.db.get(otherUserId);
    if (!other) throw new Error("User not found");

    const { userA, userB } = pairKey(me._id, otherUserId);
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_userA", (q) => q.eq("userA", userA))
      .filter((q) => q.eq(q.field("userB"), userB))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("conversations", { userA, userB });
  },
});

/** Fetch a conversation plus the other participant, for the current user. */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;

    const convo = await ctx.db.get(conversationId);
    if (!convo || (convo.userA !== me._id && convo.userB !== me._id)) {
      return null;
    }
    const otherId = convo.userA === me._id ? convo.userB : convo.userA;
    const otherUser = await ctx.db.get(otherId);
    return { conversation: convo, otherUser };
  },
});

/** All of the current user's conversations, most recently active first. */
export const listForMe = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const [asA, asB] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_userA", (q) => q.eq("userA", me._id))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_userB", (q) => q.eq("userB", me._id))
        .collect(),
    ]);

    const seen = new Set<string>();
    const results = [];
    for (const convo of [...asA, ...asB]) {
      if (seen.has(convo._id)) continue;
      seen.add(convo._id);
      const otherId = convo.userA === me._id ? convo.userB : convo.userA;
      const otherUser = await ctx.db.get(otherId);
      const lastMessage = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", convo._id),
        )
        .order("desc")
        .first();
      results.push({ conversation: convo, otherUser, lastMessage });
    }

    return results.sort(
      (a, b) =>
        (b.lastMessage?._creationTime ?? b.conversation._creationTime) -
        (a.lastMessage?._creationTime ?? a.conversation._creationTime),
    );
  },
});
