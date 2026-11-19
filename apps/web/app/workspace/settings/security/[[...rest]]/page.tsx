'use client';

import { UserProfile } from '@clerk/nextjs';
import { avenAuthAppearance } from '../../../../auth-appearance';

/** Password, two-factor sign-in, active devices and connected accounts are handled by Clerk, which owns the sign-in. */
export default function SecurityPage() {
  return <section className="workspace-settings-page settings-security">
    <header><p className="workspace-page-eyebrow">SETTINGS</p><h1>Security</h1><p>Manage your password, two-step verification, the devices signed in to your account, and the accounts connected to it.</p></header>
    <UserProfile routing="path" path="/workspace/settings/security" appearance={{ ...avenAuthAppearance, elements: { rootBox: 'settings-clerk-root', cardBox: 'settings-clerk-card' } }} />
  </section>;
}
