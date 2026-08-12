import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { useAuth } from "./use-auth";

const HEARTBEAT_MS = 10_000;

/**
 * Keeps a presence document alive for the signed-in user (heartbeat every
 * 10s, cleared on unmount / page unload) so other users can see who's online.
 */
export function usePresence() {
  const { user } = useAuth();
  const updatePresence = useMutation(api.presence.updatePresence);
  const heartbeat = useMutation(api.presence.heartbeat);
  const clearPresence = useMutation(api.presence.clearPresence);

  useEffect(() => {
    if (!user) return;

    void updatePresence({ data: {} });

    const interval = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);

    const onUnload = () => {
      void clearPresence();
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      void clearPresence();
    };
  }, [user?._id, updatePresence, heartbeat, clearPresence]);
}
