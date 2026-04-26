/**
 * Electron Store Wrapper
 *
 * Centralized configuration store for desktop app
 * D-05: Persist pttHotkey preference
 * Pattern: Single store instance, typed schema
 */
import Store from 'electron-store';
import type { VoiceMode } from '../shared/ipc-types.js';

interface HotkeyConfig {
  accelerator: string;
}

export interface StoreSchema {
  hotkey?: HotkeyConfig;
  pttHotkey?: HotkeyConfig;
  wakeWordPaused?: boolean;
  // Phase 25 ORB-POL-05: posição personalizada do orb (sobrescreve default bottom-right)
  orbPosition?: { x: number; y: number };
  // Phase 34 Settings UI
  ttsProvider?: { name: 'murf' | 'elevenlabs' };
  ttsApiKey?: { key: string };
  whisperModelOverride?: { model: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' };
  // Phase 39 — Voice Mode State Machine (VMODE-02)
  voiceMode?: VoiceMode;
}

// Single store instance
const store = new Store<StoreSchema>();

// Default values
const DEFAULT_HOTKEY = 'CmdOrCtrl+Shift+J';
const DEFAULT_PTT_HOTKEY = 'CmdOrCtrl+Space';
const DEFAULT_WAKE_WORD_PAUSED = false; // D-04: default false (active listening)
const DEFAULT_VOICE_MODE: VoiceMode = 'wake-word'; // D-07: default para migração v1.8 silenciosa

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

/**
 * Orb position accessors (Phase 25 ORB-POL-05)
 *
 * Persiste a posição da janela arrastada pelo usuário.
 * Lida separadamente de 'window.position' (legacy position.ts) para
 * evitar conflito com a lógica de validação de bounds existente em position.ts.
 * Se getOrbPosition() retornar undefined, position.ts usa o default bottom-right.
 */
export function getOrbPosition(): { x: number; y: number } | undefined {
  return store.get('orbPosition');
}

export function setOrbPosition(x: number, y: number): void {
  store.set('orbPosition', { x, y });
}

// Phase 34: TTS provider accessors
export function getTtsProvider(): 'murf' | 'elevenlabs' {
  return store.get('ttsProvider')?.name ?? 'elevenlabs';
}

export function setTtsProvider(name: 'murf' | 'elevenlabs'): void {
  store.set('ttsProvider', { name });
}

export function getTtsApiKey(): string {
  return store.get('ttsApiKey')?.key ?? '';
}

export function setTtsApiKey(key: string): void {
  store.set('ttsApiKey', { key });
}

// Phase 34: Whisper model override accessors
export function getWhisperModelOverride(): 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' {
  return store.get('whisperModelOverride')?.model ?? 'auto';
}

export function setWhisperModelOverride(model: 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'): void {
  store.set('whisperModelOverride', { model });
}

/**
 * Voice Mode accessors (Phase 39 — VMODE-02)
 *
 * D-07: Migração v1.8 → v1.9 via default implícito no read.
 * store.get('voiceMode') undefined → retorna 'wake-word'. Próxima escrita persiste.
 * T-39-01: Valor inválido no store JSON é tratado como undefined → retorna default.
 */
export function getVoiceMode(): VoiceMode {
  const value = store.get('voiceMode');
  const validModes: VoiceMode[] = ['wake-word', 'always-listening', 'ptt-only'];
  if (value !== undefined && validModes.includes(value as VoiceMode)) {
    return value as VoiceMode;
  }
  return DEFAULT_VOICE_MODE;
}

export function setVoiceMode(mode: VoiceMode): void {
  store.set('voiceMode', mode);
}

export default store;
