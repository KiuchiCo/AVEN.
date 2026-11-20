import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from '../app/i18n/en.ts';
import { es } from '../app/i18n/es.ts';
import { fr } from '../app/i18n/fr.ts';
import { de } from '../app/i18n/de.ts';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every language has exactly the English keys, no empty text, and the same placeholders', () => {
  for (const [name, dictionary] of Object.entries({ es, fr, de })) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(en).sort(), `${name} keys`);
    for (const [key, text] of Object.entries(dictionary)) {
      assert.ok(text.trim().length > 0, `${name}.${key} is empty`);
      assert.equal(placeholders(text), placeholders(en[key]), `${name}.${key} placeholders`);
    }
  }
});

test('translations are real translations: most phrases differ from English', () => {
  for (const [name, dictionary] of Object.entries({ es, fr, de })) {
    const same = Object.keys(en).filter((key) => dictionary[key] === en[key]);
    assert.ok(same.length < Object.keys(en).length * 0.15, `${name} leaves ${same.length} phrases in English: ${same.join(', ')}`);
  }
});
