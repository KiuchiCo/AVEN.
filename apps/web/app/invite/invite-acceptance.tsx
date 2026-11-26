'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '../workspace/home-icons';
import { LanguageProvider, useT } from '../i18n';
import type { Key } from '../i18n/en';

type Details = { email: string; role: string; workspaceName: string; expiresAt: string };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function InviteAcceptance({ token, language }: { token: string; language: string }) {
  return <LanguageProvider language={language}><Invitation token={token} /></LanguageProvider>;
}

function Invitation({ token }: { token: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const t = useT();
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!token || !apiBase) { setError(t('inv.incomplete')); setLoading(false); return; }
      try {
        const response = await fetch(`${apiBase}/invitations/${encodeURIComponent(token)}`);
        const body = await response.json().catch(() => null) as Details | { message?: string } | null;
        if (response.status === 404) throw new Error(t('inv.invalid'));
        if (!response.ok) throw new Error(body && 'message' in body ? body.message ?? t('inv.gone') : t('inv.gone'));
        if (active) setDetails(body as Details);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : t('inv.checkFailed')); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [token, t]);

  async function accept() {
    const authToken = await getToken();
    if (!authToken || !apiBase) { setError(t('inv.signInFirst')); return; }
    setAccepting(true); setError('');
    try {
      const setup = await fetch(`${apiBase}/session/bootstrap`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
      if (!setup.ok) throw new Error(t('inv.finishSetup'));
      const response = await fetch(`${apiBase}/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? t('inv.acceptFailed'));
      setAccepted(true);
      router.replace('/workspace');
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('inv.acceptFailed')); }
    finally { setAccepting(false); }
  }

  const returnUrl = `/invite?token=${encodeURIComponent(token)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnUrl)}`;

  return <main className="invite-page"><div className="auth-brand"><Link className="auth-brand__wordmark" href="/">AVEN<span>.</span></Link><p>{t('shell.tagline')}</p></div>
    <section className="invite-card" aria-live="polite"><span className="invite-card__mark" aria-hidden="true"><Icon name="mail" size={20} /></span><p className="workspace-eyebrow">{t('inv.eyebrow')}</p>
      {loading || !isLoaded ? <><h1>{t('inv.checking')}</h1><p>{t('inv.checkingText')}</p></> : error && !details ? <><h1>{t('inv.unavailable')}</h1><p>{error}</p><Link href="/">{t('inv.return')} →</Link></> : details ? <>
        <h1>{accepted ? t('inv.youreIn') : t('inv.join', { workspace: details.workspaceName })}</h1>
        <p>{t('inv.invitedAs', { role: t(`inv.role.${['ADMINISTRATOR', 'MANAGER', 'GUEST'].includes(details.role) ? details.role : 'MEMBER'}` as Key), email: details.email, date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(details.expiresAt)) })}</p>
        {error && <p className="invite-error" role="alert">{error}</p>}
        {accepted ? <Link className="invite-primary" href="/workspace">{t('inv.open')} →</Link> : isSignedIn ? <button className="invite-primary" type="button" disabled={accepting} onClick={() => void accept()}>{accepting ? t('inv.accepting') : `${t('inv.accept')} →`}</button> : <div className="invite-auth-actions"><Link className="invite-primary" href={signInHref}>{t('inv.signIn')}</Link><Link className="invite-secondary" href={signUpHref}>{t('inv.create')}</Link><small>{t('inv.useEmail')}</small></div>}
      </> : null}
    </section><footer className="auth-footer">{t('inv.footer')}</footer>
  </main>;
}
