import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickLanguage, translate } from '../app/i18n/core.ts';

test('shared and invitation pages follow the reader’s browser language, falling back to English', () => {
  assert.equal(pickLanguage('de-CH,de;q=0.9,en;q=0.8'), 'de');
  assert.equal(pickLanguage('ja,fr;q=0.7,en;q=0.5'), 'fr', 'an unsupported first choice falls through to the next supported one');
  assert.equal(pickLanguage('en;q=0.4,es;q=0.9'), 'es', 'quality values decide the order');
  assert.equal(pickLanguage('fr;q=0'), 'en', 'q=0 means not acceptable');
  assert.equal(pickLanguage(''), 'en');
  assert.equal(pickLanguage(null), 'en');
  assert.equal(translate(pickLanguage('es-ES'), 'sh.done'), 'Hecho');
});
