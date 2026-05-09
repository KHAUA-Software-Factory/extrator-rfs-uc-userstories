import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureProductionDependencies() {
  const shouldInstall =
    process.env.NODE_ENV === 'production' && process.env.AUTO_INSTALL_DEPS !== 'false';
  const hasDependencies = existsSync(path.join(__dirname, 'node_modules', 'express', 'package.json'));

  if (!shouldInstall || hasDependencies) return;

  console.log('Production dependencies not found. Running npm install --omit=dev...');
  const result = spawnSync('npm', ['install', '--omit=dev'], {
    cwd: __dirname,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to install production dependencies. npm exited with ${result.status}`);
  }
}

ensureProductionDependencies();

await import('./src/server.js');
