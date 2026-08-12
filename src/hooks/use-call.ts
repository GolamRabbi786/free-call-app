import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  acquireMedia,
  createPeerConnection,
  ensureDataChannel,
  setTurnServers,
  type SignalPayload,
} from "@/lib/webrtc";
import { useAuth } from "./use-auth";

const RING_TIMEOUT_MS = 45_000;

type CallParticipant = { _id: string; name?: string; image?: string };

type ActiveCall = {
  _id: Id<"callSessions">;
  _creationTime: number;
  callerId: Id<"users">;
  calleeId: Id<"users">;
  kind: "video" | "audio";
  status: "ringing" | "active" | "ended" | "declined" | "missed";
  startedAt?: number;
  endedAt?: number;
  caller: CallParticipant;
  callee: CallParticipant;
};

type SignalDoc = {
  _id: Id<"callSignals">;
  _creationTime: number;
  sessionId: Id<"callSessions">;
  authorId: Id<"users">;
  payload: SignalPayload;
};

/**
 * Owns the current user's live call: subscribes to the active call session,
 * runs the WebRTC peer connection, exchanges signaling through Convex, and
 * exposes controls (accept / decline / end / mute / camera).
 *
 * Connection flow (both participants only negotiate once the call is
 * "active", i.e. the callee accepted):
 *   caller  -> acquire media, create PC, create offer, send offer
 *   callee  -> acquire media, receive offer, create answer, send answer
 *   both    -> exchange ICE candidates; the offerer opens a control data
 *              channel so the SDP always has an m=application line (ICE runs
 *              even if camera/mic media is unavailable).
 */
export function useCall() {
  const { user } = useAuth();
  const myId = user?._id;

  const session = useQuery(api.calls.activeCallFor);
  const signals = useQuery(
    api.calls.listSignals,
    session ? { sessionId: session._id } : "skip",
  );

  const getIceServers = useAction(api.turn.getIceServers);

  // Load TURN relay servers once so peer connections can traverse restrictive
  // NATs. Runs on mount; if a call starts before it resolves, STUN/host still
  // attempt and the next call gets the relay.
  useEffect(() => {
    let cancelled = false;
    void getIceServers().then((servers) => {
      if (cancelled || !servers) return;
      setTurnServers(servers as RTCIceServer[]);
    });
    return () => {
      cancelled = true;
    };
  }, [getIceServers]);

  const startCallMutation = useMutation(api.calls.startCall);
  const acceptCallMutation = useMutation(api.calls.acceptCall);
  const declineCallMutation = useMutation(api.calls.declineCall);
  const endCallMutation = useMutation(api.calls.endCall);
  const sendSignalMutation = useMutation(api.calls.sendSignal);
  const updatePresence = useMutation(api.presence.updatePresence);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>(
    "new",
  );

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Tracks whether the callee's media acquisition attempt has finished, so
  // the offer handler can wait for it before answering (see below).
  const localMediaAttemptRef = useRef({ attempted: false });
  const sessionRef = useRef<ActiveCall | null>(null);
  const appliedSignalsRef = useRef<Set<string>>(new Set());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const myEndRef = useRef(false);
  const lastStatusRef = useRef<string | null>(null);
  const wasActiveRef = useRef(false);

  const sendSignal = useCallback(
    (args: { sessionId: Id<"callSessions">; payload: SignalPayload }) =>
      sendSignalMutation(args),
    [sendSignalMutation],
  );

  const flushPendingCandidates = useCallback(
    async (pc: RTCPeerConnection) => {
      const pending = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
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
    (s: ActiveCall): RTCPeerConnection => {
      if (pcRef.current) return pcRef.current;
      const pc = createPeerConnection();

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        void sendSignal({
          sessionId: s._id,
          payload: { type: "ice", candidate: e.candidate.toJSON() },
        });
      };
      pc.ontrack = (e) => {
        if (e.streams[0]) setRemoteStream(e.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === "failed") {
          toast.error("Connection lost", {
            description: "The call ended because the connection dropped.",
          });
          myEndRef.current = true;
          const live = sessionRef.current;
          if (live) {
            void endCallMutation({ sessionId: live._id }).catch(() => {
              /* call already gone — fine */
            });
          }
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [sendSignal, endCallMutation],
  );

  const enqueue = useCallback((fn: () => Promise<void>) => {
    signalQueueRef.current = signalQueueRef.current
      .then(fn)
      .catch((error) => console.warn("Signal processing error:", error));
  }, []);

  // Process incoming signaling messages in order. IMPORTANT: every status
  // check uses the session object from the CURRENT render (passed in as `s`),
  // never a ref — a stale ref made the callee skip the offer in the same
  // commit the call flipped to "active", so the caller never got an answer
  // and the connection failed.
  useEffect(() => {
    if (!session || !signals || !myId) return;
    for (const sig of signals) {
      if (sig.authorId === myId) continue;
      if (appliedSignalsRef.current.has(sig._id)) continue;
      enqueue(async () => {
        if (appliedSignalsRef.current.has(sig._id)) return;
        await processSignal(sig, session);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, signals, myId, enqueue]);

  const processSignal = async (sig: SignalDoc, s: ActiveCall) => {
    const payload = sig.payload;
    const isCallee = s.calleeId === myId;

    if (payload.type === "offer") {
      if (!isCallee) {
        appliedSignalsRef.current.add(sig._id);
        return;
      }
      // The caller only sends its offer once the call is active, but guard
      // anyway: if it somehow arrives before the callee accepts, skip and let
      // the effect re-process it on the next render (when `s` shows active).
      if (s.status !== "active") return;
      const pc = getOrCreatePC(s);
      // IMPORTANT: the callee's local mic/camera tracks must be added to the
      // connection BEFORE createAnswer, otherwise the answer's SDP negotiates
      // no audio/video and the caller hears nothing / sees no video. Media
      // acquisition is async, so wait for it (with a timeout) first.
      if (!localStreamRef.current) {
        const deadline = Date.now() + 10_000;
        while (!localMediaAttemptRef.current.attempted && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      }
      await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({
        sessionId: s._id,
        payload: { type: "answer", sdp: pc.localDescription!.sdp },
      });
      await flushPendingCandidates(pc);
    } else if (payload.type === "answer") {
      if (isCallee) {
        appliedSignalsRef.current.add(sig._id);
        return;
      }
      const pc = getOrCreatePC(s);
      await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
      await flushPendingCandidates(pc);
    } else if (payload.type === "ice") {
      const pc = getOrCreatePC(s);
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (error) {
          console.warn("addIceCandidate failed:", error);
        }
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    }
    appliedSignalsRef.current.add(sig._id);
  };

  // Track the live session + its latest status in refs.
  useEffect(() => {
    if (!session) return;
    sessionRef.current = session;
    lastStatusRef.current = session.status;
    if (session.status === "active") wasActiveRef.current = true;
  }, [session]);

  // Session lifecycle: teardown + notify when a call disappears.
  useEffect(() => {
    if (session) {
      appliedSignalsRef.current = new Set();
      pendingCandidatesRef.current = [];
      return;
    }
    const prev = lastStatusRef.current;

    // Tear down the peer connection and media.
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* noop */
      }
      pcRef.current = null;
    }
    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("new");
    setMicOn(true);
    setCamOn(true);
    appliedSignalsRef.current = new Set();
    pendingCandidatesRef.current = [];

    if (prev !== null) {
      if (!myEndRef.current) {
        if (prev === "declined") {
          toast.info("Call declined");
        } else if (prev === "missed") {
          toast.info("No answer", { description: "They didn't pick up." });
        } else if (wasActiveRef.current) {
          toast.info("Call ended");
        } else {
          toast.info("Call cancelled");
        }
      }
      myEndRef.current = false;
      wasActiveRef.current = false;
      lastStatusRef.current = null;
    }
  }, [session?._id, session === null]);

  // Caller: once the callee accepts (status "active"), acquire media and send
  // the offer. Sending it only after accept removes the ringing-phase race
  // where the callee had to defer the offer until the status flipped.
  useEffect(() => {
    if (!session || session.callerId !== myId || !myId) return;
    if (session.status !== "active") return;
    if (localStreamRef.current) return;
    let cancelled = false;

    (async () => {
      const stream = await acquireMedia(session.kind);
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (localStreamRef.current) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      const pc = getOrCreatePC(session);
      if (stream) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        localStreamRef.current = stream;
        setLocalStream(stream);
      }
      if (!pc.localDescription) {
        // Guarantee an m-line so ICE runs even if media is unavailable.
        ensureDataChannel(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          sessionId: session._id,
          payload: { type: "offer", sdp: pc.localDescription!.sdp },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?._id, session?.status, myId]);

  // Callee: acquire media once the call is accepted, and flag when the
  // attempt finishes so the offer handler can answer only after our tracks
  // are on the connection (fixes one-way audio + missing callee video).
  useEffect(() => {
    if (!session || session.status !== "active") return;
    if (session.calleeId !== myId || !myId) return;
    if (localStreamRef.current) return;
    localMediaAttemptRef.current = { attempted: false };
    let cancelled = false;

    (async () => {
      const stream = await acquireMedia(session.kind);
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (localStreamRef.current) {
        stream?.getTracks().forEach((t) => t.stop());
        localMediaAttemptRef.current = { attempted: true };
        return;
      }
      const pc = getOrCreatePC(session);
      if (stream) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        localStreamRef.current = stream;
        setLocalStream(stream);
      }
      localMediaAttemptRef.current = { attempted: true };
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?._id, session?.status, myId]);

  // Caller: auto-miss the call if nobody answers in time.
  useEffect(() => {
    if (!session || session.status !== "ringing" || session.callerId !== myId) {
      return;
    }
    const timer = setTimeout(() => {
      void endCallMutation({ sessionId: session._id, outcome: "missed" });
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [session?._id, session?.status, myId, endCallMutation]);

  // Reflect "in a call" status to other users.
  useEffect(() => {
    if (!myId) return;
    if (session?.status === "active") {
      void updatePresence({ data: { inCall: true } });
    } else {
      void updatePresence({ data: {} });
    }
  }, [session?.status === "active", myId, updatePresence]);

  const startCall = useCallback(
    async (calleeId: Id<"users">, kind: "video" | "audio") => {
      try {
        await startCallMutation({ calleeId, kind });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not start the call",
        );
      }
    },
    [startCallMutation],
  );

  const acceptCall = useCallback(async () => {
    const live = sessionRef.current;
    if (!live) return;
    try {
      await acceptCallMutation({ sessionId: live._id });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not accept the call",
      );
    }
  }, [acceptCallMutation]);

  const declineCall = useCallback(async () => {
    const live = sessionRef.current;
    if (!live) return;
    try {
      await declineCallMutation({ sessionId: live._id });
    } catch {
      /* call already gone — fine */
    }
  }, [declineCallMutation]);

  const endCall = useCallback(async () => {
    const live = sessionRef.current;
    if (!live) return;
    myEndRef.current = true;
    try {
      await endCallMutation({ sessionId: live._id });
    } catch {
      /* noop */
    }
  }, [endCallMutation]);

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

  const isCaller = session ? session.callerId === myId : false;

  return {
    session,
    localStream,
    remoteStream,
    micOn,
    camOn,
    connectionState,
    isCaller,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCam,
  };
}
