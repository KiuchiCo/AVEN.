import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * A ratchet against untranslated text: it finds English sentences written straight into screens (as text between tags, in placeholder/aria-label/title, and in error messages)
 * instead of coming from the translation dictionary. The count may only go down. When you translate some, lower BASELINE; a new screen with hardcoded text fails here.
 * It is a heuristic (it can miss text, and a few hits are proper nouns), so it supports the translation work and does not replace it.
 */
const BASELINE = 143;
const root = new URL('../app/', import.meta.url).pathname;
const skip = /i18n|error-reporting|global-error|auth-setup/;

function files(dir) { return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : []; }); }
export function hardcoded(source) {
  const found = [];
  for (const m of source.matchAll(/>([A-Z][A-Za-z’']+(?: [A-Za-z’',.]+){0,8}[.!?]?)<\//g)) if (!/^[A-Z][a-z]+$/.test(m[1]) || m[1].length > 3) found.push(m[1]);
  for (const m of source.matchAll(/(?:placeholder|aria-label|title)="([A-Z][A-Za-z’' ,.]{3,60})"/g)) found.push(m[1]);
  for (const m of source.matchAll(/(?:setError|setStatus|setNotice|throw new Error)\(\s*(?:reason instanceof Error \? reason.message : )?'([A-Z][^']{6,80})'/g)) found.push(m[1]);
  return found;
}

test('the amount of English text written straight into screens does not grow', () => {
  const byFile = files(root).filter((file) => !skip.test(file)).map((file) => [file, hardcoded(readFileSync(file, 'utf8')).length]).filter(([, n]) => n > 0);
  const total = byFile.reduce((sum, [, n]) => sum + n, 0);
  assert.ok(total <= BASELINE, `${total} hardcoded strings, up from ${BASELINE}. Worst files: ${byFile.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f.replace(root, '')} (${n})`).join(', ')}. Use useT() and add the text to every language.`);
});

test('the screens added for account data and database paging are fully translated', () => {
  for (const file of ['workspace/settings/my-data-card.tsx', 'workspace/database-pager.tsx']) assert.deepEqual(hardcoded(readFileSync(join(root, file), 'utf8')), [], file);
});

test('the detector finds what it is meant to find', () => {
  assert.deepEqual(hardcoded('<button title="Save changes">x</button><p>Could not load the page.</p>').sort(), ['Could not load the page.', 'Save changes']);
  assert.deepEqual(hardcoded('<p>{t(\'a.b\')}</p>'), []);
});
