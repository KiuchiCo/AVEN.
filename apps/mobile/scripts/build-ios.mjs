// Builds the iOS app for the simulator (or, with SIGN=1 and a team, for a device) for one environment.
//   AVEN_APP_URL=https://app.example.com node scripts/build-ios.mjs staging|production
//   node scripts/build-ios.mjs development              (loads http://localhost:3000, which the Simulator reaches on this Mac)
// Development builds use the bundle id app.aven.mobile.dev so they install beside the production app.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const environment = process.argv[2] ?? 'development';
if (!['development', 'staging', 'production'].includes(environment)) { console.error('Usage: node scripts/build-ios.mjs development|staging|production'); process.exit(2); }
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, AVEN_ENV: environment };
const run = (command, args) => { const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status ?? 1); };

run('npx', ['cap', 'sync', 'ios']); // also checks the address for this environment
const sign = process.env.SIGN === '1';
const bundle = environment === 'production' ? 'app.aven.mobile' : `app.aven.mobile.${environment === 'staging' ? 'staging' : 'dev'}`;
run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', environment === 'production' ? 'Release' : 'Debug',
  '-destination', sign ? 'generic/platform=iOS' : 'generic/platform=iOS Simulator', '-derivedDataPath', `build/${environment}`,
  `PRODUCT_BUNDLE_IDENTIFIER=${bundle}`, ...(sign ? [`DEVELOPMENT_TEAM=${process.env.DEVELOPMENT_TEAM ?? ''}`] : ['CODE_SIGNING_ALLOWED=NO']), 'build']);
console.log(`Built ${environment} (${bundle}) in build/${environment}`);
