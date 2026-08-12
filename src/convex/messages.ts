import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 200;

/** Get a short-lived URL the client can POST a file to (Convex storage). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

async function resolveAttachment(
  ctx: MutationCtx,
  args: { storageId: Id<"_storage">; name: string; type: string; size: number },
) {
  const url = await ctx.storage.getUrl(args.storageId);
  if (!url) throw new Error("Uploaded file not found");
  return {
    storageId: args.storageId,
    url,
    name: args.name.slice(0, MAX_NAME_LENGTH),
    type: args.type,
    size: args.size,
  };
}

/** The latest 50 messages in a 1:1 conversation, oldest first. */
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

/** Attach a shared file to a 1:1 conversation. */
export const sendAttachment = mutation({
  args: {
    conversationId: v.id("conversations"),
    storageId: v.id("_storage"),
    name: v.string(),
    type: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const convo = await ctx.db.get(args.conversationId);
    if (!convo || (convo.userA !== me._id && convo.userB !== me._id)) {
      throw new Error("Not part of this conversation");
    }

    const attachment = await resolveAttachment(ctx, args);
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: me._id,
      body: "",
      attachment,
    });
  },
});

/** The latest 50 messages in a group chat, oldest first. */
export const listGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const isMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .filter((q) => q.eq(q.field("userId"), me._id))
      .first();
    if (!isMember) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(50);
    return messages.reverse();
  },
});

export const sendGroup = mutation({
  args: { groupId: v.id("groups"), body: v.string() },
  handler: async (ctx, { groupId, body }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const trimmed = body.trim();
    if (!trimmed) throw new Error("Message cannot be empty");
    if (trimmed.length > MAX_MESSAGE_LENGTH) throw new Error("Message too long");

    const isMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .filter((q) => q.eq(q.field("userId"), me._id))
      .first();
    if (!isMember) throw new Error("Not a member of this group");

    return await ctx.db.insert("messages", {
      groupId,
      senderId: me._id,
      body: trimmed,
    });
  },
});

/** Attach a shared file to a group chat. */
export const sendGroupAttachment = mutation({
  args: {
    groupId: v.id("groups"),
    storageId: v.id("_storage"),
    name: v.string(),
    type: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const isMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .filter((q) => q.eq(q.field("userId"), me._id))
      .first();
    if (!isMember) throw new Error("Not a member of this group");

    const attachment = await resolveAttachment(ctx, args);
    return await ctx.db.insert("messages", {
      groupId: args.groupId,
      senderId: me._id,
      body: "",
      attachment,
    });
  },
});
