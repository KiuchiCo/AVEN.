'use client';

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { isLanguage, setActiveLanguage, translate } from './core';
import type { Key } from './en';
export { languages, isLanguage, translate, pickLanguage, type LanguageCode } from './core';

const LanguageContext = createContext<string | null>(null);
export function LanguageProvider({ language, children }: { language: string | null | undefined; children: ReactNode }) {
  // Screen readers and the browser's spell checker use this.
  setActiveLanguage(language);
  useEffect(() => {
    document.documentElement.lang = isLanguage(language) ? language : 'en';
    // Remembered on this device so sign-in pages and Clerk's screens use it too (they render before the account is known).
    if (isLanguage(language)) document.cookie = `aven-lang=${language}; path=/; max-age=31536000; samesite=lax`;
  }, [language]);
  return <LanguageContext.Provider value={language ?? null}>{children}</LanguageContext.Provider>;
}

/** `const t = useT(); t('nav.home')` */
export function useT() {
  const language = useContext(LanguageContext);
  return useCallback((key: Key, values?: Record<string, string | number>) => translate(language, key, values), [language]);
}
