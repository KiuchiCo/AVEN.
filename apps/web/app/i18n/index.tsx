'use client';

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { de } from './de';
import { en, type Dictionary, type Key } from './en';
import { es } from './es';
import { fr } from './fr';

export const languages = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' }, { code: 'de', name: 'Deutsch' }] as const;
export type LanguageCode = (typeof languages)[number]['code'];
const dictionaries: Record<LanguageCode, Dictionary> = { en, es, fr, de };

export const isLanguage = (value: unknown): value is LanguageCode => languages.some((language) => language.code === value);

/** Looks a phrase up in the person's language (English when missing) and fills in {placeholders}. */
export function translate(language: string | null | undefined, key: Key, values: Record<string, string | number> = {}): string {
  const dictionary = isLanguage(language) ? dictionaries[language] : en;
  return (dictionary[key] ?? en[key]).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

const LanguageContext = createContext<string | null>(null);
export function LanguageProvider({ language, children }: { language: string | null | undefined; children: ReactNode }) {
  // Screen readers and the browser's spell checker use this.
  useEffect(() => { document.documentElement.lang = isLanguage(language) ? language : 'en'; }, [language]);
  return <LanguageContext.Provider value={language ?? null}>{children}</LanguageContext.Provider>;
}

/** `const t = useT(); t('nav.home')` */
export function useT() {
  const language = useContext(LanguageContext);
  return useCallback((key: Key, values?: Record<string, string | number>) => translate(language, key, values), [language]);
}
