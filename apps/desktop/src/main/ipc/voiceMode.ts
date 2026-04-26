/**
 * Voice Mode IPC — Phase 41 (VUI-01)
 *
 * D-02: Canal unificado 'voice-mode:switch-result' para sucesso e bloqueio.
 * D-05: Broadcast enviado em ambos os casos (success:true e success:false).
 *
 * Pitfall 4 (RESEARCH.md): check isDestroyed() antes de send — previne crash
 * quando mainWindow é fechada entre o click no tray e o broadcast.
 */
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, type VoiceModeSwitchResult } from '../../shared/ipc-types.js';

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
