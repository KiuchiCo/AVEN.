/** Returns the translation key of the first problem, or '' when the comment can be posted. */
export function validateComment(body: string, mentionCount: number): '' | 'td.err.empty' | 'td.err.long' | 'td.err.mentions' {
  const clean = body.trim();
  if (!clean) return 'td.err.empty';
  if (clean.length > 2000) return 'td.err.long';
  if (mentionCount > 20) return 'td.err.mentions';
  return '';
}
