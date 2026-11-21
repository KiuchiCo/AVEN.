/** How often an open live stream is checked again for access (and kept alive). The environment value exists so tests need not wait. */
export const streamRecheckMs = Math.max(200, Number(process.env.STREAM_RECHECK_MS) || 25_000);

/**
 * Longest a live stream is kept open. A stream is authenticated once, when it opens, and sign-in tokens last about a minute, so without a limit a session that was
 * revoked or expired in Clerk could keep listening for as long as the connection stayed up. Clients reconnect on their own with a fresh token, which is checked again.
 */
export const streamMaxLifetimeMs = Math.max(500, Number(process.env.STREAM_MAX_MS) || 15 * 60_000);
