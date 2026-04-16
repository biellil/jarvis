/**
 * index.ts platform support tests — Phase 33 Wave 0 scaffold (33-01)
 *
 * Source-level assertions using readFileSync — same pattern as tray.test.ts.
 * This avoids Electron module loading complexity and verifies the source
 * contains the correct platform branches.
 *
 * TDD status:
 *   - Tests for app.dock.hide() and darwin platform check are RED until
 *     Wave 1 adds those branches to index.ts.
 *   - Tests for window-all-closed, non-darwin quit, and activate handler
 *     are GREEN (already present in index.ts).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const indexSource = fs.readFileSync(
  path.join(__dirname, '../index.ts'),
  'utf-8'
);

describe('index.ts platform support (Phase 33)', () => {
  describe("macOS: Dock hiding (PLAT-01, D-01)", () => {
    it('contains darwin platform check for dock.hide()', () => {
      expect(indexSource).toContain("process.platform === 'darwin'");
    });

    it('calls app.dock.hide() on darwin', () => {
      expect(indexSource).toContain('app.dock.hide()');
    });
  });

  describe('Cross-platform: window lifecycle (PLAT-01, PLAT-04)', () => {
    it('contains window-all-closed handler', () => {
      expect(indexSource).toContain("app.on('window-all-closed'");
    });

    it('quits on non-darwin platforms', () => {
      expect(indexSource).toMatch(
        /window-all-closed[\s\S]*?platform !== 'darwin'[\s\S]*?app\.quit\(\)/
      );
    });

    it('contains activate handler for macOS Dock click', () => {
      expect(indexSource).toContain("app.on('activate'");
    });
  });
});
