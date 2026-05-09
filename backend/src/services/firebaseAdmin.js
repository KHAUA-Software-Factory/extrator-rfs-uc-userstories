import fs from 'node:fs';
import path from 'node:path';

import admin from 'firebase-admin';

function readServiceAccountFile(file, baseDir) {
  const target = path.isAbsolute(file) ? file : path.join(baseDir, file);
  const fileText = fs.readFileSync(target, 'utf-8');
  return JSON.parse(fileText);
}

export function initFirebaseAdminFromEnv({ env = process.env, baseDir = process.cwd() } = {}) {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const file = String(env.FIREBASE_SERVICE_ACCOUNT_FILE || '').trim();

  let serviceAccount;
  if (raw) {
    if (raw.startsWith('{')) {
      serviceAccount = JSON.parse(raw);
    } else {
      serviceAccount = readServiceAccountFile(raw, baseDir);
    }
  } else if (file) {
    serviceAccount = readServiceAccountFile(file, baseDir);
  } else {
    return null;
  }

  if (admin.apps.length) return admin;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}
