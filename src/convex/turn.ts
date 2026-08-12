"use node";

// Fetches short-lived WebRTC ICE servers (TURN relay via Cloudflare Realtime)
// so calls work even when both peers are behind restrictive/symmetric NATs.
// The long-term TURN key material stays server-side (env vars); only the
// short-lived username/credential from Cloudflare ever reaches the browser.
//
// Returns null when TURN isn't configured yet — calls then simply fall back
// to plain STUN (same behavior as before).
import { action } from "./_generated/server";

type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

let cache: { iceServers: IceServer[]; at: number } | null = null;
const CACHE_MS = 10 * 60_000;

export const getIceServers = action({
  args: {},
  handler: async (): Promise<IceServer[] | null> => {
    const keyId = process.env.TURN_KEY_ID;
    const apiToken = process.env.TURN_KEY_API_TOKEN;
    if (!keyId || !apiToken) return null;

    if (cache && Date.now() - cache.at < CACHE_MS) return cache.iceServers;

    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 86400 }),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { iceServers?: IceServer[] };
      const raw = data.iceServers ?? [];

      // Cloudflare returns alternate port-53 URLs that browsers block — drop
      // them so trickle ICE never waits on a doomed candidate.
      const iceServers = raw.map((s) => ({
        ...s,
        urls: s.urls.filter((u) => !u.includes(":53")),
      }));

      cache = { iceServers, at: Date.now() };
      return iceServers;
    } catch {
      return null;
    }
  },
});
