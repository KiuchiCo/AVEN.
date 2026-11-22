import axe from 'axe-core';

/**
 * Runs the axe accessibility rules on a rendered component and returns the problems as readable text.
 * jsdom has no layout or painting, so colour contrast and other visual rules cannot run here; those are checked in a real browser (e2e/tests/accessibility.spec.ts).
 */
export async function accessibilityProblems(container: Element): Promise<string[]> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`);
}
