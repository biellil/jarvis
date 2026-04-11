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
import { getPttHotkey, setPttHotkey } from './store';

// Track current PTT hotkey accelerator for re-registration / unregister
let currentPttHotkey: string | null = null;

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
    mainWindow.webContents.send('ptt:action', 'toggle');
    console.log('[PTT] Toggle event sent');
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
    console.log('[PTT] Toggle event sent');
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
