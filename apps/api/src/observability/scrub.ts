/**
 * Takes secrets and personal details out of text before it is logged or sent to an error tracker: bearer and basic credentials, API keys and webhook secrets,
 * JWTs, connection-string passwords, email addresses, and the secret part of share and invitation addresses.
 */
export function scrub(value: string, limit = 4000): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]')
    .replace(/\b(sk|pk|rk|whsec|re|ghp|gho|xox[a-z])[-_][A-Za-z0-9_-]{16,}/g, '[key]')
    .replace(/\b(sk-ant|sk)-[A-Za-z0-9_-]{16,}/g, '[key]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+):[^@\s]+@/gi, '$1:[redacted]@')
    .replace(/(["']?(?:password|passwd|secret|token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)(["'])?[^\s"',;}]{4,}\2?/gi, '$1[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(\/shared\/documents\/|\/invitations\/)[^/\s?#"']+/g, '$1:token')
    .slice(0, limit);
}

/** A page address with the query, the fragment and anything that looks like an id taken out, so a report says where without saying whose. */
export function scrubPath(value: string): string {
  let path = value;
  try { path = new URL(value, 'http://x').pathname; } catch { path = value.split(/[?#]/)[0]; }
  return scrub(path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, '/:token'), 300);
}
