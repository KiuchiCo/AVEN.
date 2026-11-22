import type { Page } from '@playwright/test';

const axePath = require.resolve('axe-core');

/** WCAG 2.2 A and AA problems on the current page, in a real browser (including colour contrast). Third-party widgets (Clerk's sign-in) are left out. Needs `bypassCSP` on the context, because axe is injected. */
export async function accessibilityProblems(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: [['.cl-rootBox'], ['.cl-component'], ['nextjs-portal']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return result.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(', ')}`);
  });
}

/** Pixels the page is wider than the window (0 when nothing scrolls sideways). */
export const sidewaysOverflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
