/**
 * System Tray Module
 *
 * DESK-04: Tray icon with menu Show/Hide/Quit
 * ACTV-01: Configure Hotkey submenu with radio options
 * ACTV-03: Configure PTT submenu with radio options
 * D-05: Icon 16x16 + 32x32 PNG cyan circle
 * D-06: Single-click shows menu (Windows/Linux default)
 * D-07: Tooltip "JARVIS"
 * D-08: Menu with Show, Hide, Configure Hotkey, Configure PTT, Quit
 *
 * Phase 41 (VUI-01): Voice Mode submenu com 3 radio items (D-06/D-07).
 * Controle legado de pausa removido (D-03) — Voice Mode submenu é o único controle de voz.
 */
import { Tray, Menu, app, BrowserWindow, systemPreferences, shell } from 'electron';
import path from 'node:path';
import { changeHotkey } from './hotkey';
import { changePttHotkey } from './ptt-hotkey';
import {
  getWidgetHotkey,
  getPttHotkey,
} from './store';
import { openSettingsWindow } from './settingsWindow';
import { VoiceModeManager } from './voiceMode/index.js';
import type { VoiceMode } from '../shared/ipc-types.js';
import { broadcastModeSwitch } from './ipc/voiceMode.js';
import { resolveEnvPath } from './envPath.js';

let tray: Tray | null = null;

// D-06 to D-08: Available hotkey options (research line 173-178)
const HOTKEY_OPTIONS = [
  { label: 'Ctrl+Shift+J', accelerator: 'CmdOrCtrl+Shift+J' },
  { label: 'Ctrl+Alt+J', accelerator: 'CmdOrCtrl+Alt+J' },
  { label: 'Ctrl+Shift+Space', accelerator: 'CmdOrCtrl+Shift+Space' },
  { label: 'Ctrl+`', accelerator: 'CmdOrCtrl+`' },
] as const;

// PTT hotkey options (D-02)
const PTT_HOTKEY_OPTIONS = [
  { label: 'Space', accelerator: 'Space' },
  { label: 'Ctrl+Space', accelerator: 'CmdOrCtrl+Space' },
  { label: 'CapsLock (hold)', accelerator: 'CapsLock' },
] as const;

// D-07: Labels em pt-BR para o menu de contexto
const VOICE_MODE_OPTIONS = [
  { label: 'Palavra de Ativação', mode: 'wake-word' as const },
  { label: 'Sempre Ouvindo', mode: 'always-listening' as const },
  { label: 'Push-to-Talk', mode: 'ptt-only' as const },
] satisfies Array<{ label: string; mode: VoiceMode }>;

export function createTray(mainWindow: BrowserWindow, voiceModeManager: VoiceModeManager): void {
  // D-05: Use 16x16 icon (Electron auto-selects 32x32 for high-DPI)
  // Phase 51 (MCOS-01, D-04): em macOS usa template image (iconTemplate.png)
  // — Electron auto-inverte para preto/branco conforme tema do sistema.
  // Windows/Linux mantem icon-16x16.png (comportamento inalterado).
  const iconFile = process.platform === 'darwin' ? 'iconTemplate.png' : 'icon-16x16.png';
  const iconPath = path.join(__dirname, '../../resources/tray/', iconFile);
  tray = new Tray(iconPath);

  // D-07: Simple tooltip with app name only
  tray.setToolTip('JARVIS');

  // Build context menu with hotkey submenu
  const contextMenu = buildContextMenu(mainWindow, voiceModeManager);

  // D-06: Single-click shows context menu (default behavior)
  tray.setContextMenu(contextMenu);
}

function buildContextMenu(mainWindow: BrowserWindow, voiceModeManager: VoiceModeManager): Menu {
  // Get current hotkeys from store
  const currentAccelerator = getWidgetHotkey();
  const currentPttAccelerator = getPttHotkey();

  // D-04 (Phase 43): currentMode pode ser null em estado degradado
  // (factory falhou + recovery falhou). VOICE_MODE_OPTIONS.find retorna
  // undefined → fallback 'Wake Word' tooltip. option.mode === null retorna
  // false em todos os items → nenhum radio marcado (UX explícito de "sem
  // modo ativo"). Comportamento intencional, não bug.
  const currentMode = voiceModeManager.getMode();
  const modeLabel = VOICE_MODE_OPTIONS.find(o => o.mode === currentMode)?.label ?? 'Wake Word';
  tray?.setToolTip(`JARVIS — ${modeLabel}`);

  // D-08: Extended menu with Configure Hotkey and Configure PTT submenus
  return Menu.buildFromTemplate([
    { type: 'separator' },
    // D-06: Voice Mode submenu — primeiro item de configuração de comportamento
    {
      label: 'Modo de Voz',
      submenu: VOICE_MODE_OPTIONS.map((option) => ({
        label: option.label,                           // D-07: "Wake Word" | "Always-Listening" | "PTT-only"
        type: 'radio' as const,
        checked: option.mode === currentMode,          // D-04: lazy sync via getMode() lido acima
        click: async () => {
          // D-01/D-02/D-05/D-06 (Phase 44 VHARD-01): macOS-only permission gate antes de setMode()
          // Aplica a always-listening E ptt-only (ambos usam microfone)
          if (
            process.platform === 'darwin' &&
            (option.mode === 'always-listening' || option.mode === 'ptt-only')
          ) {
            const micStatus = systemPreferences.getMediaAccessStatus('microphone');
            // D-06: 'not-determined', 'denied', 'restricted' = blocked
            if (micStatus !== 'granted') {
              // D-03: broadcast failure com blockedReason e settingsUrl
              broadcastModeSwitch({
                success: false,
                blockedReason: 'mic-permission-denied',
                settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
              });
              return; // Sai sem chamar setMode()
            }
          }
          // Fluxo original — só executado se permission OK (ou não-macOS ou wake-word)
          const success = await voiceModeManager.setMode(option.mode, 'user');
          broadcastModeSwitch({
            success,
            newMode: success ? option.mode : undefined,
            label: success ? option.label : undefined,
          });
          // D-04: Rebuild apenas em sucesso (estado mudou, radio precisa atualizar)
          if (success) {
            const newMenu = buildContextMenu(mainWindow, voiceModeManager);
            tray?.setContextMenu(newMenu);
          }
        },
      })),
    },
    { type: 'separator' },
    {
      label: 'Mostrar',
      click: () => {
        mainWindow.show();
      },
    },
    {
      label: 'Ocultar',
      click: () => {
        mainWindow.hide();
      },
    },
    {
      label: 'Configurações',
      click: () => openSettingsWindow(),
    },
    {
      label: 'Abrir .env',
      click: () => {
        shell.showItemInFolder(resolveEnvPath());
      },
    },
    { type: 'separator' },
    {
      label: 'Configurar Atalho',
      submenu: HOTKEY_OPTIONS.map((option) => ({
        label: option.label,
        type: 'radio' as const,
        checked: option.accelerator === currentAccelerator,
        click: () => {
          // D-08: Immediate hotkey change
          const success = changeHotkey(option.accelerator, mainWindow);
          if (success) {
            // Rebuild menu to update radio selection
            const newMenu = buildContextMenu(mainWindow, voiceModeManager);
            tray?.setContextMenu(newMenu);
          }
        },
      })),
    },
    {
      label: 'Configurar PTT',
      submenu: PTT_HOTKEY_OPTIONS.map((option) => ({
        label: option.label,
        type: 'radio' as const,
        checked: option.accelerator === currentPttAccelerator,
        click: () => {
          // D-02: Immediate PTT hotkey change
          const success = changePttHotkey(option.accelerator, mainWindow);
          if (success) {
            // Rebuild menu to update radio selection
            const newMenu = buildContextMenu(mainWindow, voiceModeManager);
            tray?.setContextMenu(newMenu);
          } else {
            // D-06: Log warning if registration failed
            console.warn(`[Tray] Failed to change PTT hotkey to ${option.accelerator}`);
          }
        },
      })),
    },
    { type: 'separator' },
    {
      label: 'Abrir DevTools',
      click: () => {
        // Janela de 240x240 transparente sem frame não tem como abrir DevTools
        // via Ctrl+Shift+I (não captura foco). Abrir via tray é a única via.
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        app.quit();
      },
    },
  ]);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
