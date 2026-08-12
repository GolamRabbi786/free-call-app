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
 * "Call cancelled" (a ringing call the caller hung up), or
 * "Group video call · 12m 04s" when `group` is true.
 */
export function describeCallMessage(
  msg: {
    callKind?: string;
    callStatus?: string;
    callDurationMs?: number;
  },
  opts?: { group?: boolean },
): string {
  const kind = msg.callKind === "video" ? "Video call" : "Voice call";
  const label = opts?.group ? `Group ${kind.toLowerCase()}` : kind;
  switch (msg.callStatus) {
    case "missed":
      return `Missed ${msg.callKind === "video" ? "video" : "voice"} call`;
    case "declined":
      return `${label} declined`;
    case "ended": {
      const dur = formatCallDuration(msg.callDurationMs);
      return dur ? `${label} · ${dur}` : "Call cancelled";
    }
    default:
      return label;
  }
}
