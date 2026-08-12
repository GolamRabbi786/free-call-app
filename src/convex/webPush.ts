import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

// How fresh a presence heartbeat must be to consider the user "in the app"
// right now — in-app alerts already cover them, so skip the push.
export const PRESENCE_FRESH_MS = 90_000;

/**
 * The VAPID public key is not secret — the browser needs it to create a push
 * subscription. It's read from the environment (Keys/API keys tab) so the
 * secret private key never reaches the client.
 */
export const vapidPublicKey = query({
  args: {},
  handler: async () => {
    return (process.env.VAPID_PUBLIC_KEY as string | undefined) ?? null;
  },
});

/** Store (or refresh) the current user's push subscription for one device. */
export const saveSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, { endpoint, p256dh, auth }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("webPushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .filter((q) => q.eq(q.field("endpoint"), endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        keys: { p256dh, auth },
        createdAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("webPushSubscriptions", {
      userId: me._id,
      endpoint,
      keys: { p256dh, auth },
      createdAt: Date.now(),
    });
  },
});

/** Remove a device subscription (e.g. permission revoked / push failed). */
export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const me = await getCurrentUser(ctx);
    if (!me) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("webPushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .filter((q) => q.eq(q.field("endpoint"), endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// Actions can't read/write the DB directly, so the push sender reads state
// and cleans up dead subscriptions through these small helpers.

export const presenceFresh = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return Boolean(
      presence && Date.now() - presence.updatedAt < PRESENCE_FRESH_MS,
    );
  },
});

export const subscriptionsFor = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("webPushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const deleteSubscription = mutation({
  args: { subscriptionId: v.id("webPushSubscriptions") },
  handler: async (ctx, { subscriptionId }) => {
    await ctx.db.delete(subscriptionId);
  },
});

export const getUserName = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return (await ctx.db.get(userId))?.name ?? null;
  },
});

export const getGroupName = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    return (await ctx.db.get(groupId))?.name ?? null;
  },
});
