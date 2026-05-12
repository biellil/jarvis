/**
 * firstRunEnv.ts — Idempotent first-run copy of .env.example → userData/.env.
 *
 * Phase 71 (D-08): runs BEFORE runLlmConfigMigration and BEFORE process.loadEnvFile.
 * Without this, packaged app has no .env to read/migrate into.
 *
 * Security (T-71-01): on POSIX, sets 0o600 permission so API keys are owner-only.
 * Windows: skipped (NTFS ACLs from %APPDATA%\JARVIS\ are already user-scoped).
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveEnvPath } from './envPath.js';

/**
 * Ensures userData/.env exists in packaged builds.
 * Returns true if a copy occurred, false otherwise (dev mode, file already present, template missing).
 */
export function ensureUserEnvFile(): boolean {
  // Dev: no-op (workflow already places .env at monorepo root)
  if (!app.isPackaged) return false;

  const envPath = resolveEnvPath();

  // Idempotent guard — never overwrite existing user .env
  if (fs.existsSync(envPath)) return false;

  const template = path.join(process.resourcesPath, '.env.example');
  if (!fs.existsSync(template)) {
    console.warn(`[first-run] template not found at ${template} — skipping .env copy`);
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.copyFileSync(template, envPath);
    console.log(`[first-run] .env created at ${envPath} from template`);

    // T-71-01: POSIX-only chmod 0o600 (owner read/write, others denied)
    if (process.platform !== 'win32') {
      fs.chmodSync(envPath, 0o600);
      console.log(`[first-run] .env mode set to 0o600 (owner-only)`);
    }
    return true;
  } catch (err) {
    console.error(`[first-run] failed to copy .env from template:`, err);
    return false;
  }
}
