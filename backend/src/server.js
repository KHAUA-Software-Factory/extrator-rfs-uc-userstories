import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { initFirebaseAdminFromEnv } from './services/firebaseAdmin.js';
import { createOpenAIClientFromEnv } from './services/openaiClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env even when started from repo root.
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

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
  adminApp = initFirebaseAdminFromEnv({ env: process.env, baseDir: path.join(__dirname, '..') });
} catch (error) {
  console.warn(`Firebase Admin not configured: ${error.message}`);
  adminApp = null;
}

const app = createApp({ openai, adminApp, adminEmails, env: process.env });
const port = process.env.PORT || 4000;
const host = String(process.env.HOST || '').trim();

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
