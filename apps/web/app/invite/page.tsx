import { headers } from 'next/headers';
import { pickLanguage } from '../i18n/core';
import { InviteAcceptance } from './invite-acceptance';

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  // Someone opening an invitation may not have an AVEN account yet, so their browser's language is the best guide.
  const language = pickLanguage((await headers()).get('accept-language'));
  return <InviteAcceptance token={token} language={language} />;
}
