/**
 * Voice Mode IPC — Phase 41 (VUI-01)
 *
 * D-02: Canal unificado 'voice-mode:switch-result' para sucesso e bloqueio.
 * D-05: Broadcast enviado em ambos os casos (success:true e success:false).
 *
 * Pitfall 4 (RESEARCH.md): check isDestroyed() antes de send — previne crash
 * quando mainWindow é fechada entre o click no tray e o broadcast.
 */
import { BrowserWindow, ipcMain, shell } from 'electron';
import {
  IPC_CHANNELS,
  type VoiceModeChangeEvent,
  type VoiceModeSwitchResult,
} from '../../shared/ipc-types.js';
import type { VoiceModeManager } from '../voiceMode/index.js';

/**
 * Broadcast do resultado de mode switch a todos os renderers ativos.
 *
 * D-02: Chamado tanto em success:true quanto success:false (D-05).
 * Segue o padrão de broadcastPauseToggle em ipc/settings.ts.
 *
 * Consumer: Phase 42 renderer — exibe toast de confirmação ou "bloqueado".
 */
export function broadcastModeSwitch(result: VoiceModeSwitchResult): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT, result);
    }
  });
}

/**
 * registerOpenSystemSettingsHandler — Phase 44 (VHARD-01, D-04)
 *
 * Handler para renderer → main quando usuário clica no link do toast
 * de permissão negada. Main abre URL via shell.openExternal() — renderer
 * não pode chamar shell diretamente (sandbox).
 *
 * Segurança: URL é hardcoded aqui, não recebida do renderer (T-44-02 mitigation).
 * ipcMain.handle ignora qualquer payload enviado pelo renderer — URL é constante.
 */
export function registerOpenSystemSettingsHandler(): void {
  ipcMain.on(IPC_CHANNELS.SHELL_OPEN_SYSTEM_SETTINGS, () => {
    // URL hardcoded — nunca de IPC (prevenção T-44-02)
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    );
  });
}

/**
 * registerGetVoiceModeHandler — Quick 260427-qzg
 *
 * Handler ipcMain.handle('voiceMode:get') que devolve `voiceModeManager.getMode()`
 * para o renderer. Pode retornar null em estado degradado (D-04 fallback).
 *
 * Idempotente — chamadas repetidas removem o handler anterior antes de registrar.
 * Útil para hot reload em dev (HMR) e re-init em testes.
 */
export function registerGetVoiceModeHandler(voiceModeManager: VoiceModeManager): void {
  ipcMain.removeHandler(IPC_CHANNELS.VOICE_MODE_GET);
  ipcMain.handle(IPC_CHANNELS.VOICE_MODE_GET, () => voiceModeManager.getMode());
}

/**
 * bridgeVoiceModeChangeToRenderer — Quick 260427-qzg
 *
 * VoiceModeManager emite 'voiceMode:change' no seu próprio EventEmitter
 * interno (cf. voiceMode/index.ts:249). Sem este bridge, o renderer NUNCA
 * recebe o evento e o `window.jarvis.voiceMode.onChange()` ficaria silente.
 *
 * Ouve o emitter do manager e re-broadcasta para todas as BrowserWindow ativas.
 * isDestroyed() protege contra race condition (Pitfall 4 do voice-mode IPC).
 *
 * Retorna função de unsubscribe — chamar no app shutdown se quiser teardown
 * limpo (não estritamente necessário, EventEmitter é coletado com o manager).
 */
export function bridgeVoiceModeChangeToRenderer(
  voiceModeManager: VoiceModeManager,
): () => void {
  const handler = (event: VoiceModeChangeEvent) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.VOICE_MODE_CHANGE, event);
      }
    });
  };
  voiceModeManager.on('voiceMode:change', handler);
  return () => {
    voiceModeManager.off('voiceMode:change', handler);
  };
}
