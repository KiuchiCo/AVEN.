'use strict';
// Bakes the server address into the app before packaging: AVEN_APP_URL=https://aven.example.com npm run package
const fs = require('node:fs');
const path = require('node:path');
const { parseServerUrl } = require('../src/rules.cjs');
const file = path.join(__dirname, '..', 'config', 'app.json');
const wanted = process.env.AVEN_APP_URL;
if (wanted) {
  const origin = parseServerUrl(wanted);
  if (!origin) { console.error('AVEN_APP_URL must be an https address (http only for localhost).'); process.exit(1); }
  fs.writeFileSync(file, `${JSON.stringify({ appUrl: origin })}\n`);
  console.log(`Packaging for ${origin}`);
} else console.log('AVEN_APP_URL is not set: the app will ask for the server address on first run.');
