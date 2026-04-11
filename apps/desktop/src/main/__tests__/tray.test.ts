/**
 * Tray Module tests — Phase 23 Plan 02 (D-03)
 *
 * Reescritos para cobrir o item "Pause listening"/"Resume listening" no
 * TOPO do menu (D-03). Remove a expectativa obsoleta de "3 menu items"
 * (deferred desde v1.2; o menu real tem ~10 itens desde Phase 13).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const traySource = fs.readFileSync(
  path.join(__dirname, '../tray.ts'),
  'utf-8'
);

describe('Tray Module (source-level assertions)', () => {
  describe('WAKE-03 / D-03: Pause/Resume listening item', () => {
    it('imports getWakeWordPaused + setWakeWordPaused from store', () => {
      expect(traySource).toMatch(/getWakeWordPaused/);
      expect(traySource).toMatch(/setWakeWordPaused/);
    });

    it('no longer imports getWakeWordEnabled/setWakeWordEnabled', () => {
      expect(traySource).not.toContain('getWakeWordEnabled');
      expect(traySource).not.toContain('setWakeWordEnabled');
    });

    it('imports broadcastPauseToggle from ipc/settings', () => {
      expect(traySource).toMatch(/broadcastPauseToggle/);
    });

    it("contains 'Pause listening' label", () => {
      expect(traySource).toContain('Pause listening');
    });

    it("contains 'Resume listening' label", () => {
      expect(traySource).toContain('Resume listening');
    });

    it('Pause/Resume label is the FIRST menu entry (appears before Show)', () => {
      const pauseIdx = traySource.indexOf('Pause listening');
      const showIdx = traySource.indexOf("label: 'Show'");
      expect(pauseIdx).toBeGreaterThan(-1);
      expect(showIdx).toBeGreaterThan(-1);
      expect(pauseIdx).toBeLessThan(showIdx);
    });

    it('click handler calls setWakeWordPaused with !current', () => {
      expect(traySource).toMatch(/setWakeWordPaused\(\s*!\s*paused\s*\)|setWakeWordPaused\(\s*next\s*\)/);
    });

    it('click handler calls broadcastPauseToggle', () => {
      expect(traySource).toMatch(/broadcastPauseToggle\(/);
    });

    it('tooltip reflects paused state (JARVIS — paused / JARVIS — listening)', () => {
      expect(traySource).toContain('JARVIS — paused');
      expect(traySource).toContain('JARVIS — listening');
    });

    it('click rebuilds context menu (setContextMenu called inside click)', () => {
      // Pegar o bloco do click handler de Pause/Resume — usa lastIndexOf
      // porque "Pause listening" também aparece no header comment.
      const clickIdx = traySource.lastIndexOf('Pause listening');
      const pauseBlock = traySource.slice(clickIdx, clickIdx + 600);
      expect(pauseBlock).toContain('setContextMenu');
    });

    it('no residual references to wake-word-settings-changed / wakeWordEnabled', () => {
      expect(traySource).not.toContain('wake-word-settings-changed');
      expect(traySource).not.toContain('wakeWordEnabled');
    });
  });

  describe('Preserved behaviors (regression)', () => {
    it('has Show menu item', () => {
      expect(traySource).toContain("label: 'Show'");
    });

    it('has Hide menu item', () => {
      expect(traySource).toContain("label: 'Hide'");
    });

    it('has Quit menu item', () => {
      expect(traySource).toContain("label: 'Quit'");
    });

    it('Show calls mainWindow.show()', () => {
      expect(traySource).toContain('mainWindow.show()');
    });

    it('Hide calls mainWindow.hide()', () => {
      expect(traySource).toContain('mainWindow.hide()');
    });

    it('Quit calls app.quit()', () => {
      expect(traySource).toContain('app.quit()');
    });
  });

  describe('D-05: Icon path', () => {
    it('uses 16x16 icon path', () => {
      expect(traySource).toContain('icon-16x16.png');
    });
  });

  describe('Exports', () => {
    it('exports createTray', () => {
      expect(traySource).toContain('export function createTray');
    });

    it('exports destroyTray', () => {
      expect(traySource).toContain('export function destroyTray');
    });
  });
});

describe('Main process tray integration', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '../index.ts'),
    'utf-8'
  );

  it('imports createTray from tray module', () => {
    expect(mainSource).toMatch(/import.*createTray.*from.*['"]\.\/tray['"]/);
  });

  it('calls createTray after window creation', () => {
    expect(mainSource).toContain('createTray(');
  });
});
