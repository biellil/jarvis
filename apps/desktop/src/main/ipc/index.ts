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
import { registerTaskHandlers } from './tasks';

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
  // Phase 54 (LACT-06) + Phase 55 (LACT-01..05): ACTION_ACK + ACTION_EXECUTE handlers
  setupActionsIpcHandlers();
  // Phase 66 (AGENT-02/03/04): task resume/cancel/backend-url IPC handlers
  registerTaskHandlers();
  // NOTE Quick 260427-qzg: registerGetVoiceModeHandler + bridgeVoiceModeChangeToRenderer
  // são chamados separadamente em main/index.ts APÓS voiceModeManager ser instanciado
  // (setupIpcHandlers roda antes da criação do manager).
}
