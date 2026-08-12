/**
 * Tracks which chat (DM or group) is currently open on screen, so the global
 * notification watcher can skip alerting for the chat the user is already
 * looking at. Keys match the notification query's `key` values.
 */
let activeChatKey: string | null = null;

export function setActiveChat(key: string | null) {
  activeChatKey = key;
}

export function getActiveChat(): string | null {
  return activeChatKey;
}
