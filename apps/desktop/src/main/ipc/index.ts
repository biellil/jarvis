/**
 * IPC Handler Registry
 * D-01: Aggregates all feature handlers
 */
import { setupChatHandlers, type ChatHandlerDeps } from './chat';
import { setupHotkeyHandlers } from './hotkey';

export function setupIpcHandlers(chatDeps: ChatHandlerDeps): void {
  setupChatHandlers(chatDeps);
  setupHotkeyHandlers();
}
