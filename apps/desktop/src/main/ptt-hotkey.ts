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
 */
import { globalShortcut, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { PttAction } from '../shared/ipc-types.js';
import { getPttHotkey, setPttHotkey } from './store';

// Track current PTT hotkey accelerator for re-registration / unregister
let currentPttHotkey: string | null = null;

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

  // Register hotkey — emite toggle puro, sem state module-local
  const success = globalShortcut.register(accelerator, () => {
    // Dual-cast (D-03):
    //   1. Renderer (ChatInput.tsx) — comportamento existente, intocado.
    mainWindow.webContents.send('ptt:action', 'toggle');
    //   2. Main strategies — bus interno (Phase 43).
    pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
    console.log('[PTT] Toggle event sent (renderer + main bus)');
  });

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

  // Register new PTT hotkey — mesmo callback 'toggle' puro
  const success = globalShortcut.register(accelerator, () => {
    mainWindow.webContents.send('ptt:action', 'toggle');
    pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
    console.log('[PTT] Toggle event sent (renderer + main bus)');
  });

  if (success) {
    // D-05: Persist to store
    setPttHotkey(accelerator);
    currentPttHotkey = accelerator;
    console.log(`[PTT] Changed to: ${accelerator}`);
  } else {
    // Try to restore previous hotkey if new one failed
    if (currentPttHotkey) {
      const restored = globalShortcut.register(currentPttHotkey, () => {
        mainWindow.webContents.send('ptt:action', 'toggle');
        pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
      });
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
