// Renders the app icon and the launch artwork from the AVEN. wordmark: ivory, charcoal "A", bronze full stop. Run: node apps/mobile/assets/make-icon.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(import.meta.url)('sharp');
const out = (name) => fileURLToPath(new URL(`../ios/App/App/Assets.xcassets/${name}`, import.meta.url));
const font = "Playfair Display, Georgia, 'Times New Roman', serif";
const icon = (dark) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark ? '#34322E' : '#FBF9F4'}"/><stop offset="1" stop-color="${dark ? '#2B2A27' : '#F4F0E7'}"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <text x="512" y="690" text-anchor="middle" font-family="${font}" font-size="640" font-weight="600" fill="${dark ? '#F8F6F1' : '#2B2A27'}">A<tspan fill="#A48766">.</tspan></text>
  <rect x="352" y="778" width="320" height="6" rx="3" fill="#A48766" opacity="0.55"/>
</svg>`;
await sharp(Buffer.from(icon(false))).flatten({ background: '#F8F6F1' }).png().toFile(out('AppIcon.appiconset/AppIcon-512@2x.png'));
await sharp(Buffer.from(icon(true))).flatten({ background: '#2B2A27' }).png().toFile(out('AppIcon.appiconset/AppIcon-dark.png'));
console.log('icons written');
