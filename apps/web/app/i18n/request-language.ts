import { cookies, headers } from 'next/headers';
import { isLanguage, pickLanguage, type LanguageCode } from './core';

/** The cookie the language provider keeps in step with the person's chosen language, so pages before sign-in (and Clerk) can follow it. */
export const LANGUAGE_COOKIE = 'aven-lang';

/** For server components: the person's chosen language if they have one on this device, otherwise their browser's. */
export async function requestLanguage(): Promise<LanguageCode> {
  const saved = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  return isLanguage(saved) ? saved : pickLanguage((await headers()).get('accept-language'));
}
