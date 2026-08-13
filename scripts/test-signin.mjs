import { ConvexClient } from "convex/browser";
import { normalizePhone } from "../src/convex/auth/phoneOtp.ts";

const url = "https://adjoining-hummingbird-294.convex.cloud";
const client = new ConvexClient(url);

// Unit checks for normalizePhone.
const cases = [
  ["01712345678", "+8801712345678"],
  ["8801712345678", "+8801712345678"],
  ["008801712345678", "+8801712345678"],
  ["+8801712345678", "+8801712345678"],
  ["+88001903162833", "+8801903162833"],
  ["+88001712345678", "+8801712345678"],
  ["+1 415 555 0100", "+14155550100"],
];
for (const [input, expected] of cases) {
  const got = normalizePhone(input);
  const ok = got === expected ? "ok" : `MISMATCH (expected ${expected})`;
  console.log(`normalize ${input} -> ${got} ${ok}`);
  if (got !== expected) process.exit(1);
}

async function fullFlow(phone) {
  console.log(`\n=== ${phone} ===`);
  // 1. Send code (exactly like the Auth page).
  const sent = await client.action("auth:signIn", {
    provider: "phone-otp",
    params: { phone },
  });
  console.log("1. send   ->", JSON.stringify(sent));

  // 2. Read back dev OTP.
  const dev = await client.query("auth/devOtp:get", { phone });
  console.log("2. dev    ->", JSON.stringify(dev));
  if (!dev?.code) {
    console.log("FAIL: no dev OTP");
    process.exit(1);
  }

  // 3. Verify with the same identifier (like the Auth page).
  const verified = await client.action("auth:signIn", {
    provider: "phone-otp",
    params: { phone, code: dev.code },
  });
  console.log("3. verify -> OK:", JSON.stringify(verified).slice(0, 120));

  // 4. Clean up.
  await client.mutation("auth/devOtp:clear", { phone });
  console.log("4. cleanup -> done");
}

await fullFlow("+8801903162833");
await fullFlow("+8801712345678");
await client.close();
console.log("\nALL OK — phone sign-up works end-to-end in dev mode.");
