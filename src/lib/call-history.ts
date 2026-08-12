/** "3m 24s" / "45s" / "" for a duration in milliseconds. */
export function formatCallDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Human-readable description of a call-history message, e.g.
 * "Video call · 3m 24s", "Missed video call", "Voice call declined",
 * or "Call cancelled" (a ringing call the caller hung up).
 */
export function describeCallMessage(msg: {
  callKind?: string;
  callStatus?: string;
  callDurationMs?: number;
}): string {
  const kind = msg.callKind === "video" ? "Video call" : "Voice call";
  switch (msg.callStatus) {
    case "missed":
      return `Missed ${msg.callKind === "video" ? "video" : "voice"} call`;
    case "declined":
      return `${kind} declined`;
    case "ended": {
      const dur = formatCallDuration(msg.callDurationMs);
      return dur ? `${kind} · ${dur}` : "Call cancelled";
    }
    default:
      return kind;
  }
}
