/**
 * IPC Handler Registry
 * D-01: Aggregates all feature handlers
 * Phase 22 Plan 02: + wake word load-models handler (registerWakeWordIpc)
 */
import { setupChatHandlers, type ChatHandlerDeps } from './chat';
import { setupHotkeyHandlers } from './hotkey';
import { registerWakeWordIpc } from './wakeWord';
import { setupSettingsHandlers } from './settings';

export function setupIpcHandlers(chatDeps: ChatHandlerDeps): void {
  setupChatHandlers(chatDeps);
  setupHotkeyHandlers();
  registerWakeWordIpc();
  setupSettingsHandlers();
}
