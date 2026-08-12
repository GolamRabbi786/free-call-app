/**
 * WebRTC helpers for 1:1 audio/video calls.
 *
 * The media path is plain peer-to-peer WebRTC (free, in-browser). Signaling
 * (offers, answers, ICE candidates) is relayed through Convex, so no
 * third-party video service or API key is needed.
 *
 * Note on connectivity: calls work out of the box between peers that can
 * reach each other via host/server-reflexive candidates (same network, or
 * STUN-able NATs). For guaranteed connectivity across restrictive NATs a
 * TURN relay would be needed; that's an optional add-on.
 */

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 4,
};

export type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(RTC_CONFIG);
}

/**
 * Attach a MediaStream to a media element and keep playback going.
 *
 * Browsers (especially iOS Safari) can block audio/video autoplay until a
 * user gesture. We start playback immediately and also resume it on the next
 * pointer interaction, so the remote side's voice is always audible.
 */
export function attachMedia(el: HTMLMediaElement, stream: MediaStream | null) {
  if (!stream) {
    el.pause();
    el.srcObject = null;
    return;
  }
  if (el.srcObject !== stream) el.srcObject = stream;
  const play = () => {
    el.play().catch(() => {
      /* autoplay blocked until a gesture — the pointer handler retries */
    });
  };
  play();
  const resumeKey = "__freecall_resume";
  const self = el as HTMLMediaElement & { [resumeKey]?: boolean };
  if (!self[resumeKey]) {
    self[resumeKey] = true;
    el.addEventListener("pointerdown", play);
  }
}

/** Request the local camera/mic, degrading gracefully from video to audio-only. */
export async function acquireMedia(
  kind: "video" | "audio",
): Promise<MediaStream | null> {
  try {
    if (kind === "video") {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: true,
        });
      } catch {
        // Camera failed (permission/device) — fall back to audio only.
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    }
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    console.warn("Media unavailable:", error);
    return null;
  }
}
