import { expect, test } from '@playwright/test';

const token = process.env.E2E_TOKEN_ACTIVE!;
const viewports = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812]] as const;
const pages: [string, string][] = [['sign-in', '/sign-in'], ['a shared document', `/shared/${token}`], ['a link that no longer works', '/shared/not-a-real-link'], ['the offline page', '/offline.html']];

for (const [width, height] of viewports) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });
    for (const [name, path] of pages) {
      test(`${name}: no sideways scroll, nothing clipped off the left, controls big enough to touch on phones`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBeLessThan(400);
        await page.waitForLoadState('load'); await page.waitForTimeout(800); // not 'networkidle': the sign-in widget keeps a connection open
        const layout = await page.evaluate(() => {
          const wide = document.documentElement.scrollWidth - window.innerWidth;
          const offscreen = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right < 0 && getComputedStyle(el).position !== 'fixed'; }).length;
          const small = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea')].filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.height < 24 || r.width < 24) && !(el as HTMLInputElement).disabled && !(el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el as HTMLInputElement).type)) && !el.closest('.cl-rootBox, .cl-component'); }).map((el) => `${el.tagName}:${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 20)}`);
          return { wide, offscreen, small };
        });
        expect(layout.wide, 'horizontal overflow in px').toBeLessThanOrEqual(1);
        expect(layout.offscreen, 'elements pushed off the left edge').toBe(0);
        expect(layout.small, 'controls smaller than 24 × 24 px (WCAG 2.2 target size, minimum; disabled controls and native checkboxes are exempt)').toEqual([]);
      });
    }
  });
}
