/**
 * IPC Handler Registry
 * D-01: Aggregates all feature handlers
 */
import { setupChatHandlers } from './chat';
import { setupHotkeyHandlers } from './hotkey';

export function setupIpcHandlers(): void {
  setupChatHandlers();
  setupHotkeyHandlers();
  // Future: setupOrbHandlers(), setupAudioHandlers(), etc.
}
