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
import {
  bridgeVoiceModeChangeToRenderer,
  registerGetVoiceModeHandler,
  registerOpenSystemSettingsHandler,
} from './voiceMode';
import { setupActionsIpcHandlers } from './actions';
import { setupFileActionHandlers } from './fileActions';

export {
  bridgeVoiceModeChangeToRenderer,
  registerGetVoiceModeHandler,
};

export function setupIpcHandlers(chatDeps: ChatHandlerDeps, mainWindow: BrowserWindow): void {
  setupChatHandlers(chatDeps);
  setupHotkeyHandlers();
  registerWakeWordIpc();
  setupSettingsHandlers(mainWindow);
  // Phase 44 (VHARD-01, D-04): registra handler para abrir System Settings via shell
  registerOpenSystemSettingsHandler();
  // Phase 54 (LACT-06): ACTION_ACK handler — forwards user response to gateway via sendActionAck
  setupActionsIpcHandlers();
  // Phase 55 (LACT-01..05): ACTION_EXECUTE handler — executes OS action on behalf of LLM
  setupFileActionHandlers();
  // NOTE Quick 260427-qzg: registerGetVoiceModeHandler + bridgeVoiceModeChangeToRenderer
  // são chamados separadamente em main/index.ts APÓS voiceModeManager ser instanciado
  // (setupIpcHandlers roda antes da criação do manager).
}
