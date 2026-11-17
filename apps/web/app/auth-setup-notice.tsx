export function AuthSetupNotice() {
  return (
    <section className="auth-setup" role="status">
      <p className="auth-setup__eyebrow">AVEN · ACCOUNT SETUP</p>
      <h1>Connect your sign-in</h1>
      <p>Add your Clerk development keys to the root <code>.env</code> file, then restart the web and API apps.</p>
      <a href="https://dashboard.clerk.com/" target="_blank" rel="noreferrer">
        Open Clerk Dashboard <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
