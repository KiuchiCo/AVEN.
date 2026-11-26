import { de } from './de.ts';
import { en, type Dictionary, type Key } from './en.ts';
import { es } from './es.ts';
import { fr } from './fr.ts';

/* Plain module (no 'use client'), so server pages such as shared documents and invitations can translate too. */
export const languages = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Français' }, { code: 'de', name: 'Deutsch' }] as const;
export type LanguageCode = (typeof languages)[number]['code'];
const dictionaries: Record<LanguageCode, Dictionary> = { en, es, fr, de };

export const isLanguage = (value: unknown): value is LanguageCode => languages.some((language) => language.code === value);

/** Looks a phrase up in the person's language (English when missing) and fills in {placeholders}. */
export function translate(language: string | null | undefined, key: Key, values: Record<string, string | number> = {}): string {
  const dictionary = isLanguage(language) ? dictionaries[language] : en;
  return (dictionary[key] ?? en[key]).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}


/** The first supported language in an Accept-Language header ("de-CH,de;q=0.9,en;q=0.8" → "de"), else English. */
export function pickLanguage(header: string | null | undefined): LanguageCode {
  const ranked = (header ?? '').split(',').map((part) => { const [tag, ...params] = part.trim().split(';'); const q = params.find((p) => p.trim().startsWith('q=')); return { code: tag.trim().slice(0, 2).toLowerCase(), q: q ? Number(q.trim().slice(2)) || 0 : 1 }; }).filter((entry) => entry.code && entry.q > 0).sort((a, b) => b.q - a.q);
  return ranked.find((entry) => isLanguage(entry.code))?.code as LanguageCode | undefined ?? 'en';
}

let active: LanguageCode = 'en';
/** The signed-in person's language, for messages built outside React (API helpers). Set by LanguageProvider. */
export const setActiveLanguage = (language: string | null | undefined) => { active = isLanguage(language) ? language : 'en'; };
export const activeLanguage = () => active;
