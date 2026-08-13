import { Phone } from "@convex-dev/auth/providers/Phone";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { internal } from "../_generated/api";

/**
 * Normalize a user-entered phone number into E.164-ish form:
 *   "01712345678"     -> "+8801712345678" (Bangladesh default when starting with 0)
 *   "8801712345678"   -> "+8801712345678"
 *   "+8801712345678"  -> "+8801712345678"
 *   "+88001903162833" -> "+8801903162833" (trunk-prefix zero after the country code)
 *   "+1 415 555 0100" -> "+14155550100"
 */
export function normalizePhone(identifier: string): string {
  let digits = identifier.replace(/[^\d+]/g, "");
  if (!digits) return identifier;

  if (!digits.startsWith("+")) {
    // Local formats: "01712345678" -> "+8801712345678",
    // "8801712345678" -> "+8801712345678", "008801712345678" -> "+8801712345678".
    if (digits.startsWith("00")) {
      digits = "+" + digits.slice(2);
    } else if (digits.startsWith("0")) {
      digits = "+880" + digits.slice(1);
    } else {
      digits = "+" + digits;
    }
  }

  // A trunk-prefix "0" directly after the country code is not part of E.164.
  // Fix the common "+880" + "019..." mistake without corrupting the country
  // code itself: "+88001903162833" -> "+8801903162833".
  if (digits.startsWith("+880")) {
    const rest = digits.slice(4).replace(/^0+/, "");
    if (rest.length > 0) {
      digits = "+880" + rest;
    }
  }

  return digits;
}

const DEV_CODE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes, matches maxAge

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 10, // 10 minutes
  normalizeIdentifier: normalizePhone,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: phone, token }, ctx) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    const normalized = normalizePhone(phone);

    // No Twilio keys yet — save the code in the devOtps table so sign-up still
    // works end-to-end and the Auth page can display it (no SMS is sent).
    if (!accountSid || !authToken || !from) {
      await ctx.runMutation(internal.auth.devOtp.upsert, {
        phone: normalized,
        code: token,
        expiresAt: Date.now() + DEV_CODE_MAX_AGE_MS,
      });
      return;
    }

    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
          To: normalized,
          From: from,
          Body: `Your Free Call verification code is ${token}. It expires in 10 minutes.`,
        }),
        {
          auth: { username: accountSid, password: authToken },
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
    } catch (error) {
      console.error("Twilio send failed:", error);
      throw new Error(
        "We couldn't send the SMS right now. Please check the phone number and try again.",
      );
    }
  },
});
