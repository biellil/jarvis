import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../preflight-dist.mjs');
const ROOT = path.resolve(__dirname, '../..');

function runPreflight(args, envOverride = {}) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...envOverride },
  });
}

describe('preflight-dist', () => {
  it('exits 1 with helpful message when target is invalid', () => {
    const r = runPreflight(['windows']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/target must be one of/);
  });

  it('exits 1 when target=mac and host is not darwin', () => {
    if (process.platform === 'darwin') return; // skip on darwin
    const r = runPreflight(['mac']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/macOS DMG.*macOS/i);
  });

  it('exits 1 when target=win on Linux without wine in PATH', () => {
    if (process.platform === 'win32') return;
    // Build a PATH that includes node (so spawn works) but excludes wine.
    // Use the directory of the current node binary as the base, plus /usr/bin and /bin.
    const nodeBinDir = path.dirname(process.execPath);
    const pathWithoutWine = `${nodeBinDir}:/usr/bin:/bin`;
    const r = runPreflight(['win'], { PATH: pathWithoutWine });
    // Should fail at wine check (models may be present or not, but wine gate comes after).
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/wine|whisper|ggml/i);
  });

  it('treats target=auto as host platform', () => {
    // Just verify the script runs without target-validation error when given 'auto'.
    // Other checks may fail (wine, models), so check stdout shows auto-detection.
    const r = runPreflight(['auto']);
    expect(r.stdout).toMatch(/auto-detected target=/);
  });

  it('exits 1 when .env.example contains a real-looking OpenAI secret', () => {
    // Move the real .env.example aside, create a malicious one, run, restore.
    const realEnv = path.join(ROOT, '.env.example');
    const backup = `${realEnv}.bak-test-${Date.now()}`;
    fs.copyFileSync(realEnv, backup);
    try {
      const malicious = fs.readFileSync(realEnv, 'utf8') + '\nOPENAI_API_KEY=sk-AAAAAAAAAAAAAAAAAAAAAAAAAA\n';
      fs.writeFileSync(realEnv, malicious);
      const r = runPreflight(['linux']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/secret|placeholder|sk-/i);
    } finally {
      fs.copyFileSync(backup, realEnv);
      fs.unlinkSync(backup);
    }
  });

  it('exits 0 for target=linux on Linux when env is clean and models present', () => {
    if (process.platform !== 'linux') return; // skip on non-linux
    // Pre-condition: .env.example clean (real repo state) + ggml-base.bin already present.
    // ggml-medium.bin may be missing — preflight will try to download it. To keep this
    // test fast and not hammer HuggingFace, only run when ggml-medium.bin exists.
    const mediumPath = path.join(ROOT, 'apps/desktop/resources/models/whisper/ggml-medium.bin');
    if (!fs.existsSync(mediumPath)) {
      console.log('[test] skipping: ggml-medium.bin not present (would trigger 1.5GB download)');
      return;
    }
    const r = runPreflight(['linux']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('preflight OK');
  });

  it('exits 1 with no args (missing target)', () => {
    const r = runPreflight([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/target must be one of/);
  });
});
