export type Participant = { id: string; displayName: string };
export type ConversationLike = { kind: 'CHANNEL' | 'DIRECT' | 'GROUP'; name: string | null; participants: Participant[] };

/** "# general", "Ben", or "Ben, Cal and Dee" (never including yourself). */
export function conversationLabel(conversation: ConversationLike, selfId: string): string {
  if (conversation.kind === 'CHANNEL') return `# ${conversation.name ?? ''}`;
  const others = conversation.participants.filter((person) => person.id !== selfId).map((person) => person.displayName);
  if (!others.length) return 'Just you';
  if (others.length === 1) return others[0];
  if (others.length === 2) return `${others[0]} and ${others[1]}`;
  return `${others[0]}, ${others[1]} and ${others.length - 2} other${others.length - 2 === 1 ? '' : 's'}`;
}
