/**
 * Global Hotkey Module
 *
 * ACTV-01: Configurable global shortcuts for widget activation
 * D-05: Default hotkey is CmdOrCtrl+Shift+J
 * D-09: Persist hotkey preference using electron-store
 * D-10: Handle registration failure gracefully (return boolean)
 *
 * Pattern: RESEARCH.md Pattern 1 - Global Shortcut Registration
 */
import { globalShortcut, BrowserWindow } from 'electron';
import { getWidgetHotkey, setWidgetHotkey } from './store';

// Track current hotkey for change operations
let currentHotkey: string | null = null;

/**
 * Register global hotkey with show/hide toggle behavior
 *
 * D-05: Uses default CmdOrCtrl+Shift+J unless overridden
 * D-09: Reads hotkey preference from electron-store
 * D-10: Returns boolean - true if success, false if hotkey taken
 */
export function registerHotkey(mainWindow: BrowserWindow): boolean {
  // D-09: Restore saved hotkey preference or use default
  const accelerator = getWidgetHotkey();

  // D-10: globalShortcut.register() returns boolean
  const success = globalShortcut.register(accelerator, () => {
    // Toggle window visibility
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  if (success) {
    currentHotkey = accelerator;
    console.log(`[Hotkey] Registered: ${accelerator}`);
  } else {
    console.warn(`[Hotkey] Failed to register: ${accelerator} (already taken)`);
  }

  return success;
}

/**
 * Change hotkey to a new accelerator
 *
 * D-08: Immediately unregister old and register new
 * D-09: Save new preference to store
 * D-10: Return boolean indicating success
 */
export function changeHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  // Unregister current hotkey if any
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
    console.log(`[Hotkey] Unregistered: ${currentHotkey}`);
  }

  // Register new hotkey
  const success = globalShortcut.register(accelerator, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  if (success) {
    // D-09: Persist to store
    setWidgetHotkey(accelerator);
    currentHotkey = accelerator;
    console.log(`[Hotkey] Changed to: ${accelerator}`);
  } else {
    // Re-register previous hotkey if new one failed
    if (currentHotkey) {
      const restored = globalShortcut.register(currentHotkey, () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      });
      if (!restored) {
        console.error(`[Hotkey] Failed to restore previous hotkey: ${currentHotkey}`);
        currentHotkey = null;
      }
    }
    console.warn(`[Hotkey] Failed to register: ${accelerator} (already taken)`);
  }

  return success;
}

/**
 * Unregister all hotkeys
 *
 * Called on app quit to clean up
 */
export function unregisterAll(): void {
  globalShortcut.unregisterAll();
  currentHotkey = null;
  console.log('[Hotkey] All hotkeys unregistered');
}
