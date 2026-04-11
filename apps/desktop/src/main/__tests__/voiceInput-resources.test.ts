/**
 * Regression test for 22-GAP-01 — off-by-one in wake word model path resolver.
 *
 * Bug: `path.join(__dirname, '../../../resources/wakeword-models')` on
 * `apps/desktop/dist/main/index.js` resolved to `apps/resources/wakeword-models/`
 * instead of `apps/desktop/resources/wakeword-models/`.
 *
 * Fix: two `../` levels (not three) from `dist/main/`.
 *
 * These tests lock in the path math AND grep the source file directly so
 * a future regression to `../../../` would fail CI before ever hitting runtime.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

describe('voiceInput/resources — wake word path math', () => {
  it('dev path math: ../../resources from dist/main lands on apps/desktop/resources', () => {
    // Simulate __dirname = apps/desktop/dist/main/ at runtime
    const fakeDirname = path.join('/', 'repo', 'apps', 'desktop', 'dist', 'main');
    const resolved = path.resolve(fakeDirname, '../../resources/wakeword-models');
    // Must equal apps/desktop/resources/wakeword-models, NOT apps/resources/
    expect(resolved).toBe(path.join('/', 'repo', 'apps', 'desktop', 'resources', 'wakeword-models'));
  });

  it('off-by-one detection: ../../../resources from dist/main INCORRECTLY lands on apps/resources', () => {
    // This is the bug we fixed — document it so nobody regresses.
    const fakeDirname = path.join('/', 'repo', 'apps', 'desktop', 'dist', 'main');
    const wrong = path.resolve(fakeDirname, '../../../resources/wakeword-models');
    expect(wrong).toBe(path.join('/', 'repo', 'apps', 'resources', 'wakeword-models'));
    expect(wrong).not.toContain(path.join('apps', 'desktop', 'resources'));
  });

  it('source file uses ../../resources (not ../../../)', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const srcPath = path.join(here, '..', 'voiceInput', 'resources.ts');
    const source = await fs.readFile(srcPath, 'utf-8');

    // Must have '../../resources/wakeword-models' (correct path math)
    expect(source).toContain("'../../resources/wakeword-models'");
    // Must NOT have '../../../resources/wakeword-models' (off-by-one regression)
    expect(source).not.toContain("'../../../resources/wakeword-models'");
  });
});
