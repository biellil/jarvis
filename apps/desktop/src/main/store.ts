/**
 * Electron Store Wrapper
 *
 * Centralized configuration store for desktop app
 * D-05: Persist pttHotkey preference
 * Pattern: Single store instance, typed schema
 */
import Store from 'electron-store';
import { randomUUID } from 'crypto';
import type {
  VoiceMode,
  LlmProvider,
  TtsProviderOption,
  WhisperModelOption,
  QuietHoursConfig,
  FolderWatchConfig,
  DailySummaryConfig,
} from '../shared/ipc-types.js';

interface HotkeyConfig {
  accelerator: string;
}

export interface StoreSchema {
  hotkey?: HotkeyConfig;
  pttHotkey?: HotkeyConfig;
  // Phase 54 — Actions channel clientId (LACT-09)
  /** Stable UUID identifying this Electron instance to the gateway WS. Generated once, persists forever. */
  electronClientId?: string;
  wakeWordPaused?: boolean;
  // Phase 25 ORB-POL-05: posição personalizada do orb (sobrescreve default bottom-right)
  orbPosition?: { x: number; y: number };
  // Phase 34 Settings UI
  ttsProvider?: { name: 'murf' | 'elevenlabs' | 'kokoro' };
  ttsApiKey?: { key: string };
  // Phase 68 D-03: 'auto' removed from schema — read path normalizes legacy 'auto' → 'base'
  whisperModelOverride?: { model: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' };
  // QUICK-260427-tjc: voice ID per-provider (UI-configurable).
  // Empty string / missing key = use provider's hardcoded default
  // (pt-BR-heitor para Murf, EXAVITQu4vr4xnSDxMaL para ElevenLabs).
  ttsVoiceIds?: { murf?: string; elevenlabs?: string; kokoro?: string };
  // Phase 39 — Voice Mode State Machine (VMODE-02)
  voiceMode?: VoiceMode;
  // Phase 40 — Always-Listening VAD silence threshold (VLISTEN-04)
  // Range 300-800ms, default 500ms (D-07 Claude's Discretion — alinhado com OpenAI/Alexa/Google)
  vadSilenceThresholdMs?: number;
  // Phase 52 — Settings Extras
  /** LM Studio base URL configured by user (SEXT-01). Default: 'http://localhost:1234/v1' */
  lmStudioUrl?: string;
  /** Active LLM provider (SEXT-02). Values: 'lmstudio' | 'openai' | 'anthropic' */
  llmProvider?: LlmProvider;
  /** Wake word classifier threshold (SEXT-03). Range: [0.0, 1.0]. Default: 0.5 */
  wakeWordThreshold?: number;
  // Phase 53 — Streaming TTS feature flag (STTS-02)
  /** When true, TTS streams as it generates (sentence-by-sentence). Default: false (D-10). */
  streamingTtsEnabled?: boolean;
  // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
  /** When true, backend uses native /api/v1/chat SSE events instead of OpenAI-compat. Default: false (D-03). */
  streamingLMStudioEventsEnabled?: boolean;
  // Phase 57 — Cloud LLM provider API keys (LLM-PROV-01)
  geminiApiKey?: { key: string };
  openaiApiKey?: { key: string };
  anthropicApiKey?: { key: string };
  // Phase 62 — Kokoro offline TTS (TTS-OFF-01, TTS-OFF-05)
  /** When true, Kokoro TTS never falls back to cloud providers on failure. Default: false (D-05, D-06). */
  kokoroLocalOnly?: boolean;
  /** Absolute path to cached Kokoro ONNX model directory. Empty string if not downloaded. */
  kokoroModelPath?: string;
  // Phase 63 — Screenshot hotkey (VISION-03, D-07)
  /** Global hotkey to capture screen and attach to chat. Default: 'CmdOrCtrl+Shift+S' */
  screenshotHotkey?: HotkeyConfig;
  // Phase 64 — MCP Server enabled flag (MCP-SRV-03, D-11)
  /** When true, MCP stdio server is enabled. Default: false. */
  mcpServerEnabled?: boolean;
  // Phase 67 — Proactive settings (PROACT-04, D-10, D-13, D-17)
  quietHours?: QuietHoursConfig;
  folderWatch?: FolderWatchConfig;
  dailySummary?: DailySummaryConfig;
}

// Single store instance
const store = new Store<StoreSchema>();

// Default values
const DEFAULT_HOTKEY = 'CmdOrCtrl+Shift+J';
const DEFAULT_PTT_HOTKEY = 'CmdOrCtrl+Space';
const DEFAULT_WAKE_WORD_PAUSED = false; // D-04: default false (active listening)
const DEFAULT_VOICE_MODE: VoiceMode = 'wake-word'; // D-07: default para migração v1.8 silenciosa

// Phase 40 — VAD silence threshold (VLISTEN-04)
const VAD_SILENCE_THRESHOLD_DEFAULT = 500; // ms — alinhado com OpenAI/Alexa/Google standard (D-07 Claude's Discretion)
const VAD_SILENCE_THRESHOLD_MIN = 300;
const VAD_SILENCE_THRESHOLD_MAX = 800;

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

// Phase 34: TTS provider accessors (extended in Phase 62 with 'kokoro')
export function getTtsProvider(): TtsProviderOption {
  return store.get('ttsProvider')?.name ?? 'elevenlabs';
}

export function setTtsProvider(name: TtsProviderOption): void {
  store.set('ttsProvider', { name });
}

export function getTtsApiKey(): string {
  return store.get('ttsApiKey')?.key ?? '';
}

export function setTtsApiKey(key: string): void {
  store.set('ttsApiKey', { key });
}

/**
 * QUICK-260427-tjc: voice ID per provider, empty string = provider default.
 *
 * Permite o usuário escolher voz Murf/ElevenLabs direto pelo Settings UI sem
 * editar `.env`. A factory `createTTSProvider()` injeta esses valores em
 * `process.env['MURF_VOICE_ID']` / `process.env['ELEVENLABS_VOICE_ID']` antes
 * de instanciar o provider — apenas quando não vazios, preservando o default
 * hardcoded para usuários sem configuração (compat retroativa).
 */
export function getTtsVoiceId(provider: 'murf' | 'elevenlabs' | 'kokoro'): string {
  return store.get('ttsVoiceIds')?.[provider] ?? '';
}

export function setTtsVoiceId(provider: 'murf' | 'elevenlabs' | 'kokoro', voiceId: string): void {
  if (typeof voiceId !== 'string') {
    console.error('QUICK-260427-tjc: setTtsVoiceId received non-string value', voiceId);
    return;
  }
  // Spread o objeto existente para preservar o outro provider — sem isso,
  // store.set('ttsVoiceIds', { [provider]: voiceId }) apaga a outra chave.
  const current = store.get('ttsVoiceIds') ?? {};
  store.set('ttsVoiceIds', { ...current, [provider]: voiceId });
}

// Phase 62 — Kokoro local-only flag (TTS-OFF-05)
export function getTtsLocalOnlyFlag(): boolean {
  const v = store.get('kokoroLocalOnly');
  return typeof v === 'boolean' ? v : false;
}

export function setTtsLocalOnlyFlag(flag: boolean): void {
  if (typeof flag !== 'boolean') return;
  store.set('kokoroLocalOnly', flag);
}

// Phase 62 — Kokoro model path
export function getKokoroModelPath(): string {
  return store.get('kokoroModelPath') ?? '';
}

export function setKokoroModelPath(modelPath: string): void {
  store.set('kokoroModelPath', modelPath);
}

// Phase 34: Whisper model override accessors
// Phase 68 D-03/D-04: 'auto' removed from WhisperModelOption.
// D-07: valor 'auto' legado no store (ou ausente) → retorna 'base' como default.
export function getWhisperModelOverride(): WhisperModelOption {
  const stored = store.get('whisperModelOverride')?.model;
  // Cast to string for legacy 'auto' check — schema no longer includes 'auto' (Phase 68 D-03)
  // but a user's existing store JSON may still contain the old value.
  if (!stored || (stored as string) === 'auto') return 'base';
  return stored as WhisperModelOption;
}

export function setWhisperModelOverride(model: WhisperModelOption): void {
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

/**
 * VAD Silence Threshold accessors (Phase 40 — VLISTEN-04)
 *
 * D-07: Default 500ms (alinhado com OpenAI/Alexa/Google standard).
 * T-40-VAD: Clamp duplo no read E no write — protege contra corrupção de store
 * (usuário editou JSON manualmente) e contra input malicioso vindo do Settings UI.
 *
 * Range válido: [300, 800] ms.
 *
 * - Read: valor undefined OU fora de range → retorna default 500ms.
 * - Write: clamp ao range [300, 800] antes de persistir.
 *
 * Pattern espelha getVoiceMode() — default implícito, sem migração explícita.
 */
export function getVadSilenceThresholdMs(): number {
  const stored = store.get('vadSilenceThresholdMs');
  if (
    stored === undefined ||
    typeof stored !== 'number' ||
    stored < VAD_SILENCE_THRESHOLD_MIN ||
    stored > VAD_SILENCE_THRESHOLD_MAX
  ) {
    return VAD_SILENCE_THRESHOLD_DEFAULT;
  }
  return stored;
}

export function setVadSilenceThresholdMs(ms: number): void {
  const clamped = Math.max(VAD_SILENCE_THRESHOLD_MIN, Math.min(VAD_SILENCE_THRESHOLD_MAX, ms));
  store.set('vadSilenceThresholdMs', clamped);
}

// ============================================================
// Phase 52 — Settings Extras (SEXT-01, SEXT-02, SEXT-03)
// ============================================================

// SEXT-01: LM Studio URL
const LM_STUDIO_URL_DEFAULT = 'http://localhost:1234/v1';

export function getLmStudioUrl(): string {
  const stored = store.get('lmStudioUrl');
  return typeof stored === 'string' && stored.length > 0 ? stored : LM_STUDIO_URL_DEFAULT;
}

export function setLmStudioUrl(url: string): void {
  store.set('lmStudioUrl', url);
}

// SEXT-02: LLM Provider
const LLM_PROVIDER_DEFAULT: LlmProvider = 'lmstudio';
const VALID_LLM_PROVIDERS: LlmProvider[] = ['lmstudio', 'openai', 'anthropic', 'gemini'];

export function getLlmProvider(): LlmProvider {
  const stored = store.get('llmProvider');
  if (stored !== undefined && VALID_LLM_PROVIDERS.includes(stored as LlmProvider)) {
    return stored as LlmProvider;
  }
  return LLM_PROVIDER_DEFAULT;
}

export function setLlmProvider(provider: LlmProvider): void {
  if (!VALID_LLM_PROVIDERS.includes(provider)) {
    console.error('[store] setLlmProvider: invalid provider', provider);
    return;
  }
  store.set('llmProvider', provider);
}

// SEXT-03: Wake Word Threshold
const WAKE_WORD_THRESHOLD_DEFAULT = 0.5;
const WAKE_WORD_THRESHOLD_MIN = 0.0;
const WAKE_WORD_THRESHOLD_MAX = 1.0;

export function getWakeWordThreshold(): number {
  const stored = store.get('wakeWordThreshold');
  if (
    stored === undefined ||
    typeof stored !== 'number' ||
    Number.isNaN(stored) ||
    stored < WAKE_WORD_THRESHOLD_MIN ||
    stored > WAKE_WORD_THRESHOLD_MAX
  ) {
    return WAKE_WORD_THRESHOLD_DEFAULT;
  }
  return stored;
}

export function setWakeWordThreshold(threshold: number): void {
  const clamped = Math.max(
    WAKE_WORD_THRESHOLD_MIN,
    Math.min(WAKE_WORD_THRESHOLD_MAX, threshold),
  );
  store.set('wakeWordThreshold', clamped);
}

// ============================================================
// Phase 53 — Streaming TTS feature flag (STTS-02)
// D-10: default false; no env-var override.
// D-11: live flip without restart — Plan 04 reads at start of each voice turn.
// Pattern mirrors Phase 52 SEXT-03 verbatim with boolean instead of number.
// ============================================================

const STREAMING_TTS_DEFAULT = false;

export function getStreamingTtsEnabled(): boolean {
  const v = store.get('streamingTtsEnabled');
  return typeof v === 'boolean' ? v : STREAMING_TTS_DEFAULT;
}

export function setStreamingTtsEnabled(enabled: boolean): void {
  if (typeof enabled !== 'boolean') return;
  store.set('streamingTtsEnabled', enabled);
}

// ============================================================
// Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
// D-03: default false; apply-sem-restart via reload-llm trigger in IPC handler.
// Pattern mirrors Phase 53 streamingTtsEnabled verbatim.
// ============================================================

const STREAMING_LM_STUDIO_EVENTS_DEFAULT = false;

export function getStreamingLMStudioEventsEnabled(): boolean {
  const v = store.get('streamingLMStudioEventsEnabled');
  return typeof v === 'boolean' ? v : STREAMING_LM_STUDIO_EVENTS_DEFAULT;
}

export function setStreamingLMStudioEventsEnabled(enabled: boolean): void {
  if (typeof enabled !== 'boolean') return;
  store.set('streamingLMStudioEventsEnabled', enabled);
}

// ============================================================
// Phase 57 — Cloud LLM provider API keys (LLM-PROV-01)
// Pattern mirrors getTtsApiKey/setTtsApiKey from Phase 34.
// Priority: electron-store > process.env (per D-06)
// ============================================================

export function getGeminiApiKey(): string {
  return store.get('geminiApiKey')?.key ?? '';
}

export function setGeminiApiKey(key: string): void {
  store.set('geminiApiKey', { key });
}

export function getOpenaiApiKey(): string {
  return store.get('openaiApiKey')?.key ?? '';
}

export function setOpenaiApiKey(key: string): void {
  store.set('openaiApiKey', { key });
}

export function getAnthropicApiKey(): string {
  return store.get('anthropicApiKey')?.key ?? '';
}

export function setAnthropicApiKey(key: string): void {
  store.set('anthropicApiKey', { key });
}

// ============================================================
// Phase 54 — Actions channel clientId (LACT-09)
// D-03: clientId generated once via crypto.randomUUID(), persisted in electron-store.
// ============================================================

export function getOrCreateClientId(): string {
  const stored = store.get('electronClientId');
  if (typeof stored === 'string' && stored.length > 0) {
    return stored;
  }
  const newId = randomUUID();
  store.set('electronClientId', newId);
  console.log(`[store] Generated new electronClientId: ${newId}`);
  return newId;
}

// ============================================================
// Phase 63 — Screenshot hotkey (VISION-03, D-07)
// Default: CmdOrCtrl+Shift+S (D-07: same HotkeyConfig shape as pttHotkey)
// ============================================================

const DEFAULT_SCREENSHOT_HOTKEY = 'CmdOrCtrl+Shift+S';

export function getScreenshotHotkey(): string {
  return store.get('screenshotHotkey')?.accelerator ?? DEFAULT_SCREENSHOT_HOTKEY;
}

export function setScreenshotHotkey(accelerator: string): void {
  store.set('screenshotHotkey', { accelerator });
}

// ============================================================
// Phase 64 — MCP Server enabled flag (MCP-SRV-03, D-11)
// Default: false — MCP server is off until user enables it.
// Pattern mirrors getStreamingTtsEnabled/setStreamingTtsEnabled verbatim.
// ============================================================

export function getMcpServerEnabled(): boolean {
  return store.get('mcpServerEnabled', false);
}

export function setMcpServerEnabled(enabled: boolean): void {
  store.set('mcpServerEnabled', enabled);
}

// ============================================================
// Phase 67 — Proactive Settings (PROACT-04, D-10, D-13, D-17)
// ============================================================

// Phase 67 — Quiet Hours (D-10)
const QUIET_HOURS_DEFAULT: QuietHoursConfig = { enabled: false, start: '22:00', end: '08:00' };

export function getQuietHours(): QuietHoursConfig {
  return store.get('quietHours') ?? QUIET_HOURS_DEFAULT;
}

export function setQuietHours(config: QuietHoursConfig): void {
  store.set('quietHours', config);
}

// Phase 67 — Folder Watch (D-13)
const FOLDER_WATCH_DEFAULT: FolderWatchConfig = { enabled: false, path: '' };

export function getFolderWatch(): FolderWatchConfig {
  return store.get('folderWatch') ?? FOLDER_WATCH_DEFAULT;
}

export function setFolderWatch(config: FolderWatchConfig): void {
  store.set('folderWatch', config);
}

// Phase 67 — Daily Summary (D-17: default enabled @ 09:00)
const DAILY_SUMMARY_DEFAULT: DailySummaryConfig = { enabled: true, time: '09:00' };

export function getDailySummary(): DailySummaryConfig {
  return store.get('dailySummary') ?? DAILY_SUMMARY_DEFAULT;
}

export function setDailySummary(config: DailySummaryConfig): void {
  store.set('dailySummary', config);
}

export default store;
