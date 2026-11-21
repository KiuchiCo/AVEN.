/** The address to send the browser to after the API hands one back (a payment page, a calendar sign-in). Only web addresses are followed, never `javascript:` or `data:` ones. */
export function safeRedirectUrl(value: unknown, base: string): string {
  const target = typeof value === 'string' ? new URL(value, base) : null;
  if (!target || (target.protocol !== 'https:' && target.protocol !== 'http:')) throw new Error('The server returned an address that cannot be opened.');
  return target.href;
}
