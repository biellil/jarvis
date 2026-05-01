/**
 * Push-to-Talk Hotkey Module
 *
 * ACTV-03: PTT hotkey for voice input
 * D-01: Toggle mode (press to start, press again to stop)
 * D-02: Configurable via tray menu
 * D-05: Persist preference in electron-store
 * D-06: Handle registration failure gracefully
 *
 * Phase 22 Plan 01 (WAKE-07): ownership de mic foi extraída para
 * VoiceInputManager (renderer). Este módulo NÃO rastreia mais estado de
 * gravação — só emite um evento puro 'ptt:action' com payload 'toggle'.
 * O renderer consulta o VoiceInputManager e decide start/stop.
 *
 * Research limitation: globalShortcut can't detect keyup, so we use toggle mode
 * Pattern: Option A from research - First press starts, second press stops
 *
 * PATCH-01 (Phase 45): guard de voice mode — hotkey só emite quando o modo
 * ativo é 'ptt-only'. Em wake-word ou always-listening o callback retorna
 * imediatamente sem enviar nada para o renderer nem para o main bus.
 */
import { globalShortcut, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { PttAction } from '../shared/ipc-types.js';
import { getPttHotkey, setPttHotkey } from './store';
import type { VoiceModeManager } from './voiceMode/index.js';

// Track current PTT hotkey accelerator for re-registration / unregister
let currentPttHotkey: string | null = null;

// PATCH-01: module-scoped VoiceModeManager reference.
// Injetado em main/index.ts após voiceModeManager.init() via setVoiceModeManager().
let voiceModeManager: VoiceModeManager | null = null;

/**
 * pttHotkeyEmitter — bus interno main-side para fan-out do evento 'toggle'.
 *
 * Phase 43 (D-03): strategies (PttOnlyStrategy, AlwaysListeningStrategy)
 * subscrevem em start() via pttHotkeyEmitter.on('toggle', ...) e
 * desinscrevem em stop()/dispose(). WakeWordStrategy não subscreve.
 *
 * O `webContents.send('ptt:action', 'toggle')` ao renderer continua
 * disparando — ChatInput.tsx é o consumer principal (PTT mic ownership
 * via voiceInputManager.acquire('ptt')). Strategies main-side são
 * consumers ADICIONAIS sem interferir no path renderer.
 *
 * setMaxListeners(5): 3 strategies + folga para tests/dev — leak detector
 * via warning Node se passar de 5 (default 10 é frouxo demais para
 * detectar leaks em mode switch).
 */
export const pttHotkeyEmitter = new EventEmitter();
pttHotkeyEmitter.setMaxListeners(5);

/**
 * setVoiceModeManager — injeta VoiceModeManager no módulo PTT.
 * Deve ser chamado em main/index.ts após voiceModeManager.init().
 * PATCH-01: necessário para o guard de voice mode no callback da hotkey.
 */
export function setVoiceModeManager(manager: VoiceModeManager): void {
  voiceModeManager = manager;
}

/**
 * createPttToggleCallback — factory do callback da hotkey PTT.
 * PATCH-01: guard verifica voiceMode antes de emitir — bloqueia AMBOS
 * os emits (renderer IPC + main bus) quando modo ≠ 'ptt-only'.
 * Extraído para evitar duplicação entre registerPttHotkey e changePttHotkey.
 */
function createPttToggleCallback(mainWindow: BrowserWindow): () => void {
  return () => {
    if (voiceModeManager?.getMode() !== 'ptt-only') {
      console.log('[PTT] Hotkey ignored — voice mode is not ptt-only');
      return;
    }
    mainWindow.webContents.send('ptt:action', 'toggle');
    pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
    console.log('[PTT] Toggle event sent (renderer + main bus)');
  };
}

/**
 * Register PTT hotkey with toggle behavior
 *
 * D-01: Toggle mode - first press starts recording, second press stops
 * D-05: Reads preference from store
 * D-06: Returns boolean indicating success
 *
 * Phase 22: emite 'toggle' em vez de alternar 'start'/'stop'. O renderer
 * resolve o lado via VoiceInputManager.
 */
export function registerPttHotkey(mainWindow: BrowserWindow): boolean {
  // Get saved PTT hotkey preference
  const accelerator = getPttHotkey();

  // Register hotkey — PATCH-01: guard via createPttToggleCallback
  const success = globalShortcut.register(accelerator, createPttToggleCallback(mainWindow));

  if (success) {
    currentPttHotkey = accelerator;
    console.log(`[PTT] Registered: ${accelerator}`);
  } else {
    // D-06: Log warning but don't crash
    console.warn(`[PTT] Failed to register: ${accelerator} (already taken or system restriction)`);
  }

  return success;
}

/**
 * Change PTT hotkey to new accelerator
 *
 * D-02: Update hotkey via tray menu
 * D-05: Persist to store
 * D-06: Return boolean indicating success
 */
export function changePttHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  // Unregister current PTT hotkey if any
  if (currentPttHotkey) {
    globalShortcut.unregister(currentPttHotkey);
    console.log(`[PTT] Unregistered: ${currentPttHotkey}`);
  }

  // Register new PTT hotkey — PATCH-01: guard via createPttToggleCallback
  const success = globalShortcut.register(accelerator, createPttToggleCallback(mainWindow));

  if (success) {
    // D-05: Persist to store
    setPttHotkey(accelerator);
    currentPttHotkey = accelerator;
    console.log(`[PTT] Changed to: ${accelerator}`);
  } else {
    // Try to restore previous hotkey if new one failed
    if (currentPttHotkey) {
      const restored = globalShortcut.register(currentPttHotkey, createPttToggleCallback(mainWindow));
      if (!restored) {
        console.error(`[PTT] Failed to restore previous hotkey: ${currentPttHotkey}`);
        currentPttHotkey = null;
      }
    }
    console.warn(`[PTT] Failed to register: ${accelerator} (already taken)`);
  }

  return success;
}

/**
 * Unregister PTT hotkey
 * Called on app quit to clean up
 */
export function unregisterPttHotkey(): void {
  if (currentPttHotkey) {
    globalShortcut.unregister(currentPttHotkey);
    currentPttHotkey = null;
    console.log('[PTT] Hotkey unregistered');
  }
}

/**
 * __resetPttHotkeyEmitterForTests — helper de isolamento de tests.
 *
 * pttHotkeyEmitter é module-scoped (singleton); vitest reseta vi.fn() entre
 * tests mas NÃO reseta module state. Race tests + pttOnly tests chamam
 * em beforeEach para garantir listenerCount começa em 0.
 *
 * @see RESEARCH.md Pitfall 3 (pttHotkeyEmitter global sobrevive entre tests)
 * @see voiceInputManager.ts pattern análogo em src/renderer
 */
export function __resetPttHotkeyEmitterForTests(): void {
  pttHotkeyEmitter.removeAllListeners();
}
