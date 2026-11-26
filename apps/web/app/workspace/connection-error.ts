import { activeLanguage, translate } from '../i18n/core';

/**
 * The error for a request that could not be signed. No token almost always means the sign-in expired (a reload signs
 * the person in again); a token with no API address means the app itself is not configured.
 */
export function connectionError(token: string | null | undefined): Error {
  return new Error(translate(activeLanguage(), token ? 'err.noApi' : 'err.signedOut'));
}
