import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { Scrypt } from "lucia";
import type { Value } from "convex/values";
import { normalizePhone } from "./normalize";

/**
 * Phone / email + password credentials provider — no OTP verification.
 *
 * Client calls `signIn("phone-password", ...)` with a `flow`:
 *
 *   signUp: { flow: "signUp", name?, phone?|email?, password }
 *   signIn: { flow: "signIn", phone?|email?, password }
 *
 * Phone numbers are normalized to E.164 (`+8801XXXXXXXXX`) and stored as the
 * provider account id, so the same number always maps to the same account.
 * Emails are lowercased and used directly. A signUp for an identifier that
 * already has an account simply signs in when the password matches; with a
 * different password the backend throws "Account ... already exists" and the
 * UI offers login instead.
 */
export const PROVIDER_ID = "phone-password";

const passwordMinLength = 6;

export const phonePassword = ConvexCredentials({
  id: PROVIDER_ID,
  crypto: {
    hashSecret: (secret) => new Scrypt().hash(secret),
    verifySecret: (secret, hash) => new Scrypt().verify(hash, secret),
  },
  authorize: async (params, ctx) => {
    const flow = params.flow;
    const password =
      typeof params.password === "string" ? params.password : undefined;
    const rawIdentifier =
      (typeof params.phone === "string" ? params.phone : undefined) ??
      (typeof params.email === "string" ? params.email : undefined) ??
      (typeof params.identifier === "string" ? params.identifier : undefined);

    if (flow !== "signUp" && flow !== "signIn") {
      throw new Error("Choose to sign in or create an account.");
    }
    if (!rawIdentifier || rawIdentifier.trim() === "") {
      throw new Error("Enter your phone number or email.");
    }
    if (!password) {
      throw new Error("Enter your password.");
    }

    const identifier = rawIdentifier.trim();
    let email: string | undefined;
    let phone: string | undefined;
    if (identifier.includes("@")) {
      email = identifier.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
      }
    } else {
      phone = normalizePhone(identifier);
      // Reject anything that doesn't normalize to a real-looking E.164 number
      // (at least 7 digits) so garbage input can't create accounts.
      if (!phone.startsWith("+") || phone.replace(/\D/g, "").length < 7) {
        throw new Error("Enter a valid phone number (e.g. +8801XXXXXXXXX).");
      }
    }
    const accountId = email ?? phone!;

    if (flow === "signUp") {
      if (password.length < passwordMinLength) {
        throw new Error(
          `Password must be at least ${passwordMinLength} characters.`,
        );
      }
      const name =
        (typeof params.name === "string" ? params.name : "").trim() ||
        (email ? email.split("@")[0] : "") ||
        phone ||
        "User";
      const profile: Record<string, Value> = { name };
      if (email) {
        profile.email = email;
        profile.emailVerificationTime = Date.now();
      }
      if (phone) {
        profile.phone = phone;
        profile.phoneVerificationTime = Date.now();
      }
      const created = await createAccount(ctx, {
        provider: PROVIDER_ID,
        account: { id: accountId, secret: password },
        profile,
        // No OTP verification in this app, so the first sign-up marks the
        // identifier as "verified" and later sign-ups with the same number /
        // email link back to the same account instead of duplicating it.
        shouldLinkViaEmail: true,
        shouldLinkViaPhone: true,
      });
      return { userId: created.user._id };
    }

    // flow === "signIn"
    const retrieved = await retrieveAccount(ctx, {
      provider: PROVIDER_ID,
      account: { id: accountId, secret: password },
    });
    return { userId: retrieved.user._id };
  },
});
