import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isBlockedEither } from "./blocks";
import { getCurrentUser } from "./users";

const MAX_GROUP_NAME = 60;

/** Create a group with the current user + the chosen members. */
export const create = mutation({
  args: { name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, { name, memberIds }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const trimmed = name.trim().slice(0, MAX_GROUP_NAME);
    if (!trimmed) throw new Error("Group name cannot be empty");

    // Never add people either side has blocked.
    const filtered: Id<"users">[] = [];
    for (const userId of memberIds) {
      if (!(await isBlockedEither(ctx, me._id, userId))) {
        filtered.push(userId);
      }
    }
    const unique = [...new Set([me._id, ...filtered])];
    if (unique.length < 2) {
      throw new Error("Pick at least one other person for the group");
    }

    const groupId = await ctx.db.insert("groups", {
      name: trimmed,
      createdBy: me._id,
    });
    for (const userId of unique) {
      await ctx.db.insert("groupMembers", { groupId, userId, addedBy: me._id });
    }
    return groupId;
  },
});

function toPublicUser(user: { _id: string; name?: string; image?: string }) {
  return { _id: user._id, name: user.name, image: user.image };
}

/** Fetch a group + its members (only for members of the group). */
export const get = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;

    const isMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .filter((q) => q.eq(q.field("userId"), me._id))
      .first();
    if (!isMember) return null;

    const group = await ctx.db.get(groupId);
    if (!group) return null;

    const memberDocs = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const users = await Promise.all(memberDocs.map((m) => ctx.db.get(m.userId)));
    return {
      group,
      members: users.filter((u) => u !== null).map(toPublicUser),
    };
  },
});

/** All groups the current user belongs to, most recently active first. */
export const listForMe = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();

    const results = [];
    for (const membership of memberships) {
      const group = await ctx.db.get(membership.groupId);
      if (!group) continue;

      const memberDocs = await ctx.db
        .query("groupMembers")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect();
      const memberUsers = (
        await Promise.all(memberDocs.map((m) => ctx.db.get(m.userId)))
      ).filter((u) => u !== null);

      const lastMessage = await ctx.db
        .query("messages")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();

      results.push({
        group,
        memberCount: memberUsers.length,
        members: memberUsers.slice(0, 3).map(toPublicUser),
        lastMessage,
      });
    }

    return results.sort(
      (a, b) =>
        (b.lastMessage?._creationTime ?? b.group._creationTime) -
        (a.lastMessage?._creationTime ?? a.group._creationTime),
    );
  },
});
