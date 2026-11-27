import { expect, test } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '4100';
const apiBase = `http://127.0.0.1:${apiPort}/api/v1`;
const token = (name: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'DOWNLOAD') => process.env[`E2E_TOKEN_${name}`]!;
const unavailable = 'This link is no longer available';

test.describe('a shared document link', () => {
  test('shows the document read-only, and renders anything hostile as plain text', async ({ page }) => {
    const dialogs: string[] = []; page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    const response = await page.goto(`/shared/${token('ACTIVE')}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Launch plan' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Launch plan' })).toBeVisible();
    await expect(page.getByText('Everything here is read only.')).toBeVisible();
    await expect(page.getByText('First bullet')).toBeVisible();
    await expect(page.getByText('1.', { exact: true })).toBeVisible(); await expect(page.getByText('2.', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Done' })).toBeChecked(); await expect(page.getByRole('checkbox', { name: 'Done' })).toBeDisabled();
    await expect(page.getByRole('cell', { name: 'Ana' })).toBeVisible();
    await expect(page.getByText('<script>window.__pwned=1</script>', { exact: false })).toBeVisible();
    // Nothing can be edited, and no scripts from the content ran.
    await expect(page.locator('textarea, input:not([disabled]), [contenteditable="true"], form')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('tells search engines and other sites nothing, and is protected by security headers', async ({ page }) => {
    const response = await page.goto(`/shared/${token('ACTIVE')}`);
    const headers = response!.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBeTruthy();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await expect(page).toHaveTitle(/Shared document/);
  });

  test('looks identical for a revoked, an expired and an unknown link, so nothing leaks', async ({ page }) => {
    const bodies: string[] = [];
    for (const path of [token('REVOKED'), token('EXPIRED'), 'not-a-real-token-at-all']) {
      const response = await page.goto(`/shared/${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: unavailable })).toBeVisible();
      bodies.push(await page.locator('main').innerText());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain('Launch plan');
  });

  test('fits on a phone: no sideways page scroll even with a very wide table', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/shared/${token('ACTIVE')}`);
    await expect(page.getByRole('cell', { name: 'Ana' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('what a link allows', () => {
  test('private links show as restricted, and there is nothing to download unless the owner allowed it', async ({ page }) => {
    await page.goto(`/shared/${token('ACTIVE')}`);
    await expect(page.getByText('A database that is not shared with you')).toBeVisible();
    await expect(page.getByText('A linked page that is not shared with you')).toBeVisible();
    await expect(page.getByRole('link', { name: /Download/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  });

  test('when downloads are allowed the buttons give real PDF and Word files; otherwise the server refuses', async ({ page, request }) => {
    await page.goto(`/shared/${token('DOWNLOAD')}`);
    await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Download Word' })).toBeVisible();
    const pdfUrl = await page.getByRole('link', { name: 'Download PDF' }).getAttribute('href');
    const pdf = await request.get(pdfUrl!); expect(pdf.status()).toBe(200); expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(pdf.headers()['content-disposition']).toContain('AVEN - Launch plan.pdf'); expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const word = await request.get(`${apiBase}/shared/documents/${token('DOWNLOAD')}/export?format=docx`); expect(word.status()).toBe(200); expect((await word.body()).subarray(0, 2).toString()).toBe('PK');
    expect((await request.get(`${apiBase}/shared/documents/${token('ACTIVE')}/export?format=pdf`)).status()).toBe(403);
    expect((await request.get(`${apiBase}/shared/documents/${token('REVOKED')}/export?format=pdf`)).status()).toBe(404);
  });
});

test.describe('the public API behind it', () => {
  test('returns only what a reader needs, and counts the view', async ({ request }) => {
    const response = await request.get(`${apiBase}/shared/documents/${token('ACTIVE')}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['allowDownload', 'allowPrint', 'blocks', 'title', 'updatedAt']);
    expect(body.allowDownload).toBe(false);
    expect(body.title).toBe('Launch plan'); expect(body.blocks.length).toBeGreaterThan(5);
    expect(JSON.stringify(body)).not.toMatch(/workspaceId|documentId|createdBy|tokenHash/);
  });

  test('answers every bad link with the same 404, and refuses anonymous workspace requests', async ({ request }) => {
    const statuses = await Promise.all([token('REVOKED'), token('EXPIRED'), 'nope'].map(async (value) => (await request.get(`${apiBase}/shared/documents/${value}`)).status()));
    expect(statuses).toEqual([404, 404, 404]);
    expect((await request.get(`${apiBase}/session/me`)).status()).toBe(401);
    expect((await request.get(`${apiBase}/workspaces/11111111-1111-4111-8111-111111111111/projects`)).status()).toBe(401);
  });
});

test.describe('the signed-out app', () => {
  test('sends someone without a session away from the workspace', async ({ page }) => {
    test.skip(!process.env.E2E_CLERK_PUBLISHABLE_KEY, 'needs Clerk keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) so there is a sign-in to be sent to');
    await page.goto('/workspace');
    await page.waitForLoadState('domcontentloaded');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/workspace');
    await expect(page.getByRole('link', { name: 'Inbox' })).toHaveCount(0);
  });

  test('sign-in and sign-up follow the chosen language, Clerk\u2019s own screens included', async ({ page, context, baseURL }) => {
    test.skip(!process.env.E2E_CLERK_PUBLISHABLE_KEY, 'needs Clerk keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) so there is a sign-in to show');
    const cases = [['de', 'Deine ganze Welt, organisiert.', 'Fortsetzen'], ['fr', 'Tout votre univers, organisé.', 'Continuer'], ['es', 'Todo tu mundo, organizado.', 'Continuar'], ['en', 'Your entire world, organised.', 'Continue']] as const;
    for (const [language, tagline, button] of cases) {
      await context.addCookies([{ name: 'aven-lang', value: language, url: baseURL! }]);
      for (const path of ['/sign-in', '/sign-up']) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await expect(page.getByText(tagline)).toBeVisible();
        await expect(page.locator('.cl-formButtonPrimary').first()).toContainText(button, { timeout: 30_000 });
      }
    }
  });

  test('the landing page loads without script errors', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).toContainText('AVEN');
    expect(errors).toEqual([]);
  });
});

test.describe('the script policy', () => {
  test('every page carries a fresh nonce, allows no inline script, and a script injected into the page does not run', async ({ page, request }) => {
    const first = (await request.get('/shared/not-a-link')).headers()['content-security-policy'] ?? '';
    const second = (await request.get('/shared/not-a-link')).headers()['content-security-policy'] ?? '';
    const nonce = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce(first)).toBeTruthy(); expect(nonce(first)).not.toBe(nonce(second));
    expect(first).not.toMatch(/unsafe-inline/); expect(first).toMatch(/object-src 'none'/); expect(first).toMatch(/frame-ancestors 'self'/);
    const violations: string[] = []; page.on('console', (message) => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()); });
    await page.goto('/shared/not-a-link');
    await page.evaluate(() => { const box = document.createElement('div'); box.innerHTML = '<img src="x" onerror="window.__pwned=1">'; document.body.appendChild(box); });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(violations.some((line) => /script-src/.test(line))).toBe(true);
    expect(violations.filter((line) => !/inline event handler|script-src/i.test(line)), 'the app itself breaks no rule of its own policy').toEqual([]);
  });
});

test.describe('installable and offline-aware', () => {
  test('publishes a web app manifest whose icons exist', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({ name: 'AVEN.', display: 'standalone', start_url: '/workspace' });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  test('shows a plain offline page when a page cannot load, and caches nothing else', async ({ page, context }) => {
    await page.goto(`/shared/${token('ACTIVE')}`);
    // The dev server may reload the page once while it compiles, so look again until the worker is in control.
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)).catch(() => false), { timeout: 30_000 }).toBe(true);
    await context.setOffline(true);
    await page.goto('/workspace');
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
    await context.setOffline(false);
    const cached = await page.evaluate(async () => Promise.all((await caches.keys()).map(async (key) => ({ key, urls: (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname) }))));
    expect(cached).toEqual([{ key: 'aven-offline-v1', urls: ['/offline.html'] }]);
  });
});
