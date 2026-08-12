import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  acquireMedia,
  createPeerConnection,
  type SignalPayload,
} from "@/lib/webrtc";
import { useAuth } from "./use-auth";

type Member = { _id: string; name?: string; image?: string };

type ActiveGroupCall = {
  _id: Id<"groupCallSessions">;
  _creationTime: number;
  groupId: Id<"groups">;
  initiatorId: Id<"users">;
  kind: "video" | "audio";
  status: "active" | "ended";
  participantIds: Id<"users">[];
  startedAt?: number;
  group: { _id: Id<"groups">; name: string; image?: string };
  members: Member[];
};

type GroupSignalDoc = {
  _id: Id<"groupCallSignals">;
  _creationTime: number;
  sessionId: Id<"groupCallSessions">;
  from: Id<"users">;
  to: Id<"users">;
  payload: SignalPayload;
};

/**
 * Owns the current user's live group call: subscribes to the active group
 * call session, then connects peer-to-peer (full mesh) to every other
 * participant. For each pair, the participant with the lower user id is the
 * offerer — a deterministic rule that avoids duplicate offers.
 */
export function useGroupCall() {
  const { user } = useAuth();
  const myId = user?._id;

  const session = useQuery(api.groupCalls.activeGroupCallFor);
  const signals = useQuery(
    api.groupCalls.listSignals,
    session ? { sessionId: session._id } : "skip",
  );

  const startGroupCallMutation = useMutation(api.groupCalls.startGroupCall);
  const endGroupCallMutation = useMutation(api.groupCalls.endGroupCall);
  const sendSignalMutation = useMutation(api.groupCalls.sendSignal);
  const updatePresence = useMutation(api.presence.updatePresence);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<ActiveGroupCall | null>(null);
  const appliedSignalsRef = useRef<Set<string>>(new Set());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());

  const sendSignal = useCallback(
    (sessionId: Id<"groupCallSessions">, to: Id<"users">, payload: SignalPayload) =>
      sendSignalMutation({ sessionId, to, payload }),
    [sendSignalMutation],
  );

  const enqueue = useCallback((fn: () => Promise<void>) => {
    signalQueueRef.current = signalQueueRef.current
      .then(fn)
      .catch((error) => console.warn("Group signal processing error:", error));
  }, []);

  const flushPending = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const pending = pendingCandidatesRef.current.get(peerId) ?? [];
      pendingCandidatesRef.current.delete(peerId);
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          console.warn("addIceCandidate failed:", error);
        }
      }
    },
    [],
  );

  const getOrCreatePC = useCallback(
    (peerId: string, s: ActiveGroupCall): RTCPeerConnection | null => {
      const existing = pcMapRef.current.get(peerId);
      if (existing) return existing;
      if (!myId) return null;

      const pc = createPeerConnection();
      const local = localStreamRef.current;
      if (local) {
        local.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, local);
          } catch {
            /* track already added */
          }
        });
      }
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        void sendSignal(s._id, peerId as Id<"users">, {
          type: "ice",
          candidate: e.candidate.toJSON(),
        });
      };
      pc.ontrack = (e) => {
        if (!e.streams[0]) return;
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0]! }));
      };
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          pcMapRef.current.delete(peerId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      };
      pcMapRef.current.set(peerId, pc);
      return pc;
    },
    [myId, sendSignal],
  );

  const processSignal = useCallback(
    async (sig: GroupSignalDoc, s: ActiveGroupCall) => {
      const payload = sig.payload;
      const peerId = sig.from as string;
      const pc = getOrCreatePC(peerId, s);
      if (!pc) return;

      if (payload.type === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(s._id, sig.from, {
          type: "answer",
          sdp: pc.localDescription!.sdp,
        });
        await flushPending(peerId, pc);
      } else if (payload.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
        await flushPending(peerId, pc);
      } else if (payload.type === "ice") {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch (error) {
            console.warn("addIceCandidate failed:", error);
          }
        } else {
          const list = pendingCandidatesRef.current.get(peerId) ?? [];
          list.push(payload.candidate);
          pendingCandidatesRef.current.set(peerId, list);
        }
      }
    },
    [getOrCreatePC, sendSignal, flushPending],
  );

  // Create connections to every other participant (lower id offers first).
  const ensureConnections = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !myId) return;
    for (const participantId of s.participantIds) {
      if (participantId === myId) continue;
      const pc = getOrCreatePC(participantId as string, s);
      if (!pc) continue;
      const isOfferer = myId < participantId;
      if (isOfferer && !pc.localDescription) {
        void (async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(s._id, participantId, {
              type: "offer",
              sdp: pc.localDescription!.sdp,
            });
          } catch (error) {
            console.warn("Could not create offer:", error);
          }
        })();
      }
    }
  }, [myId, getOrCreatePC, sendSignal]);

  // Session lifecycle: reset per-session state, acquire media, connect mesh.
  useEffect(() => {
    if (!session) {
      for (const pc of pcMapRef.current.values()) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        try {
          pc.close();
        } catch {
          /* noop */
        }
      }
      pcMapRef.current.clear();
      pendingCandidatesRef.current.clear();
      const local = localStreamRef.current;
      if (local) {
        local.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      setLocalStream(null);
      setRemoteStreams({});
      setMicOn(true);
      setCamOn(true);
      appliedSignalsRef.current = new Set();
      sessionRef.current = null;
      return;
    }

    sessionRef.current = session;
    appliedSignalsRef.current = new Set();
    pendingCandidatesRef.current = new Map();

    if (!localStreamRef.current) {
      let cancelled = false;
      (async () => {
        const stream = await acquireMedia(session.kind);
        if (cancelled || localStreamRef.current) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (stream) {
          for (const pc of pcMapRef.current.values()) {
            try {
              stream.getTracks().forEach((t) => pc.addTrack(t, stream));
            } catch {
              /* noop */
            }
          }
        }
        ensureConnections();
      })();
      return () => {
        cancelled = true;
      };
    }

    ensureConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?._id, session === null]);

  // Process incoming signaling in order.
  useEffect(() => {
    if (!session || !signals || !myId) return;
    for (const sig of signals) {
      if (sig.from === myId || sig.to !== myId) continue;
      if (appliedSignalsRef.current.has(sig._id)) continue;
      enqueue(async () => {
        if (appliedSignalsRef.current.has(sig._id)) return;
        await processSignal(sig, session);
        appliedSignalsRef.current.add(sig._id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, signals, myId, enqueue]);

  // Reflect "in a call" status to other users.
  useEffect(() => {
    if (!myId) return;
    if (session?.status === "active") {
      void updatePresence({ data: { inCall: true } });
    } else {
      void updatePresence({ data: {} });
    }
  }, [session?.status === "active", myId, updatePresence]);

  const startGroupCall = useCallback(
    async (groupId: Id<"groups">, kind: "video" | "audio") => {
      try {
        await startGroupCallMutation({ groupId, kind });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not start the call",
        );
      }
    },
    [startGroupCallMutation],
  );

  const endGroupCall = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      await endGroupCallMutation({ sessionId: s._id });
    } catch {
      /* call already gone — fine */
    }
  }, [endGroupCallMutation]);

  const toggleMic = useCallback(() => {
    const local = localStreamRef.current;
    if (!local) return;
    const next = !micOn;
    local.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const local = localStreamRef.current;
    if (!local) return;
    const next = !camOn;
    local.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }, [camOn]);

  return {
    session,
    localStream,
    remoteStreams,
    micOn,
    camOn,
    isCaller: session ? session.initiatorId === myId : false,
    startGroupCall,
    endGroupCall,
    toggleMic,
    toggleCam,
  };
}
