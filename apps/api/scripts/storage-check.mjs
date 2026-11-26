// Proves the configured file storage works: writes, reads back and deletes one small uniquely named object. Never touches other objects.
// Usage: npm run storage:check --workspace @aven/api   (reads STORAGE_DRIVER and S3_* from the environment / .env)
import { S3StorageDriver } from '../dist/files/s3-storage.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const env = readApiEnvironment();
if (env.storageDriver !== 's3' || !env.s3) { console.log('Storage is the local disk (STORAGE_DRIVER is not s3). Nothing to check against Cloudflare R2.'); process.exit(0); }
try { await new S3StorageDriver(env.s3).check(); console.log(`Object storage works: wrote, read back and removed a test object in bucket “${env.s3.bucket}”.`); }
catch (error) { console.error(`Object storage check failed: ${error instanceof Error ? error.message : error}`); process.exit(1); }
