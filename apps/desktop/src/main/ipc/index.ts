/**
 * IPC Handler Registry
 * D-01: Aggregates all feature handlers
 */
import { setupChatHandlers } from './chat';

export function setupIpcHandlers(): void {
  setupChatHandlers();
  // Future: setupOrbHandlers(), setupAudioHandlers(), etc.
}
