import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';
import { accessibilityProblems, sidewaysOverflow } from '../helpers';

/**
 * Signed-in journeys against a real Clerk DEVELOPMENT instance. They are skipped unless E2E_CLERK_USER_EMAIL names an existing user of that instance, and they refuse to run
 * against a production Clerk key. Sign-in uses Clerk's own testing support (@clerk/testing): the helper asks Clerk's backend API for a one-time sign-in ticket for that user,
 * so no password is typed or stored anywhere. Nothing here weakens the app's authentication: the app is signed into by Clerk exactly as in production.
 *
 *   E2E_CLERK_USER_EMAIL         an existing user of the dev instance (use a throwaway test user)
 *   E2E_CLERK_PUBLISHABLE_KEY / E2E_CLERK_SECRET_KEY    the dev instance's keys (read from the root .env by `npm run test:e2e`)
 *
 * These tests have NOT been executed in the session that wrote them: no test user or Clerk access was available. See docs/TESTING.md.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const production = (process.env.E2E_CLERK_PUBLISHABLE_KEY ?? '').startsWith('pk_live_') || (process.env.E2E_CLERK_SECRET_KEY ?? '').startsWith('sk_live_');
test.skip(!email || production, production ? 'refusing to run signed-in tests against a production Clerk instance' : 'needs E2E_CLERK_USER_EMAIL (an existing user of a Clerk development instance)');
test.use({ bypassCSP: true });
test.describe.configure({ mode: 'serial' });

async function signIn(page: Page) {
  await page.goto('/sign-in'); // a page that is not protected but loads Clerk
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto('/workspace');
  await expect(page.getByRole('link', { name: 'Inbox' }).first()).toBeVisible({ timeout: 45_000 });
}

test.beforeAll(async () => { await clerkSetup(); });

test.describe('signing in and out', () => {
  test('signed out, protected pages and data are closed; signed in, the workspace opens; signing out closes it again', async ({ page, request }) => {
    expect((await request.get(`http://127.0.0.1:${process.env.E2E_API_PORT ?? '4100'}/api/v1/session/me`)).status()).toBe(401);
    await page.goto('/workspace/projects');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toMatch(/sign-in/);
    await signIn(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await clerk.signOut({ page });
    await page.goto('/workspace');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toMatch(/sign-in/);
  });
});

const screens = ['/workspace', '/workspace/tasks', '/workspace/projects', '/workspace/documents', '/workspace/databases', '/workspace/calendar', '/workspace/messages', '/workspace/files', '/workspace/inbox', '/workspace/knowledge', '/workspace/whiteboards', '/workspace/automations', '/workspace/intelligence', '/workspace/analytics', '/workspace/settings'];
for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]] as const) {
  test.describe(`every screen at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });
    for (const path of screens) {
      test(`${path}: loads, does not scroll sideways, and has no WCAG 2.2 AA violations`, async ({ page }) => {
        await signIn(page);
        const response = await page.goto(path); expect(response?.status()).toBeLessThan(400);
        await page.waitForLoadState('load'); await page.waitForTimeout(1500);
        expect(await sidewaysOverflow(page), 'sideways overflow in px').toBeLessThanOrEqual(1);
        expect(await accessibilityProblems(page)).toEqual([]);
      });
    }
  });
}

test.describe('working journeys', () => {
  test('create a project, see it in the list, and open it', async ({ page }) => {
    await signIn(page); await page.goto('/workspace/projects');
    const name = `E2E project ${Date.now()}`;
    await page.getByRole('button', { name: /new project/i }).first().click();
    await page.getByRole('dialog').getByLabel(/name/i).first().fill(name);
    await page.getByRole('dialog').getByRole('button', { name: /create project/i }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
  });

  test('settings: the data card downloads a copy, and the delete dialog explains itself and can be cancelled without deleting anything', async ({ page }) => {
    await signIn(page); await page.goto('/workspace/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download my data/i }).click()]);
    expect(download.suggestedFilename()).toBe('aven-my-data.json');
    await page.getByRole('button', { name: /delete my account/i }).click();
    const dialog = page.getByRole('dialog', { name: /delete my account/i });
    await expect(dialog.getByRole('listitem')).toHaveCount(6);
    await expect(dialog.getByRole('button', { name: /delete my account permanently/i })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    await page.goto('/workspace'); await expect(page.getByRole('link', { name: 'Inbox' }).first()).toBeVisible(); // still signed in, still there
  });

  test('settings: theme choice is remembered and applied', async ({ page }) => {
    await signIn(page); await page.goto('/workspace/settings');
    await page.getByRole('radio', { name: /dark/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: /light/i }).click();
  });
});

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 }); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
}
const centre = async (locator: import('@playwright/test').Locator) => { const box = (await locator.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };

test.describe('phase 7 journeys', () => {
  test('messages: react to a message, see who reacted, and take it back', async ({ page }) => {
    await signIn(page); await page.goto('/workspace/messages');
    await page.getByRole('button', { name: 'Add a channel' }).click();
    await page.getByLabel('New channel').fill(`e2e-${Date.now().toString(36)}`); await page.getByLabel('New channel').press('Enter');
    const composer = page.getByRole('textbox', { name: /^Message/ });
    await composer.fill('Reaction test'); await composer.press('Enter');
    const message = page.locator('.msgs-message', { hasText: 'Reaction test' });
    await expect(message).toBeVisible({ timeout: 20_000 });
    await message.hover(); await message.locator('summary.msgs-reaction--add').click();
    await page.getByRole('button', { name: 'Celebrate', exact: true }).click();
    const chip = message.getByRole('button', { name: /^Celebrate: 1, from you$/ });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Celebrate', exact: true })).toBeHidden(); // the picker closed
    await page.reload(); await expect(page.locator('.msgs-message', { hasText: 'Reaction test' }).getByRole('button', { name: /^Celebrate: 1/ })).toBeVisible({ timeout: 20_000 }); // saved
    await page.locator('.msgs-message', { hasText: 'Reaction test' }).getByRole('button', { name: /^Celebrate: 1/ }).click();
    await expect(page.locator('.msgs-message', { hasText: 'Reaction test' }).getByRole('button', { name: /^Celebrate/ })).toHaveCount(0);
  });

  test('calendar: drag an event to another day, undo it, and lengthen it by dragging its edge', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page); await page.goto('/workspace/calendar');
    const today = new Date(); const other = new Date(today); other.setDate(today.getDate() + (today.getDay() === 0 ? -1 : 1)); // stays in this Monday–Sunday week
    await page.getByRole('button', { name: 'New event' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Event title').fill('E2E drag');
    await dialog.getByLabel(/^Ends/).fill(`${dayKey(today)}T10:00`);
    await dialog.getByRole('button', { name: 'Add to calendar' }).click(); await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Week', exact: true }).click();
    const chip = page.locator('.aven-calendar__week-event', { hasText: 'E2E drag' });
    await expect(page.locator(`section[data-cal-date="${dayKey(today)}"]`).getByText('E2E drag')).toBeVisible();
    await dragBetween(page, await centre(chip), await centre(page.locator(`section[data-cal-date="${dayKey(other)}"]`)));
    await expect(page.locator(`section[data-cal-date="${dayKey(other)}"]`).getByText('E2E drag')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0); // a drag does not also open the event
    await page.getByRole('status').filter({ hasText: 'Moved “E2E drag”' }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator(`section[data-cal-date="${dayKey(today)}"]`).getByText('E2E drag')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Day', exact: true }).click();
    const event = page.locator('.aven-calendar__timeline-event', { hasText: 'E2E drag' });
    await expect(event).toContainText(/10:00/);
    const handle = event.locator('.aven-calendar__resize'); const row = (await page.locator('.aven-calendar__hour').first().boundingBox())!;
    const from = await centre(handle); await dragBetween(page, from, { x: from.x, y: from.y + row.height });
    await expect(event).toContainText(/11:00/, { timeout: 15_000 });
    await page.reload(); await page.getByRole('button', { name: 'Day', exact: true }).click();
    await expect(page.locator('.aven-calendar__timeline-event', { hasText: 'E2E drag' })).toContainText(/11:00/, { timeout: 20_000 }); // saved
  });
});

// Registration, email verification, password reset and multi-factor happen inside Clerk's own screens. Clerk's testing support signs in an existing user but cannot drive those:
// run them by hand against the development instance with a "+clerk_test" address (Clerk accepts the fixed code 424242 for those), as listed in docs/TESTING.md.
