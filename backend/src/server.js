import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createApp } from './app.js';
import { initFirebaseAdminFromEnv } from './services/firebaseAdmin.js';
import { createOpenAIClientFromEnv } from './services/openaiClient.js';

function hasRuntimeFiles(dir) {
  return Boolean(dir) && (existsSync(path.join(dir, '.env')) || existsSync(path.join(dir, 'service-account.json')));
}

function resolveAppRoot() {
  if (process.env.APP_ROOT) return path.resolve(process.env.APP_ROOT);

  const startupFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const startupDir = startupFile ? path.dirname(startupFile) : '';
  if (hasRuntimeFiles(startupDir)) return startupDir;

  const cwd = process.cwd();
  if (hasRuntimeFiles(cwd)) return cwd;

  if (existsSync(path.join(cwd, 'backend', '.env'))) {
    return path.join(cwd, 'backend');
  }
  return cwd;
}

const appRoot = resolveAppRoot();

// Load backend/.env even when started from repo root.
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

const adminEmails = getAdminEmails();
const openai = createOpenAIClientFromEnv(process.env);

let adminApp = null;
try {
  // baseDir should be backend/ so relative FIREBASE_SERVICE_ACCOUNT_FILE works.
  adminApp = initFirebaseAdminFromEnv({ env: process.env, baseDir: appRoot });
} catch (error) {
  console.warn(`Firebase Admin not configured: ${error.message}`);
  adminApp = null;
}

const app = createApp({ openai, adminApp, adminEmails, env: process.env });
const port = process.env.PORT || 4000;
const configuredHost = String(process.env.HOST || '').trim();
const isPassengerRuntime = Boolean(
  process.env.PASSENGER_RUNTIME === '1' ||
    process.env.PASSENGER_APP_ENV ||
    process.env.PASSENGER_INSTANCE_REGISTRY_DIR ||
    process.env.PASSENGER_SPAWN_WORK_DIR,
);
const host = isPassengerRuntime ? '127.0.0.1' : configuredHost;

const server = host
  ? app.listen(port, host, () => {
      console.log(`Backend listening on ${host}:${port}`);
    })
  : app.listen(port, () => {
      console.log(`Backend listening on port ${port}`);
    });

server.on('error', (error) => {
  console.error(`Failed to start backend on ${host || '0.0.0.0'}:${port}`);
  console.error(error);
  process.exit(1);
});
