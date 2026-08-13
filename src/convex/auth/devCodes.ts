import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Dev-mode email OTP storage.
 *
 * When no email service (Resend) is configured, `sendVerificationRequest` in
 * `emailOtp.ts` saves the code here instead of failing, so email sign-up still
 * works end-to-end. The Auth page reads it back and shows it, since no real
 * email was sent. Once a mail service is configured, this table stays empty.
 */

// Replaces any previous code for the same identifier with the new one.
export const upsert = internalMutation({
  args: {
    identifier: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("devCodes")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("devCodes", {
      identifier: args.identifier,
      code: args.code,
      expiresAt: args.expiresAt,
    });
  },
});

// Returns the dev-mode code for an identifier if one exists and hasn't expired.
export const get = query({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("devCodes")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .first();
    if (!row || row.expiresAt < Date.now()) {
      return null;
    }
    return { code: row.code, expiresAt: row.expiresAt };
  },
});

// Convenience public mutation so the client can clear the code after a
// successful verification without needing the internal namespace.
export const clear = mutation({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("devCodes")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
  },
});
