import { InviteAcceptance } from './invite-acceptance';

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return <InviteAcceptance token={token} />;
}
