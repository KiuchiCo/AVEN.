import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from '../app/workspace/ui';
import { LanguageProvider } from '../app/i18n';
import { connectionError } from '../app/workspace/connection-error';
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
