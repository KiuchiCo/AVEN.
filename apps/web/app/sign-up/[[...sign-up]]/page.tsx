import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense } from 'react';
import { avenAuthAppearance } from '../../auth-appearance';
import { AuthSetupNotice } from '../../auth-setup-notice';

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthLayout><AuthSetupNotice /></AuthLayout>;
  }

  return (
    <AuthLayout>
      <Suspense fallback={<div className="auth-loading">Preparing secure account creation…</div>}>
        <SignUp appearance={avenAuthAppearance} />
      </Suspense>
    </AuthLayout>
  );
}

function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page">
      <div className="auth-page__landscape" aria-hidden="true" />
      <header className="auth-brand">
        <Link className="auth-brand__wordmark" href="/" aria-label="AVEN home">AVEN<span>.</span></Link>
        <p>Your entire world, organised.</p>
      </header>
      <section className="auth-card-wrap">{children}</section>
      <footer className="auth-footer">A calmer place for everything you’re working on.</footer>
    </main>
  );
}
