/**
 * Electron Store Wrapper
 *
 * Centralized configuration store for desktop app
 * D-05: Persist pttHotkey preference
 * Pattern: Single store instance, typed schema
 */
import Store from 'electron-store';

interface HotkeyConfig {
  accelerator: string;
}

export interface StoreSchema {
  hotkey?: HotkeyConfig;
  pttHotkey?: HotkeyConfig;
  wakeWordEnabled?: boolean;
}

// Single store instance
const store = new Store<StoreSchema>();

// Default values
const DEFAULT_HOTKEY = 'CmdOrCtrl+Shift+J';
const DEFAULT_PTT_HOTKEY = 'CmdOrCtrl+Space';
const DEFAULT_WAKE_WORD_ENABLED = true;

/**
 * Widget hotkey accessors
 */
export function getWidgetHotkey(): string {
  const config = store.get('hotkey');
  return config?.accelerator || DEFAULT_HOTKEY;
}

export function setWidgetHotkey(accelerator: string): void {
  store.set('hotkey', { accelerator });
}

/**
 * PTT hotkey accessors
 */
export function getPttHotkey(): string {
  const config = store.get('pttHotkey');
  return config?.accelerator || DEFAULT_PTT_HOTKEY;
}

export function setPttHotkey(accelerator: string): void {
  store.set('pttHotkey', { accelerator });
}

/**
 * Wake Word accessors
 */
export function getWakeWordEnabled(): boolean {
  const config = store.get('wakeWordEnabled');
  return config !== undefined ? config : DEFAULT_WAKE_WORD_ENABLED;
}

export function setWakeWordEnabled(enabled: boolean): void {
  // T-23-01-01: Validate boolean type before writing to store
  if (typeof enabled !== 'boolean') {
    console.error('T-23-01-01: setWakeWordEnabled received non-boolean value', enabled);
    return;
  }
  store.set('wakeWordEnabled', enabled);
}

export default store;
