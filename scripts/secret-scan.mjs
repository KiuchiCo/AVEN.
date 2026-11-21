// Secret scan with no dependencies: known key formats plus high-entropy strings, over every line ever added to Git (`history`) or the uncommitted changes (`working`).
// Prints only the file, the rule and a masked hint, never a value. Exits 1 on any finding that is not allowed in scripts/secret-scan-allow.json.
// Run: node scripts/secret-scan.mjs history   (needs the full Git history: `git fetch --unshallow` on a shallow clone)
import { readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const entropy = (s) => { const f = {}; for (const c of s) f[c] = (f[c] ?? 0) + 1; return -Object.values(f).reduce((n, c) => n + (c / s.length) * Math.log2(c / s.length), 0); };
const rules = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ['aws-key', /\bAKIA[0-9A-Z]{16}\b/], ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/], ['slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['stripe-live', /\b[sr]k_live_[A-Za-z0-9]{10,}\b/], ['stripe-test', /\bsk_test_[A-Za-z0-9]{16,}\b/], ['clerk-secret', /\bsk_(test|live)_[A-Za-z0-9]{30,}\b/], ['webhook-secret', /\bwhsec_[A-Za-z0-9]{16,}\b/],
  ['anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/], ['openai', /\bsk-[A-Za-z0-9]{32,}\b/], ['google', /\bAIza[0-9A-Za-z_-]{35}\b/], ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['url-password', /\b[a-z][a-z0-9+.-]*:\/\/[^:\/\s@]+:([^@\s]{8,})@/i], ['assigned-secret', /\b(?:secret|token|password|api[_-]?key|private[_-]?key)\w*\s*[:=]\s*['"]([A-Za-z0-9+/_=-]{20,})['"]/i],
];
const skipFile = /(^|\/)(package-lock\.json|node_modules\/|generated\/|\.next|dist\/|.*\.(png|jpg|ico|pdf|woff2?|svg|lock)$)/;
const found = new Map(); let file = ''; let commit = ''; let lines = 0;
const add = (rule, hint) => { const key = `${rule}|${file}`; const entry = found.get(key) ?? { rule, file, commits: new Set(), hints: new Set() }; entry.commits.add(commit.slice(0, 7)); entry.hints.add(hint); found.set(key, entry); };
const mask = (v) => `${v.slice(0, 3)}…(${v.length} chars)`;
function check(line) {
  lines += 1;
  for (const [name, re] of rules) { const m = re.exec(line); if (m) add(name, mask(m[1] ?? m[0])); }
  for (const token of line.match(/[A-Za-z0-9+\/_=-]{28,}/g) ?? []) {
    if (/^[0-9a-f]+$/i.test(token) && [32, 40, 64].includes(token.length)) continue; if (/^[A-Za-z]+$/.test(token) || /^[a-z0-9-]+$/.test(token) || /\//.test(token) && /^[\w/-]+$/.test(token) && !/[0-9]/.test(token)) continue;
    if (entropy(token) >= 4.4 && /[A-Z]/.test(token) && /[a-z]/.test(token) && /[0-9]/.test(token)) add('high-entropy', mask(token));
  }
}
const mode = process.argv[2];
if (mode !== 'history' && mode !== 'working') { console.error('Usage: node scripts/secret-scan.mjs history|working'); process.exit(2); }
const allowed = JSON.parse(readFileSync(new URL('./secret-scan-allow.json', import.meta.url), 'utf8')).allow;
const child = mode === 'history' ? spawn('git', ['log', '--all', '-p', '-U0', '--no-color', '--format=@@@%H']) : spawn('git', ['diff', '-U0', '--no-color', 'HEAD']);
createInterface({ input: child.stdout }).on('line', (line) => {
  if (line.startsWith('@@@')) { commit = line.slice(3); return; }
  if (line.startsWith('+++ b/')) { file = line.slice(6); return; }
  if (line.startsWith('+++') || !line.startsWith('+') || skipFile.test(file)) return;
  check(line.slice(1));
}).on('close', () => {
  if (mode === 'working') for (const name of execFileSync('git', ['ls-files', '-o', '--exclude-standard']).toString().split('\n').filter(Boolean)) { // new files are not in the diff
    file = name; commit = 'untracked'; if (skipFile.test(file)) continue;
    try { for (const line of readFileSync(name, 'utf8').split('\n')) check(line); } catch { /* unreadable or binary: skipped */ }
  }
  const isAllowed = (e) => allowed.some((a) => a.file === e.file && a.rules.includes(e.rule));
  const findings = [...found.values()].filter((e) => !isAllowed(e)).sort((a, b) => a.file.localeCompare(b.file));
  console.log(`${mode}: scanned ${lines} added lines; ${found.size - findings.length} known false positives skipped`);
  for (const e of findings) console.log(`${e.rule.padEnd(15)} ${e.file}  commits:${e.commits.size}  e.g. ${[...e.hints][0]}`);
  console.log(findings.length ? `${findings.length} possible secret(s): check each, rotate anything real, and only then allow-list false positives` : 'no findings');
  process.exitCode = findings.length ? 1 : 0;
});
