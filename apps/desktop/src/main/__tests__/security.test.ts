/**
 * Security Configuration Tests
 *
 * These tests verify that security settings are correctly configured
 * in the BrowserWindow source code.
 *
 * DESK-01: contextIsolation: true, nodeIntegration: false
 *
 * Note: Testing Electron main process with side-effects is complex.
 * These tests verify the source code contains the correct configuration.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('BrowserWindow Security Configuration', () => {
  const mainIndexPath = path.join(__dirname, '../index.ts');
  const mainIndexSource = fs.readFileSync(mainIndexPath, 'utf-8');

  test('contextIsolation must be true', () => {
    expect(mainIndexSource).toContain('contextIsolation: true');
  });

  test('nodeIntegration must be false', () => {
    expect(mainIndexSource).toContain('nodeIntegration: false');
  });

  test('sandbox must be true', () => {
    expect(mainIndexSource).toContain('sandbox: true');
  });

  test('webSecurity must be true', () => {
    expect(mainIndexSource).toContain('webSecurity: true');
  });

  test('allowRunningInsecureContent must be false', () => {
    expect(mainIndexSource).toContain('allowRunningInsecureContent: false');
  });

  test('preload script path is configured', () => {
    expect(mainIndexSource).toContain("preload: path.join(__dirname, '../preload/index.js')");
  });

  test('show is false to prevent white flash', () => {
    expect(mainIndexSource).toContain('show: false');
  });

  test('backgroundColor is absent so transparent: true takes full effect', () => {
    expect(mainIndexSource).not.toContain("backgroundColor: '#0F172A'");
    expect(mainIndexSource).toContain('transparent: true');
  });

  test('setupIpcHandlers is called before createWindow', () => {
    // Look for the calls within app.whenReady() block
    const whenReadyBlock = mainIndexSource.substring(
      mainIndexSource.indexOf('app.whenReady()'),
      mainIndexSource.indexOf('app.on(\'window-all-closed\'')
    );
    const setupIndex = whenReadyBlock.indexOf('setupIpcHandlers(');
    const createWindowIndex = whenReadyBlock.indexOf('createWindow()');
    expect(setupIndex).toBeGreaterThan(-1);
    expect(createWindowIndex).toBeGreaterThan(-1);
    expect(setupIndex).toBeLessThan(createWindowIndex);
  });
});

describe('IPC Channel Registration', () => {
  const chatHandlerPath = path.join(__dirname, '../ipc/chat.ts');
  const chatHandlerSource = fs.readFileSync(chatHandlerPath, 'utf-8');

  test('chat:send-text handler is registered', () => {
    expect(chatHandlerSource).toContain('IPC_CHANNELS.CHAT_SEND_TEXT');
    expect(chatHandlerSource).toContain('ipcMain.handle');
  });

  test('handler returns Result type with success/error pattern', () => {
    expect(chatHandlerSource).toContain('success: true');
    expect(chatHandlerSource).toContain('success: false');
    expect(chatHandlerSource).toContain('error:');
  });

  test('handler never throws exceptions (try/catch present)', () => {
    expect(chatHandlerSource).toContain('try {');
    expect(chatHandlerSource).toContain('catch (err)');
  });
});
