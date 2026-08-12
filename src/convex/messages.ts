import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

const MAX_MESSAGE_LENGTH = 2000;

/** The latest 50 messages in a conversation, oldest first. */
export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const convo = await ctx.db.get(conversationId);
    if (!convo || (convo.userA !== me._id && convo.userB !== me._id)) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .take(50);
    return messages.reverse();
  },
});

export const send = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, { conversationId, body }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const trimmed = body.trim();
    if (!trimmed) throw new Error("Message cannot be empty");
    if (trimmed.length > MAX_MESSAGE_LENGTH) throw new Error("Message too long");

    const convo = await ctx.db.get(conversationId);
    if (!convo || (convo.userA !== me._id && convo.userB !== me._id)) {
      throw new Error("Not part of this conversation");
    }

    return await ctx.db.insert("messages", {
      conversationId,
      senderId: me._id,
      body: trimmed,
    });
  },
});
