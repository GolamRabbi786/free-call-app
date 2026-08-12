/**
 * Generates Android launcher icons + splash screens from the Free Call brand
 * logo (public/logo.svg) using sharp.
 *
 * Usage: bun run scripts/generate-android-icons.mjs
 */
import sharp from "sharp";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RES = "android/app/src/main/res";

const logo = readFileSync("public/logo.svg", "utf8");

const DENSITIES = [
  { dir: "mipmap-mdpi", scale: 1 },
  { dir: "mipmap-hdpi", scale: 1.5 },
  { dir: "mipmap-xhdpi", scale: 2 },
  { dir: "mipmap-xxhdpi", scale: 3 },
  { dir: "mipmap-xxxhdpi", scale: 4 },
];

async function renderSvg(svg, size, out) {
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(out);
}

/** Same logo, clipped to a circle for the round launcher icon. */
const roundLogo = logo.replace(
  "<!-- Glass shine from the top -->",
  `  <clipPath id="round"><circle cx="256" cy="256" r="250"/></clipPath>
  <g clip-path="url(#round)">

  <!-- Glass shine from the top -->`,
);

// Close the extra group after the last element (before </svg>).
const roundLogoSVG = roundLogo.replace("</svg>", "  </g>\n</svg>");

const foregroundSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(27.72,27.72) scale(2.19)" fill="#ffffff">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </g>
  <g stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" fill="none">
    <path d="M 70.5 50.6 A 3.4 3.4 0 0 1 70.5 57.4"/>
    <path d="M 70.5 47.8 A 6.2 6.2 0 0 1 70.5 60.2"/>
  </g>
</svg>`;

const backgroundSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/>
      <stop offset="0.55" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>
  <rect width="108" height="108" fill="url(#g)"/>
</svg>`;

// --- 1. Legacy launcher icons (rounded square) + round icons ---
for (const { dir, scale } of DENSITIES) {
  const size = 48 * scale;
  await renderSvg(logo, size, join(RES, dir, "ic_launcher.png"));
  await renderSvg(roundLogoSVG, size, join(RES, dir, "ic_launcher_round.png"));
  console.log(`✓ ${dir}/ic_launcher.png + ic_launcher_round.png (${size}px)`);
}

// --- 2. Adaptive icon layers (foreground glyph + gradient background) ---
for (const { dir, scale } of DENSITIES) {
  const size = 108 * scale;
  await renderSvg(foregroundSVG, size, join(RES, dir, "ic_launcher_foreground.png"));
  await renderSvg(backgroundSVG, size, join(RES, dir, "ic_launcher_background.png"));
  console.log(`✓ ${dir}/ic_launcher_foreground.png + ic_launcher_background.png (${size}px)`);
}

// Point the adaptive icons at the gradient background image.
for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const path = join(RES, "mipmap-anydpi-v26", file);
  const xml = readFileSync(path, "utf8").replace(
    "@color/ic_launcher_background",
    "@mipmap/ic_launcher_background",
  );
  writeFileSync(path, xml);
  console.log(`✓ mipmap-anydpi-v26/${file} -> @mipmap/ic_launcher_background`);
}

// --- 3. Splash screens: light background + centered logo ---
const splashBackground = { r: 247, g: 251, b: 255 }; // #f7fbff

function findSplashFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findSplashFiles(full));
    } else if (entry === "splash.png") {
      out.push(full);
    }
  }
  return out;
}

for (const file of findSplashFiles(RES)) {
  const { width, height } = await sharp(file).metadata();
  const logoSize = Math.round(Math.min(width, height) * 0.34);
  const logoBuffer = await sharp(Buffer.from(logo))
    .resize(logoSize, logoSize, { fit: "cover" })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: splashBackground,
    },
  })
    .composite([{ input: logoBuffer, gravity: "center" }])
    .png()
    .toFile(file);
  console.log(`✓ splash ${file.replace(RES + "/", "")} (${width}x${height})`);
}

console.log("\nDone — all Android icons regenerated.");
