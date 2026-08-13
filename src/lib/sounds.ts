/**
 * Sound effects for calls & messages — synthesized with the Web Audio API so
 * no audio files are needed. Browsers/WebViews block audio until the user has
 * interacted with the page at least once, so `initAudioUnlock()` must be
 * mounted at app start (it resumes the context on the first tap/click/key).
 */

let ctx: AudioContext | null = null;
let unlocked = false;
let ringTimers: number[] = [];
let ringPlaying = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Resume the audio context (must follow a user gesture). */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
}

/** Call once at app start — unlocks audio on the first user interaction. */
export function initAudioUnlock(): void {
  if (typeof window === "undefined") return;
  const unlock = () => unlockAudio();
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
}

function masterGain(c: AudioContext, volume: number): GainNode {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.connect(c.destination);
  gain.gain.exponentialRampToValueAtTime(volume, c.currentTime + 0.04);
  return gain;
}

/** One "brrrring" — the classic two-tone telephone ring (440+480 Hz). */
function playRingChunk(c: AudioContext): void {
  const now = c.currentTime;
  const gain = masterGain(c, 0.16);
  const o1 = c.createOscillator();
  o1.type = "sine";
  o1.frequency.value = 440;
  const o2 = c.createOscillator();
  o2.type = "sine";
  o2.frequency.value = 480;
  o1.connect(gain);
  o2.connect(gain);
  // Gentle tremolo so it sounds like a real phone ring.
  const lfo = c.createOscillator();
  lfo.frequency.value = 22;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  o1.start(now);
  o2.start(now);
  lfo.start(now);
  o1.stop(now + 1.6);
  o2.stop(now + 1.6);
  lfo.stop(now + 1.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.75);
}

/** Start the incoming-call ringtone (repeats until stopped). */
export function startRingtone(): void {
  stopRingtone();
  const c = getCtx();
  if (!c || !unlocked) return; // audio only after the user has interacted
  if (c.state === "suspended") void c.resume();
  ringPlaying = true;
  const loop = () => {
    if (!ringPlaying) return;
    playRingChunk(c);
    // 1.6s ring + 1.4s gap ≈ a natural phone ring cadence
    ringTimers.push(window.setTimeout(loop, 3000));
  };
  loop();
}

export function stopRingtone(): void {
  ringPlaying = false;
  for (const t of ringTimers) window.clearTimeout(t);
  ringTimers = [];
}

/** Short, soft two-note "ding" for incoming messages. */
export function playMessageDing(): void {
  const c = getCtx();
  if (!c || !unlocked) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  const gain = masterGain(c, 0.1);
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(988, now); // B5
  o.frequency.setValueAtTime(1319, now + 0.12); // E6
  o.connect(gain);
  o.start(now);
  o.stop(now + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
}

/** Vibrate the phone on an incoming call (Android; no-op elsewhere). */
export function vibrateCall(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([400, 250, 400, 250, 400]);
    } catch {
      /* unsupported */
    }
  }
}

export function vibrateMessage(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(120);
    } catch {
      /* unsupported */
    }
  }
}
