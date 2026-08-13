import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./users";

/** Store (or refresh) this device's FCM token for the current user. */
export const saveFcmToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");
    if (!token || token.length < 10) throw new Error("Invalid FCM token");

    const existing = await ctx.db
      .query("fcmSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .filter((q) => q.eq(q.field("token"), token))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { createdAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("fcmSubscriptions", {
      userId: me._id,
      token,
      createdAt: Date.now(),
    });
  },
});

/** Remove a device token (e.g. the user signed out on this device). */
export const removeFcmToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("fcmSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .filter((q) => q.eq(q.field("token"), token))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// Actions can't touch the DB directly, so the push-sending action reads
// tokens and cleans up dead ones through these small helpers.

export const tokensFor = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("fcmSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const deleteToken = mutation({
  args: { tokenId: v.id("fcmSubscriptions") },
  handler: async (ctx, { tokenId }) => {
    await ctx.db.delete(tokenId);
  },
});
