import { Phone } from "@convex-dev/auth/providers/Phone";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Normalize a user-entered phone number into E.164-ish form:
 *   "01712345678"  -> "+8801712345678" (Bangladesh default when starting with 0)
 *   "8801712345678"-> "+8801712345678"
 *   "+1 415 555 0100" -> "+14155550100"
 */
export function normalizePhone(identifier: string): string {
  let digits = identifier.replace(/[^\d+]/g, "");
  if (!digits) return identifier;
  if (!digits.startsWith("+")) {
    if (digits.startsWith("00")) digits = "+" + digits.slice(2);
    else if (digits.startsWith("0")) digits = "+88" + digits.slice(1); // +880 Bangladesh
    else digits = "+" + digits;
  }
  return digits;
}

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
  async sendVerificationRequest({ identifier: phone, token }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      throw new Error(
        "SMS is not configured yet — the admin needs to add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER to the project keys.",
      );
    }

    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
          To: normalizePhone(phone),
          From: from,
          Body: `Your Free Call verification code is ${token}. It expires in 10 minutes.`,
        }),
        {
          auth: { username: accountSid, password: authToken },
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
    } catch (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
