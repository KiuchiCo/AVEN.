export function validateComment(body: string, mentionCount: number) {
  const clean = body.trim();
  if (!clean) return 'Write a comment before posting.';
  if (clean.length > 2000) return 'Comments can be up to 2,000 characters.';
  if (mentionCount > 20) return 'Mention up to 20 workspace members at a time.';
  return '';
}
