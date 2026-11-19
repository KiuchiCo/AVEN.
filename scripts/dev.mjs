// Runs the web app and the API together, and stops both when you press Ctrl+C or either one exits.
import { spawn } from 'node:child_process';

const run = (name, script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' }).on('exit', (code) => {
  console.log(`[dev] ${name} stopped (${code ?? 'signal'})`);
  stop();
});
const children = [run('web', 'dev'), run('api', 'dev:api')];
let stopping = false;
function stop() {
  if (stopping) return; stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
