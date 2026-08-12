import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const PRESENCE_TTL_MS = 25_000;

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/** Update the signed-in user's display name. */
export const updateProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) throw new Error("Name cannot be empty");
    await ctx.db.patch(user._id, { name: trimmed });
  },
});

/** Set the signed-in user's profile picture from an uploaded file. */
export const updateProfileImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Could not load the uploaded image");
    await ctx.db.patch(user._id, { image: url });
    return url;
  },
});

/**
 * Every user except the current one, with their online status derived from
 * the presence table. Online users first, then alphabetical.
 */
export const listPeople = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];

    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const [users, presenceDocs] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("presence").collect(),
    ]);
    const online = new Set(
      presenceDocs.filter((d) => d.updatedAt > cutoff).map((d) => d.userId),
    );
    const inCall = new Map(
      presenceDocs
        .filter((d) => d.updatedAt > cutoff && d.data?.inCall)
        .map((d) => [d.userId, true]),
    );

    return users
      .filter((u) => u._id !== me._id)
      .map((u) => ({
        ...u,
        isOnline: online.has(u._id),
        inCall: inCall.has(u._id),
      }))
      .sort(
        (a, b) =>
          Number(b.isOnline) - Number(a.isOnline) ||
          (a.name ?? "").localeCompare(b.name ?? ""),
      );
  },
});
