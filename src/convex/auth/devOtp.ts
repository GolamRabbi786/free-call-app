import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Dev-mode phone OTP storage.
 *
 * When SMS (Twilio) isn't configured, `sendVerificationRequest` in
 * `phoneOtp.ts` saves the code here instead of throwing, so phone sign-up
 * still works end-to-end. The Auth page reads it back and shows it, since no
 * real SMS was sent. Once Twilio keys are added, this table just stays empty.
 */

// Replaces any previous code for the same phone with the new one.
export const upsert = internalMutation({
  args: {
    phone: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("devOtps")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("devOtps", {
      phone: args.phone,
      code: args.code,
      expiresAt: args.expiresAt,
    });
  },
});

// Returns the dev-mode code for a phone if one exists and hasn't expired.
export const get = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("devOtps")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
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
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("devOtps")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
  },
});

