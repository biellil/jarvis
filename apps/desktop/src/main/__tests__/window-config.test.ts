/**
 * Window Configuration Tests
 *
 * Verifies BrowserWindow configuration for Phase 10 requirements
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Window Configuration', () => {
  const indexPath = join(__dirname, '../index.ts');
  const sourceCode = readFileSync(indexPath, 'utf-8');

  describe('DESK-02: Frameless transparent always-on-top window', () => {
    it('should have frame: false', () => {
      expect(sourceCode).toContain('frame: false');
    });

    it('should have transparent: true', () => {
      expect(sourceCode).toContain('transparent: true');
    });

    it('should have alwaysOnTop: true', () => {
      expect(sourceCode).toContain('alwaysOnTop: true');
    });

    it('should have skipTaskbar: true', () => {
      expect(sourceCode).toContain('skipTaskbar: true');
    });

    it('should have resizable: false', () => {
      expect(sourceCode).toContain('resizable: false');
    });
  });

  describe('D-03: Window size 128x128', () => {
    it('should have width: 128', () => {
      expect(sourceCode).toContain('width: 128');
    });

    it('should have height: 128', () => {
      expect(sourceCode).toContain('height: 128');
    });
  });

  describe('Position handling', () => {
    it('should import calculateInitialPosition from position module', () => {
      expect(sourceCode).toMatch(/import.*calculateInitialPosition.*from.*position/);
    });

    it('should import savePosition from position module', () => {
      expect(sourceCode).toMatch(/import.*savePosition.*from.*position/);
    });

    it('should call calculateInitialPosition', () => {
      expect(sourceCode).toContain('calculateInitialPosition()');
    });

    it('should set position via mainWindow.setPosition', () => {
      expect(sourceCode).toContain('mainWindow.setPosition(x, y)');
    });

    it('should save position on before-quit event', () => {
      expect(sourceCode).toContain("app.on('before-quit'");
      expect(sourceCode).toContain('savePosition(x, y)');
    });
  });

  describe('Security settings (Phase 9 preservation)', () => {
    it('should maintain contextIsolation: true', () => {
      expect(sourceCode).toContain('contextIsolation: true');
    });

    it('should maintain nodeIntegration: false', () => {
      expect(sourceCode).toContain('nodeIntegration: false');
    });

    it('should maintain sandbox: true', () => {
      expect(sourceCode).toContain('sandbox: true');
    });

    it('should maintain webSecurity: true', () => {
      expect(sourceCode).toContain('webSecurity: true');
    });

    it('should maintain allowRunningInsecureContent: false', () => {
      expect(sourceCode).toContain('allowRunningInsecureContent: false');
    });
  });

  describe('DevTools handling', () => {
    it('should not have openDevTools() uncommented', () => {
      // DevTools should be manually opened, not auto-opened in widget mode
      const hasAutoOpenDevTools = /mainWindow\.webContents\.openDevTools\(\);\s*$/m.test(
        sourceCode
      );
      expect(hasAutoOpenDevTools).toBe(false);
    });
  });
});
