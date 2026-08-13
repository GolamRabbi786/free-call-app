import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

/** True when `blocker` has blocked `blocked`. */
export async function isBlocked(
  ctx: QueryCtx | MutationCtx,
  blocker: Id<"users">,
  blocked: Id<"users">,
): Promise<boolean> {
  const row = await ctx.db
    .query("blocks")
    .withIndex("by_blocker", (q) => q.eq("blockerId", blocker))
    .filter((q) => q.eq(q.field("blockedId"), blocked))
    .first();
  return row !== null;
}

/** True when either side has blocked the other. */
export async function isBlockedEither(
  ctx: QueryCtx | MutationCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  return (await isBlocked(ctx, a, b)) || (await isBlocked(ctx, b, a));
}

/**
 * Block `userId`. From then on neither side can message or call the other,
 * and the person disappears from People / new group member pickers.
 */
export const blockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");
    if (userId === me._id) throw new Error("You cannot block yourself");

    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", me._id))
      .filter((q) => q.eq(q.field("blockedId"), userId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("blocks", {
      blockerId: me._id,
      blockedId: userId,
      createdAt: Date.now(),
    });
  },
});

/** Unblock `userId`. */
export const unblockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", me._id))
      .filter((q) => q.eq(q.field("blockedId"), userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Users I have blocked, with the info needed to render + unblock them. */
export const myBlocked = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const rows = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", me._id))
      .collect();
    const users = await Promise.all(rows.map((r) => ctx.db.get(r.blockedId)));
    return users
      .filter((u) => u !== null)
      .map((u) => ({ _id: u._id, name: u.name, image: u.image }));
  },
});
