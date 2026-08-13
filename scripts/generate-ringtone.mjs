// Generates android/app/src/main/res/raw/freecall_ring.wav — a phone-style
// two-tone ringtone (440+480 Hz, repeated bursts) used by the FCM "calls"
// notification channel so an incoming call actually rings on Android.
// Run with: bun run scripts/generate-ringtone.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleRate = 22050;
const channels = 1;
const bits = 16;
const totalSeconds = 2.4;
const numSamples = Math.floor(sampleRate * totalSeconds);

// Ring cadence: 0.75s tone, 0.45s silence, repeat.
const ringDuration = 0.75;
const gapDuration = 0.45;
const period = ringDuration + gapDuration;
const fade = 0.08;

function sample(t) {
  const pos = t % period;
  if (pos >= ringDuration) return 0;
  let env = 1;
  if (pos < fade) env = pos / fade;
  else if (pos > ringDuration - fade) env = (ringDuration - pos) / fade;
  const twoTone =
    (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) / 2;
  return twoTone * env * 0.85;
}

const data = Buffer.alloc(numSamples * 2);
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const v = Math.max(-1, Math.min(1, sample(t)));
  data.writeInt16LE(Math.round(v * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
header.writeUInt16LE(channels * (bits / 8), 32);
header.writeUInt16LE(bits, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

const wav = Buffer.concat([header, data]);
const outDir = join(root, "android/app/src/main/res/raw");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "freecall_ring.wav");
writeFileSync(outFile, wav);
console.log("Wrote", outFile, wav.length, "bytes");
