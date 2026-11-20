// Prints a new VAPID key pair for browser push. Run `npm run build` first.
import { generateVapidKeys } from '../dist/push/push-crypto.js';
const keys = generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:you@example.com`);
