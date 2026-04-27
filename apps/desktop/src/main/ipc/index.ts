/**
 * IPC Handler Registry
 * D-01: Aggregates all feature handlers
 * Phase 22 Plan 02: + wake word load-models handler (registerWakeWordIpc)
 * Phase 34: setupSettingsHandlers now requires mainWindow param
 */
import { BrowserWindow } from 'electron';
import { setupChatHandlers, type ChatHandlerDeps } from './chat';
import { setupHotkeyHandlers } from './hotkey';
import { registerWakeWordIpc } from './wakeWord';
import { setupSettingsHandlers } from './settings';
import { registerOpenSystemSettingsHandler } from './voiceMode';

export function setupIpcHandlers(chatDeps: ChatHandlerDeps, mainWindow: BrowserWindow): void {
  setupChatHandlers(chatDeps);
  setupHotkeyHandlers();
  registerWakeWordIpc();
  setupSettingsHandlers(mainWindow);
  // Phase 44 (VHARD-01, D-04): registra handler para abrir System Settings via shell
  registerOpenSystemSettingsHandler();
}
