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
