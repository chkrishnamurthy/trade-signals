/**
 * Generates the PWA icons and iOS launch screens from the brand mark.
 *
 * Run by hand when the brand mark changes (never at build):
 *   pnpm --filter @equitywise/web exec node scripts/generate-pwa-assets.mjs
 *
 * Source: public/brand-mark.png (256 px). The 512 px outputs are upscaled from
 * it until a >= 1024 px master exists (docs/planning/pwa-plan.md, Phase 0);
 * replace SOURCE then and re-run.
 *
 * Colours are kept in step with PWA_COLORS in src/lib/pwa.ts (a unit test checks
 * those against globals.css).
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = `${root}public/brand-mark.png`;
const ICONS = `${root}public/icons`;
const SPLASH = `${root}public/splash`;

const LIGHT_BACKGROUND = '#edf0f3';
const DARK_BACKGROUND = '#05070c';

/** iPhone launch-screen sizes in device pixels (portrait). Kept in step with IOS_SPLASH_SCREENS in src/lib/pwa.ts. */
const SPLASH_SIZES = [
  [1320, 2868],
  [1206, 2622],
  [1290, 2796],
  [1179, 2556],
  [1284, 2778],
  [1170, 2532],
  [1125, 2436],
  [1242, 2688],
  [828, 1792],
  [1242, 2208],
  [750, 1334],
];

/** The tile's own edge colour, so a full-bleed background reads as part of the mark. */
async function tileColour() {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const x = Math.round(info.width / 2);
  const y = 6; // just inside the top edge, clear of the rounded corners
  const i = (y * info.width + x) * info.channels;
  return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0, alpha: 1 };
}

const resized = (size) => sharp(SOURCE).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();

async function flatOn(size, background) {
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: await resized(size) }])
    .png()
    .toBuffer();
}

await mkdir(ICONS, { recursive: true });
await mkdir(SPLASH, { recursive: true });
const tile = await tileColour();

await sharp(await resized(192)).toFile(`${ICONS}/icon-192.png`);
await sharp(await resized(512)).toFile(`${ICONS}/icon-512.png`);
// Maskable: full-bleed, so the launcher's own mask never shows transparent corners.
await sharp(await flatOn(512, tile)).toFile(`${ICONS}/maskable-512.png`);
// iOS rounds the icon itself and paints transparent corners black: flatten it.
await sharp(await flatOn(180, tile)).toFile(`${root}src/app/apple-icon.png`);

for (const [width, height] of SPLASH_SIZES) {
  const mark = Math.round(width * 0.28);
  const markPng = await resized(mark);
  for (const [theme, background] of [
    ['light', LIGHT_BACKGROUND],
    ['dark', DARK_BACKGROUND],
  ]) {
    await sharp({ create: { width, height, channels: 4, background } })
      .composite([{ input: markPng, gravity: 'centre' }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(`${SPLASH}/${theme}-${width}x${height}.png`);
  }
}
console.log('PWA assets written to public/icons, public/splash and src/app/apple-icon.png');
