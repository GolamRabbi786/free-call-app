// Self-test for the Web Push crypto used in src/convex/webPushSender.ts.
// Verifies: (1) the VAPID JWT signature validates, (2) the aes128gcm payload
// decrypts with the subscriber's private key (what the browser does).
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  hkdfSync,
  randomBytes,
  verify,
} from "node:crypto";

const b64u = (b) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const b64ud = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// ---- replicate the sender's functions exactly ----
function toPadded32(b) {
  if (b.length > 32) b = b.subarray(b.length - 32);
  if (b.length === 32) return b;
  return Buffer.concat([Buffer.alloc(32 - b.length), b]);
}
function ecdsaDerToRaw(sig) {
  let o = 0;
  if (sig[o++] !== 0x30) throw new Error("bad DER");
  void sig[o++];
  if (sig[o++] !== 0x02) throw new Error("bad DER");
  const rl = sig[o++];
  const r = sig.subarray(o, o + rl);
  o += rl;
  if (sig[o++] !== 0x02) throw new Error("bad DER");
  const sl = sig[o++];
  const s = sig.subarray(o, o + sl);
  return Buffer.concat([toPadded32(r), toPadded32(s)]);
}
function signVapidJwt(privRaw, subject, audience) {
  const priv = b64ud(privRaw);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  const point = ecdh.getPublicKey();
  const jwk = {
    kty: "EC", crv: "P-256",
    x: point.subarray(1, 33).toString("base64url"),
    y: point.subarray(33, 65).toString("base64url"),
    d: priv.toString("base64url"),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const now = Math.floor(Date.now() / 1000);
  const toSign = `${b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${b64u(Buffer.from(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })))}`;
  const s = createSign("sha256");
  s.update(toSign); s.end();
  return { token: `${toSign}.${b64u(ecdsaDerToRaw(s.sign(key)))}`, point };
}
function encryptPayload(plaintext, sub) {
  const uaPublic = b64ud(sub.p256dh);
  const authSecret = b64ud(sub.auth);
  const salt = randomBytes(16);
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info"), Buffer.from([0]), uaPublic, asPublic]);
  const prk = Buffer.from(hkdfSync("sha256", shared, authSecret, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", prk, Buffer.alloc(0), Buffer.concat([Buffer.from("Content-Encoding: aes128gcm"), Buffer.from([0])]), 16));
  const nonce = Buffer.from(hkdfSync("sha256", prk, Buffer.alloc(0), Buffer.concat([Buffer.from("Content-Encoding: nonce"), Buffer.from([0])]), 12));
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  const tag = c.getAuthTag();
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ct, tag]);
}

// ---- browser-side simulation (receiver) ----
function decryptPayload(body, sub, uaPrivateKey) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const uaPublic = b64ud(sub.p256dh);
  const authSecret = b64ud(sub.auth);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivateKey);
  const shared = ecdh.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info"), Buffer.from([0]), uaPublic, asPublic]);
  const prk = Buffer.from(hkdfSync("sha256", shared, authSecret, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", prk, Buffer.alloc(0), Buffer.concat([Buffer.from("Content-Encoding: aes128gcm"), Buffer.from([0])]), 16));
  const nonce = Buffer.from(hkdfSync("sha256", prk, Buffer.alloc(0), Buffer.concat([Buffer.from("Content-Encoding: nonce"), Buffer.from([0])]), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
}

// ---- run the test ----
const vapidEcdh = createECDH("prime256v1");
vapidEcdh.generateKeys();
const vapidPriv = b64u(vapidEcdh.getPrivateKey());

const subEcdh = createECDH("prime256v1");
subEcdh.generateKeys();
const subPub = subEcdh.getPublicKey();
const auth = randomBytes(16);
const subscription = { p256dh: b64u(subPub), auth: b64u(auth) };

// Node's crypto.verify only accepts DER for EC, but JWT needs raw r||s.
// Re-encode the raw signature back to DER to prove the raw form is correct.
function rawToDer(b) {
  let v = b;
  while (v.length > 1 && v[0] === 0) v = v.subarray(1);
  const prefix = v[0] & 0x80 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0x02, v.length + prefix.length]), prefix, v]);
}

// 1. JWT: signature must verify against the derived public key
const { token } = signVapidJwt(vapidPriv, "mailto:test@example.com", "https://push.example.com");
const [h, p, sigRaw] = token.split(".");
const sig = b64ud(sigRaw);
const der = Buffer.concat([
  Buffer.from([0x30, rawToDer(sig.subarray(0, 32)).length + rawToDer(sig.subarray(32, 64)).length]),
  rawToDer(sig.subarray(0, 32)),
  rawToDer(sig.subarray(32, 64)),
]);
const v = createVerify("sha256");
v.update(`${h}.${p}`);
v.end();
const okSig = v.verify(
  createPublicKey({ key: { kty: "EC", crv: "P-256", x: vapidEcdh.getPublicKey().subarray(1,33).toString("base64url"), y: vapidEcdh.getPublicKey().subarray(33,65).toString("base64url") }, format: "jwk" }),
  der,
);
if (!okSig) throw new Error("JWT signature verification FAILED");
console.log("✓ VAPID JWT signature verifies (raw r||s matches DER)");

// 2. Payload: browser-side decrypt must recover the exact JSON
const message = JSON.stringify({ title: "Incoming call", body: "Rahim wants a video call", url: "/dashboard" });
const encrypted = encryptPayload(Buffer.from(message, "utf8"), subscription);
const decrypted = decryptPayload(encrypted, subscription, subEcdh.getPrivateKey());
if (decrypted !== message) throw new Error(`Payload round-trip FAILED: ${decrypted}`);
console.log("✓ aes128gcm payload round-trips (decrypts to exact JSON)");

console.log("\nALL WEB PUSH CRYPTO CHECKS PASSED");
