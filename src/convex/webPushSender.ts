"use node";

// Sends Web Push notifications (VAPID + RFC 8291 aes128gcm) from the Convex
// node runtime using only Node built-ins. Triggered via ctx.scheduler.runAfter
// from the message/call mutations. Gracefully no-ops when VAPID keys aren't
// configured yet, and removes dead push subscriptions as they are found.
import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { callKindValidator } from "./schema";
import { PRESENCE_FRESH_MS } from "./webPush";
import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
} from "node:crypto";

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function ensureVapidKeys(): {
  subject: string;
  publicKey: string;
  privateKey: string;
} | null {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

/* ---------- VAPID JWT (ES256) ---------- */

function toPadded32(intBytes: Buffer): Buffer {
  let b = intBytes;
  if (b.length > 32) b = b.subarray(b.length - 32);
  if (b.length === 32) return b;
  return Buffer.concat([Buffer.alloc(32 - b.length), b]);
}

/** Node signs ECDSA as DER (ASN.1); JWT wants raw r||s. */
function ecdsaDerToRaw(sig: Buffer): Buffer {
  let offset = 0;
  if (sig[offset++] !== 0x30) throw new Error("Invalid DER signature");
  void sig[offset++]; // sequence length
  if (sig[offset++] !== 0x02) throw new Error("Invalid DER signature");
  const rLen = sig[offset++];
  const r = sig.subarray(offset, offset + rLen);
  offset += rLen;
  if (sig[offset++] !== 0x02) throw new Error("Invalid DER signature");
  const sLen = sig[offset++];
  const s = sig.subarray(offset, offset + sLen);
  return Buffer.concat([toPadded32(r), toPadded32(s)]);
}

function signVapidJwt(
  privateKeyRaw: string,
  subject: string,
  audience: string,
): { token: string; publicKeyB64: string } {
  const priv = base64UrlDecode(privateKeyRaw);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  const point = ecdh.getPublicKey(); // 65-byte uncompressed P-256 point

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: point.subarray(1, 33).toString("base64url"),
    y: point.subarray(33, 65).toString("base64url"),
    d: priv.toString("base64url"),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });

  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 12 * 3600, sub: subject };
  const toSign = `${base64UrlEncode(Buffer.from(JSON.stringify(header)))}.${base64UrlEncode(Buffer.from(JSON.stringify(claims)))}`;
  const sign = createSign("sha256");
  sign.update(toSign);
  sign.end();
  const token = `${toSign}.${base64UrlEncode(ecdsaDerToRaw(sign.sign(key)))}`;
  return { token, publicKeyB64: base64UrlEncode(point) };
}

/* ---------- Payload encryption (RFC 8291, aes128gcm) ---------- */

function encryptPayload(
  plaintext: Buffer,
  sub: { p256dh: string; auth: string },
): Buffer {
  const uaPublic = base64UrlDecode(sub.p256dh); // subscriber's public key
  const authSecret = base64UrlDecode(sub.auth); // subscriber's auth secret
  const salt = randomBytes(16);

  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const info = Buffer.concat([
    Buffer.from("WebPush: info"),
    Buffer.from([0]),
    uaPublic,
    asPublic,
  ]);
  const prk = Buffer.from(
    hkdfSync("sha256", shared, authSecret, info, 32),
  );
  const cek = Buffer.from(
    hkdfSync(
      "sha256",
      prk,
      Buffer.alloc(0),
      Buffer.concat([
        Buffer.from("Content-Encoding: aes128gcm"),
        Buffer.from([0]),
      ]),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync(
      "sha256",
      prk,
      Buffer.alloc(0),
      Buffer.concat([Buffer.from("Content-Encoding: nonce"), Buffer.from([0])]),
      12,
    ),
  );

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || key(idlen)
  const rs = 4096;
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ciphertext, tag]);
}

async function sendPushRequest(
  endpoint: string,
  body: Buffer,
  vapid: { subject: string; publicKey: string; privateKey: string },
): Promise<number> {
  const audience = new URL(endpoint).origin;
  const { token, publicKeyB64 } = signVapidJwt(
    vapid.privateKey,
    vapid.subject,
    audience,
  );
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${publicKeyB64}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      "Content-Length": String(body.length),
    },
    body: new Uint8Array(body),
  });
  return res.status;
}

/* ---------- Delivery ---------- */

async function isRecentlyOnline(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<boolean> {
  return Boolean(await ctx.runQuery(api.webPush.presenceFresh, { userId }));
}

async function sendPush(
  ctx: ActionCtx,
  userId: Id<"users">,
  notification: { title: string; body: string; url: string },
): Promise<void> {
  // User is in the app right now — the in-app watcher already alerts them.
  if (await isRecentlyOnline(ctx, userId)) return;

  const vapid = ensureVapidKeys();
  if (!vapid) return;

  const subs = await ctx.runQuery(api.webPush.subscriptionsFor, { userId });
  if (subs.length === 0) return;

  const payload = Buffer.from(
    JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.url,
      icon: "/logo.svg",
    }),
    "utf8",
  );

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const body = encryptPayload(payload, sub.keys);
        const status = await sendPushRequest(sub.endpoint, body, vapid);
        // 404/410 = dead subscription; stop trying to reach it.
        if (status === 404 || status === 410) {
          await ctx.runMutation(api.webPush.deleteSubscription, {
            subscriptionId: sub._id,
          });
        }
      } catch {
        // Network hiccup or encryption issue — try again next time.
      }
    }),
  );
}

function displayName(name?: string | null): string {
  return name && name.trim() ? name : "Someone";
}

/** New message in a 1:1 chat or a group chat. */
export const notifyMessage = action({
  args: {
    toUserId: v.id("users"),
    senderId: v.id("users"),
    body: v.string(),
    conversationId: v.optional(v.id("conversations")),
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const name = displayName(
      await ctx.runQuery(api.webPush.getUserName, { userId: args.senderId }),
    );
    const body = args.body.trim()
      ? args.body.trim().slice(0, 140)
      : "sent an attachment";
    await sendPush(ctx, args.toUserId, {
      title: name,
      body,
      url: "/dashboard",
    });
  },
});

/** A 1:1 call just started ringing. */
export const notifyIncomingCall = action({
  args: {
    calleeId: v.id("users"),
    callerId: v.id("users"),
    kind: callKindValidator,
  },
  handler: async (ctx, args) => {
    const name = displayName(
      await ctx.runQuery(api.webPush.getUserName, { userId: args.callerId }),
    );
    await sendPush(ctx, args.calleeId, {
      title: "Incoming call",
      body: `${name} wants a ${args.kind === "video" ? "video" : "voice"} call`,
      url: "/dashboard",
    });
  },
});

/** A group call just started — alert every member except the initiator. */
export const notifyGroupCall = action({
  args: {
    groupId: v.id("groups"),
    initiatorId: v.id("users"),
    kind: callKindValidator,
    memberIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const [name, groupName] = await Promise.all([
      ctx.runQuery(api.webPush.getUserName, { userId: args.initiatorId }),
      ctx.runQuery(api.webPush.getGroupName, { groupId: args.groupId }),
    ]);
    const groupLabel = groupName?.trim() ? groupName : "a group";
    await Promise.all(
      args.memberIds.map((memberId) =>
        sendPush(ctx, memberId, {
          title: `${displayName(name)} started a group call`,
          body: `${args.kind === "video" ? "Video" : "Voice"} call in ${groupLabel}`,
          url: "/dashboard",
        }),
      ),
    );
  },
});
