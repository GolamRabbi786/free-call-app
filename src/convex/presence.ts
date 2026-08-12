import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

const PRESENCE_TTL_MS = 25_000;

export const updatePresence = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return;

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt });
    } else {
      await ctx.db.insert("presence", { userId: user._id, data, updatedAt });
    }
  },
});

/** Keep the presence document alive without changing its data. */
export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return;

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: Date.now() });
    }
  },
});

export const clearPresence = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return;

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/** Returns everyone currently online (presence heartbeat younger than the TTL). */
export const onlineUsers = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const docs = await ctx.db.query("presence").collect();
    return docs
      .filter((d) => d.updatedAt > cutoff)
      .map((d) => ({ userId: d.userId, data: d.data }));
  },
});
