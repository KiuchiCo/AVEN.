// One-off: renders public/assets/aven-icon.svg to the PNG sizes the web app manifest needs. Run: node e2e/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/assets/aven-icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: new URL(`../public/assets/aven-icon-${size}.png`, import.meta.url).pathname, omitBackground: false });
  await page.close();
}
await browser.close();
