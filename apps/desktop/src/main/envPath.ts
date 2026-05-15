/**
 * envPath.ts — Single source of truth for .env file location.
 *
 * Phase 71 (D-07): resolves Phase 70 D-01 deferred problem.
 *
 * - Dev: monorepo root /.env (workflow places it there, gitignored, populated from .env.example)
 * - Packaged: app.getPath('userData')/.env (writable, OS user-scoped, survives uninstall=false)
 *
 * Consumers (single source of truth, no duplicate path logic):
 *   - apps/desktop/src/main/index.ts (boot: load + migrate)
 *   - apps/desktop/src/main/firstRunEnv.ts (first-run copy from .env.example)
 *   - apps/desktop/src/main/tray.ts ('Abrir .env' menu action)
 */
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveEnvPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '.env');
  }
  // Dev: dist/main/envPath.js → ../../../../.env = monorepo root
  return path.resolve(__dirname, '../../../../.env');
}
