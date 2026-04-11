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
  wakeWordPaused?: boolean;
}

// Single store instance
const store = new Store<StoreSchema>();

// Default values
const DEFAULT_HOTKEY = 'CmdOrCtrl+Shift+J';
const DEFAULT_PTT_HOTKEY = 'CmdOrCtrl+Space';
const DEFAULT_WAKE_WORD_PAUSED = false; // D-04: default false (active listening)

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
 * Wake Word Paused accessors (Phase 23 Plan 02)
 *
 * D-03 + D-04: Semântica invertida vs o draft antigo (wakeWordEnabled).
 * Agora `wakeWordPaused=true` significa que o usuário pausou a escuta via
 * tray kill switch. Default=false (escuta ativa) espelha o comportamento
 * histórico do v1.0.
 *
 * T-23-02-01: defensive boolean check impede gravar valores não booleanos
 * no store (mesmo padrão validado em T-23-01-01 do plan 22).
 */
export function getWakeWordPaused(): boolean {
  const config = store.get('wakeWordPaused');
  return config !== undefined ? config : DEFAULT_WAKE_WORD_PAUSED;
}

export function setWakeWordPaused(paused: boolean): void {
  if (typeof paused !== 'boolean') {
    console.error('T-23-02-01: setWakeWordPaused received non-boolean value', paused);
    return;
  }
  store.set('wakeWordPaused', paused);
}

export default store;
