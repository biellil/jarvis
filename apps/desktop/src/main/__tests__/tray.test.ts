import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Tray Module', () => {
  const traySource = fs.readFileSync(
    path.join(__dirname, '../tray.ts'),
    'utf-8'
  );

  describe('DESK-04: Menu structure', () => {
    it('has exactly 3 menu items', () => {
      const labelMatches = traySource.match(/label:\s*['"](\w+)['"]/g);
      expect(labelMatches).toHaveLength(3);
    });

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

  describe('D-07: Tooltip', () => {
    it('sets tooltip to JARVIS', () => {
      expect(traySource).toContain("setToolTip('JARVIS')");
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
