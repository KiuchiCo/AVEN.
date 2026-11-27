import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense } from 'react';
import { avenAuthAppearance } from '../../auth-appearance';
import { AuthSetupNotice } from '../../auth-setup-notice';
import { translate } from '../../i18n/core';
import { requestLanguage } from '../../i18n/request-language';

export default async function SignUpPage() {
  const language = await requestLanguage();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthLayout t={t}><AuthSetupNotice /></AuthLayout>;
  }

  return (
    <AuthLayout t={t}>
      <Suspense fallback={<div className="auth-loading">{t('auth.preparingSignUp')}</div>}>
        <SignUp appearance={avenAuthAppearance} />
      </Suspense>
    </AuthLayout>
  );
}

function AuthLayout({ children, t }: Readonly<{ children: React.ReactNode; t: (key: Parameters<typeof translate>[1]) => string }>) {
  return (
    <main className="auth-page">
      <div className="auth-page__landscape" aria-hidden="true" />
      <header className="auth-brand">
        <Link className="auth-brand__wordmark" href="/" aria-label={t('auth.home')}>AVEN<span>.</span></Link>
        <p>{t('auth.tagline')}</p>
      </header>
      <section className="auth-card-wrap">{children}</section>
      <footer className="auth-footer">{t('auth.footer')}</footer>
    </main>
  );
}
