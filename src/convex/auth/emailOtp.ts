import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { internal } from "../_generated/api";

const DEV_CODE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes, matches maxAge

type ActionCtxLike = {
  runMutation: (mutation: unknown, args: unknown) => Promise<unknown>;
};

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 10, // 10 minutes
  normalizeIdentifier: (identifier: string) => identifier.toLowerCase().trim(),
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  // The Auth.js types omit `ctx`, but the Convex Auth sign-in implementation
  // passes it as the second argument at runtime (see signIn.js), so we accept
  // it optionally to store dev-mode codes.
  async sendVerificationRequest(params, ctx?: unknown) {
    const { identifier, token } = params;
    const normalized = identifier.toLowerCase().trim();
    const apiKey = process.env.RESEND_API_KEY;

    // No email service configured yet — save the code in the devCodes table so
    // email sign-up still works end-to-end and the Auth page can display it
    // (no real email is sent).
    if (!apiKey) {
      const actionCtx = ctx as ActionCtxLike;
      await actionCtx.runMutation(internal.auth.devCodes.upsert, {
        identifier: normalized,
        code: token,
        expiresAt: Date.now() + DEV_CODE_MAX_AGE_MS,
      });
      return;
    }

    // Real email delivery via Resend (set RESEND_API_KEY + RESEND_FROM in the
    // Keys/API keys tab).
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.RESEND_FROM ?? "Free Call <onboarding@resend.dev>",
          to: [normalized],
          subject: "Your Free Call verification code",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px">
              <h2 style="margin:0 0 8px;color:#0f172a">Free Call</h2>
              <p style="color:#475569;font-size:14px;line-height:1.6">
                Your verification code is:
              </p>
              <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#4f46e5;margin:12px 0">
                ${token}
              </div>
              <p style="color:#94a3b8;font-size:12px">
                This code expires in 10 minutes. No password needed.
              </p>
            </div>
          `,
        }),
      });
    } catch (error) {
      console.error("Resend send failed:", error);
      throw new Error(
        "We couldn't email the code right now. Please check the address and try again.",
      );
    }
  },
});
