/**
 * One-off: generates PWA icons in public/icons/. Run: node scripts/generate-pwa-icons.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const dir = join(process.cwd(), "public", "icons");
mkdirSync(dir, { recursive: true });

const accent = "#22d3ee";
const bg = "#0a0a0a";

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="${bg}"/>
  <circle cx="256" cy="220" r="56" fill="none" stroke="${accent}" stroke-width="28"/>
  <path d="M160 380c32-48 80-72 96-72s64 24 96 72" fill="none" stroke="${accent}" stroke-width="24" stroke-linecap="round"/>
</svg>`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="128" fill="${bg}"/>
  <circle cx="256" cy="220" r="48" fill="none" stroke="${accent}" stroke-width="24"/>
  <path d="M168 384c36-44 88-68 88-68s52 24 88 68" fill="none" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>
</svg>`;

for (const size of [192, 512]) {
  await sharp(Buffer.from(iconSvg)).resize(size, size).png().toFile(join(dir, `icon-${size}.png`));
}

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(join(dir, "icon-maskable-512.png"));

console.log("Wrote public/icons/icon-192.png, icon-512.png, icon-maskable-512.png");
