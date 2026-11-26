'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '../workspace/home-icons';

type Details = { email: string; role: string; workspaceName: string; expiresAt: string };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const roleNames: Record<string, string> = { ADMINISTRATOR: 'Administrator', MANAGER: 'Manager', MEMBER: 'Member', GUEST: 'Guest' };

export function InviteAcceptance({ token }: { token: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!token || !apiBase) { setError('This invitation link is incomplete.'); setLoading(false); return; }
      try {
        const response = await fetch(`${apiBase}/invitations/${encodeURIComponent(token)}`);
        const body = await response.json().catch(() => null) as Details | { message?: string } | null;
        if (!response.ok) throw new Error(body && 'message' in body ? body.message ?? 'This invitation is no longer available.' : 'This invitation is no longer available.');
        if (active) setDetails(body as Details);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not check the invitation.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [token]);

  async function accept() {
    const authToken = await getToken();
    if (!authToken || !apiBase) { setError('Sign in before accepting this invitation.'); return; }
    setAccepting(true); setError('');
    try {
      const setup = await fetch(`${apiBase}/session/bootstrap`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
      if (!setup.ok) throw new Error('Finish setting up your AVEN account before accepting this invitation.');
      const response = await fetch(`${apiBase}/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Could not accept this invitation.');
      setAccepted(true);
      router.replace('/workspace');
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not accept this invitation.'); }
    finally { setAccepting(false); }
  }

  const returnUrl = `/invite?token=${encodeURIComponent(token)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnUrl)}`;

  return <main className="invite-page"><div className="auth-brand"><Link className="auth-brand__wordmark" href="/">AVEN<span>.</span></Link><p>Your entire world, organised.</p></div>
    <section className="invite-card" aria-live="polite"><span className="invite-card__mark" aria-hidden="true"><Icon name="mail" size={20} /></span><p className="workspace-eyebrow">Workspace invitation</p>
      {loading || !isLoaded ? <><h1>Checking invitation</h1><p>One moment while AVEN checks this secure link.</p></> : error && !details ? <><h1>Invitation unavailable</h1><p>{error}</p><Link href="/">Return to AVEN →</Link></> : details ? <>
        <h1>{accepted ? 'You’re in.' : `Join ${details.workspaceName}`}</h1>
        <p>You’ve been invited as a <strong>{roleNames[details.role] ?? 'Member'}</strong>. This link was sent to <strong>{details.email}</strong> and expires {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(details.expiresAt))}.</p>
        {error && <p className="invite-error" role="alert">{error}</p>}
        {accepted ? <Link className="invite-primary" href="/workspace">Open workspace →</Link> : isSignedIn ? <button className="invite-primary" type="button" disabled={accepting} onClick={() => void accept()}>{accepting ? 'Accepting…' : 'Accept invitation →'}</button> : <div className="invite-auth-actions"><Link className="invite-primary" href={signInHref}>Sign in to accept</Link><Link className="invite-secondary" href={signUpHref}>Create an account</Link><small>Use the invited email address when you sign in or create your account.</small></div>}
      </> : null}
    </section><footer className="auth-footer">A calmer place for everything you’re working on.</footer>
  </main>;
}
