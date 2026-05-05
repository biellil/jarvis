/**
 * tray.ts cross-platform assertions — Phase 33 Wave 0 scaffold (33-01)
 *
 * Source-level assertions using readFileSync — same pattern as tray.test.ts.
 * Tests that tray.ts has the correct icon path, Tray construction, menu items,
 * and exports required for cross-platform support (PLAT-03, PLAT-06).
 *
 * All tests in this file should be GREEN immediately — tray.ts already has
 * the required patterns.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const traySource = fs.readFileSync(
  path.join(__dirname, '../tray.ts'),
  'utf-8'
);

describe('tray.ts cross-platform assertions (Phase 33, PLAT-03, PLAT-06)', () => {
  describe('Tray icon path (PLAT-03, PLAT-06)', () => {
    it('uses PNG icon from resources/tray directory', () => {
      expect(traySource).toContain('resources/tray');
    });

    it('icon filename ends in .png with size suffix', () => {
      expect(traySource).toMatch(/icon-\d+x\d+\.png/);
    });

    it('creates Tray with nativeImage or path string', () => {
      expect(traySource).toMatch(/new Tray\(/);
    });
  });

  describe('Tray menu items (PLAT-03, PLAT-06)', () => {
    // TODO Phase 34: Settings menu item will be added here
    // it('contains Settings menu item', () => { ... });

    it('contains Quit menu item', () => {
      expect(traySource).toContain("label: 'Quit'");
    });

    it('Quit handler calls app.quit()', () => {
      expect(traySource).toMatch(/label: 'Quit'[\s\S]*?app\.quit\(\)/);
    });
  });

  describe('Tray module exports (PLAT-03, PLAT-06)', () => {
    it('exports createTray function', () => {
      expect(traySource).toContain('export function createTray(');
    });

    it('exports destroyTray function', () => {
      expect(traySource).toContain('export function destroyTray(');
    });
  });
});

describe('Phase 51 (MCOS-01): macOS template image selection', () => {
  it('D-04: tray.ts referencia iconTemplate.png para macOS', () => {
    expect(traySource).toContain('iconTemplate.png');
  });

  it('D-04: tray.ts continua referenciando icon-16x16.png (Windows/Linux fallback)', () => {
    expect(traySource).toContain('icon-16x16.png');
  });

  it('D-04: selecao usa process.platform === darwin', () => {
    expect(traySource).toContain("process.platform === 'darwin'");
  });

  it('D-04: selecao condicional ocorre dentro de createTray (entre assinatura e new Tray())', () => {
    const createTrayIdx = traySource.indexOf('export function createTray');
    const newTrayIdx = traySource.indexOf('new Tray(', createTrayIdx);
    expect(createTrayIdx).toBeGreaterThan(-1);
    expect(newTrayIdx).toBeGreaterThan(createTrayIdx);
    const block = traySource.slice(createTrayIdx, newTrayIdx);
    expect(block).toContain('iconTemplate.png');
    expect(block).toContain('icon-16x16.png');
  });

  it('D-04: forma da decisao e ternario ou if com darwin no bloco de selecao', () => {
    const createTrayIdx = traySource.indexOf('export function createTray');
    const newTrayIdx = traySource.indexOf('new Tray(', createTrayIdx);
    const block = traySource.slice(createTrayIdx, newTrayIdx);
    // Aceita: ternary `=== 'darwin' ?` OU if `=== 'darwin')`
    expect(block).toMatch(/=== 'darwin'\s*[?)]/);
  });
});
