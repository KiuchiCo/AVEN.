import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessibilityProblems } from './axe';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: async () => 'test-token' }), useClerk: () => ({ signOut }) }));
vi.mock('../app/workspace/workspace-shell', () => ({ useWorkspaceSession: () => ({ user: { id: 'u1', displayName: 'Sam', email: 'Sam@Example.com' }, workspace: { id: 'w1', name: 'Home', role: 'OWNER' } }) }));

import { MyDataCard } from '../app/workspace/settings/my-data-card';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  signOut.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe('your data: export', () => {
  it('explains what is included and is accessible', async () => {
    const { container } = render(<MyDataCard />);
    expect(screen.getByRole('heading', { name: 'Your data' })).toBeTruthy();
    expect(screen.getByText(/Not included/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download my data' }).getAttribute('aria-describedby')).toBe('acct-data-includes');
    expect(await accessibilityProblems(container)).toEqual([]);
  });

  it('asks the API with the sign-in token, shows progress while it works, then the size that was downloaded', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })); vi.stubGlobal('fetch', fetchMock);
    render(<MyDataCard />);
    await user.click(screen.getByRole('button', { name: 'Download my data' }));
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: 'Bearer test-token' });
    const busy = screen.getByRole('button', { name: 'Preparing your data…' }); expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Preparing');
    release(new Response('x'.repeat(4096)));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/downloaded \(4 KB\)/));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Download my data' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('tells the person when it fails, as an alert, and lets them try again', async () => {
    const user = userEvent.setup(); vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'nope' }, 500)));
    render(<MyDataCard />);
    await user.click(screen.getByRole('button', { name: 'Download my data' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not prepare your data');
    expect((screen.getByRole('button', { name: 'Download my data' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('your data: deleting the account', () => {
  async function openDialog() {
    const user = userEvent.setup(); render(<MyDataCard />);
    await user.click(screen.getByRole('button', { name: 'Delete my account…' }));
    return { user, dialog: screen.getByRole('dialog', { name: 'Delete my account' }) };
  }

  it('lists the consequences, asks for the email, and is accessible and keyboard-closable', async () => {
    const { user, dialog } = await openDialog();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(6);
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/Type your email address \(Sam@Example.com\)/)).toBeTruthy();
    expect(await accessibilityProblems(dialog)).toEqual([]);
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the delete button disabled until the typed email matches (ignoring case), and flags a mismatch', async () => {
    const { user, dialog } = await openDialog();
    const input = within(dialog).getByLabelText(/Type your email/); const submit = within(dialog).getByRole('button', { name: 'Delete my account permanently' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(input, 'sam@exam'); expect(submit.disabled).toBe(true); expect(input.getAttribute('aria-invalid')).toBe('true');
    await user.type(input, 'ple.com'); expect(submit.disabled).toBe(false); expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('sends the confirmation to the API, then signs out and says so', async () => {
    const fetchMock = vi.fn(async () => json({ deleted: true, signInDeleted: false, workspacesDeleted: 1 })); vi.stubGlobal('fetch', fetchMock);
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/Type your email/), 'sam@example.com');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Also delete my sign-in account' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account permanently' }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/session\/delete-account$/); expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ confirmEmail: 'sam@example.com', alsoDeleteSignIn: true });
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' }));
    expect(screen.getByText(/Your account was deleted/)).toBeTruthy();
  });

  it('shows the API’s refusal (a workspace with other members) as an alert, keeps the account, and can be retried or cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Hand over or delete these workspaces first: “Studio”.' }, 409)));
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/Type your email/), 'sam@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account permanently' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('“Studio”');
    expect(signOut).not.toHaveBeenCalled();
    expect((within(dialog).getByRole('button', { name: 'Delete my account permanently' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' })); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cannot be dismissed while the deletion is running', async () => {
    let release: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/Type your email/), 'sam@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account permanently' }));
    expect((within(dialog).getByRole('button', { name: 'Deleting…' }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBeTruthy();
    release(json({ deleted: true }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
