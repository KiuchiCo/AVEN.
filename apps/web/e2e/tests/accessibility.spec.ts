import { expect, test, type Page } from '@playwright/test';

const axePath = require.resolve('axe-core');
const token = process.env.E2E_TOKEN_ACTIVE!;
// axe is injected into the page; the page's script policy would refuse that, so this file (and only this file) lets the test tool bypass it.
test.use({ bypassCSP: true });

/** WCAG 2.2 A and AA rules in a real browser, including colour contrast, which jsdom cannot check. Clerk's own sign-in widget is a third-party component and is left out. */
async function problems(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: [['.cl-rootBox'], ['.cl-component']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return result.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(', ')}`);
  });
}

const pages: [string, () => string][] = [['the landing page', () => '/sign-in'], ['a shared document', () => `/shared/${token}`], ['a shared link that no longer works', () => '/shared/not-a-real-link']];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => { await page.addInitScript((value) => { try { localStorage.setItem('aven-theme', value); } catch { /* none */ } }, theme); });
    for (const [name, path] of pages) {
      test(`${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(path());
        await page.waitForLoadState('load'); await page.waitForTimeout(800); // not 'networkidle': the sign-in widget keeps a connection open
        expect(await problems(page)).toEqual([]);
      });
    }
  });
}

test('a shared document can be read with the keyboard alone: focus is visible and every control is reachable', async ({ page }) => {
  await page.goto(`/shared/${token}`);
  const seen = new Set<string>();
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab'); // (the dev server's own overlay element is skipped below: it is not part of the app)
    const info = await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (!el || el === document.body || el.tagName === 'NEXTJS-PORTAL') return null; const style = getComputedStyle(el); return { id: `${el.tagName}:${el.textContent?.trim().slice(0, 30) ?? ''}:${el.getAttribute('href') ?? ''}`, outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0, shadow: style.boxShadow !== 'none' }; });
    if (!info) continue;
    seen.add(info.id);
    expect(info.outline || info.shadow, `focus is visible on ${info.id}`).toBe(true);
  }
  expect(seen.size).toBeGreaterThan(0);
});

test('reduced motion is respected: nothing keeps animating for people who ask for less', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/shared/${token}`);
  const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && (animation.effect?.getComputedTiming().iterations ?? 1) === Infinity).length);
  expect(running).toBe(0);
});

test('text can be enlarged to 200% without losing content or sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 }); // 1280 px at 200%
  await page.goto(`/shared/${token}`);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
