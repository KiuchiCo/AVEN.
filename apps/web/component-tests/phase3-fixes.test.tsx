import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Panel } from '../app/workspace/ui';
import { LanguageProvider } from '../app/i18n';
import { apiFetch, connectionError, NetworkError } from '../app/workspace/connection-error';
import { validateComment } from '../app/workspace/tasks/[taskId]/lib/comment-validation';

describe('Panel', () => {
  it('gives every panel its own heading id, so each region is named by its own title', () => {
    render(<><Panel title="First"><p>a</p></Panel><Panel title="Second"><p>b</p></Panel></>);
    expect(screen.getByRole('region', { name: 'First' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Second' })).toBeTruthy();
  });
});

describe('connectionError', () => {
  it('says the sign-in expired when there is no token, in the signed-in person’s language', () => {
    render(<LanguageProvider language="fr"><p>fr</p></LanguageProvider>);
    expect(connectionError(null).message).toMatch(/session a expiré/);
    expect(connectionError('token').message).toMatch(/API/);
    render(<LanguageProvider language="en"><p>en</p></LanguageProvider>);
    expect(connectionError(undefined).message).toBe('Your sign-in has expired. Reload the page to sign in again.');
  });
});

describe('validateComment', () => {
  it('returns translation keys, not English sentences', () => {
    expect(validateComment('   ', 0)).toBe('td.err.empty');
    expect(validateComment('x'.repeat(2001), 0)).toBe('td.err.long');
    expect(validateComment('ok', 21)).toBe('td.err.mentions');
    expect(validateComment('ok', 1)).toBe('');
  });
});

describe('apiFetch', () => {
  it('turns a failed connection into a clear, translated network error that still counts as a TypeError', async () => {
    render(<LanguageProvider language="en"><p>en</p></LanguageProvider>);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const failure = await apiFetch('http://api.test/x').catch((reason: unknown) => reason);
    expect(failure).toBeInstanceOf(NetworkError);
    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toMatch(/can’t reach the server/);
    vi.unstubAllGlobals();
  });

  it('passes responses through untouched, including error statuses, and keeps cancellations as cancellations', async () => {
    const response = new Response('{}', { status: 409 });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));
    expect(await apiFetch('http://api.test/x')).toBe(response);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))));
    await expect(apiFetch('http://api.test/x')).rejects.toMatchObject({ name: 'AbortError' });
    vi.unstubAllGlobals();
  });
});
