import React, { useState, useEffect, useRef } from 'react';
import { Keyboard, Mic, Volume2, Languages, Settings, Mic2 } from 'lucide-react';
import { Button } from '../components/ui';
import type { WhisperModelOption, TtsProviderOption, WhisperDownloadProgress, LlmProvider, ReloadLlmRequest, KokoroDownloadProgress } from '../../../shared/ipc-types';
import { PttSection } from './sections/PttSection';
import { AlwaysListeningSection } from './sections/AlwaysListeningSection';
import { TtsSection } from './sections/TtsSection';
import { WhisperSection } from './sections/WhisperSection';
import { LlmSection } from './sections/LlmSection';
import { WakeWordSection } from './sections/WakeWordSection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAD_THRESHOLD_DEFAULT_MS = 500;

type SectionKey = 'ptt' | 'always-listening' | 'tts' | 'whisper' | 'llm' | 'wake-word';

const NAV_ITEMS: { key: SectionKey; label: string; Icon: React.ElementType }[] = [
  { key: 'ptt',              label: 'Push-to-Talk',    Icon: Keyboard  },
  { key: 'always-listening', label: 'Always-Listening', Icon: Mic       },
  { key: 'tts',              label: 'Text-to-Speech',  Icon: Volume2   },
  { key: 'whisper',          label: 'Whisper Model',   Icon: Languages },
  { key: 'llm',              label: 'LLM Settings',    Icon: Settings  },
  { key: 'wake-word',        label: 'Wake Word',       Icon: Mic2      },
];

// ---------------------------------------------------------------------------
// SettingsSectionProps — consumed by Wave 2 section components
// ---------------------------------------------------------------------------

export interface SettingsSectionProps {
  pttHotkey: string;
  onPttHotkeyChange: (v: string) => void;
  ttsProvider: TtsProviderOption;
  onTtsProviderChange: (v: TtsProviderOption) => void;
  ttsApiKey: string;
  onTtsApiKeyChange: (v: string) => void;
  ttsVoiceIds: Record<TtsProviderOption, string>;
  onVoiceIdChange: (id: string) => void;
  whisperModel: WhisperModelOption;
  onWhisperModelChange: (v: WhisperModelOption) => void;
  vadThresholdMs: number;
  onVadThresholdChange: (ms: number) => Promise<void>;
  onVadThresholdReset: () => void;
  apiKeyError: string | null;
  // Phase 52 — Settings Extras
  lmStudioUrl: string;
  onLmStudioUrlChange: (url: string) => Promise<void>;
  llmProvider: LlmProvider;
  onLlmProviderChange: (provider: LlmProvider) => Promise<void>;
  wakeWordThreshold: number;
  onWakeWordThresholdChange: (threshold: number) => Promise<void>;
  // Phase 53 — Streaming TTS feature flag (STTS-02)
  streamingTtsEnabled: boolean;
  onStreamingTtsChange: (enabled: boolean) => void;
  // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
  streamingLMStudioEventsEnabled: boolean;
  onStreamingLMStudioEventsChange: (enabled: boolean) => void;
  // Phase 57 — Cloud provider API keys and LLM reload (LLM-PROV-01)
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  onReloadLlm: (req: ReloadLlmRequest) => Promise<{ success: boolean; error?: string }>;
  // Phase 62 — Kokoro offline TTS (TTS-OFF-04, TTS-OFF-05)
  kokoroLocalOnly: boolean;
  onKokoroLocalOnlyChange: (enabled: boolean) => void;
  kokoroDownloadState: KokoroDownloadProgress | null;
  onKokoroDownload: () => void;
  onKokoroCancelDownload: () => void;
  kokoroModelCached: boolean;
}

// ---------------------------------------------------------------------------
// SettingsLayout
// ---------------------------------------------------------------------------

export function SettingsLayout() {
  // --- Form state ---
  const [pttHotkey, setPttHotkey] = useState('Ctrl+Space');
  const [ttsProvider, setTtsProvider] = useState<TtsProviderOption>('elevenlabs');
  const [ttsApiKey, setTtsApiKey] = useState('');
  const [ttsVoiceIds, setTtsVoiceIds] = useState<Record<TtsProviderOption, string>>({
    murf: '',
    elevenlabs: '',
    kokoro: '',
  });
  const [whisperModel, setWhisperModel] = useState<WhisperModelOption>('auto');
  const [whisperDownloadState, setWhisperDownloadState] = useState<{
    status: 'downloading' | 'success' | 'error';
    percent: number;
    downloadedBytes: number;
    totalBytes: number;
    errorMessage?: string;
  } | null>(null);
  const [vadThresholdMs, setVadThresholdMs] = useState<number>(VAD_THRESHOLD_DEFAULT_MS);
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234/v1');
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('lmstudio');
  const [wakeWordThreshold, setWakeWordThreshold] = useState(0.5);
  // Phase 53 — Streaming TTS feature flag (STTS-02). Default false (D-10).
  const [streamingTtsEnabled, setStreamingTtsEnabled] = useState(false);
  // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02). Default false (D-03).
  const [streamingLMStudioEventsEnabled, setStreamingLMStudioEventsEnabled] = useState(false);
  // Phase 57 — Cloud provider API keys (LLM-PROV-01)
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  // Phase 62 — Kokoro offline TTS state
  const [kokoroLocalOnly, setKokoroLocalOnly] = useState(false);
  const [kokoroDownloadState, setKokoroDownloadState] = useState<KokoroDownloadProgress | null>(null);
  const [kokoroModelCached, setKokoroModelCached] = useState(false);

  // --- UI state ---
  const [activeSection, setActiveSection] = useState<SectionKey>('ptt');
  const [toast, setToast] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Snapshot for dirty tracking (vadThresholdMs excluded — real-time IPC, no Save needed)
  const [initialSettings, setInitialSettings] = useState<Record<string, unknown>>({});

  // --- Load settings on mount ---
  useEffect(() => {
    window.settings.get().then((data) => {
      setPttHotkey(data.pttHotkey);
      setTtsProvider(data.ttsProvider);
      setTtsApiKey(data.ttsApiKey);
      setWhisperModel(data.whisperModelOverride);
      setVadThresholdMs(data.vadSilenceThresholdMs ?? VAD_THRESHOLD_DEFAULT_MS);
      if (data.ttsVoiceIds) {
        setTtsVoiceIds(data.ttsVoiceIds);
      }
      setLmStudioUrl(data.lmStudioUrl ?? 'http://localhost:1234/v1');
      setLlmProvider(data.llmProvider ?? 'lmstudio');
      setWakeWordThreshold(data.wakeWordThreshold ?? 0.5);
      setStreamingTtsEnabled(data.streamingTtsEnabled ?? false);
      setStreamingLMStudioEventsEnabled(data.streamingLMStudioEventsEnabled ?? false);
      // Phase 57 — load persisted API keys
      setOpenaiApiKey(data.openaiApiKey ?? '');
      setAnthropicApiKey(data.anthropicApiKey ?? '');
      setGeminiApiKey(data.geminiApiKey ?? '');
      // Phase 62 — load kokoro state
      setKokoroLocalOnly(data.kokoroLocalOnly ?? false);
      setKokoroModelCached(data.kokoroModelCached ?? false);
      // Snapshot for dirty tracking
      setInitialSettings({
        pttHotkey: data.pttHotkey,
        ttsProvider: data.ttsProvider,
        ttsApiKey: data.ttsApiKey,
        whisperModel: data.whisperModelOverride,
        ttsVoiceIds: data.ttsVoiceIds ?? { murf: '', elevenlabs: '', kokoro: '' },
        lmStudioUrl: data.lmStudioUrl ?? 'http://localhost:1234/v1',
        llmProvider: data.llmProvider ?? 'lmstudio',
        kokoroLocalOnly: data.kokoroLocalOnly ?? false,
        // NOTE: wakeWordThreshold excluded — real-time IPC apply (same as vadThresholdMs)
      });
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to load settings: ${msg}`);
    });
  }, []);

  // Track whether we saw any 'downloading' events before 'success' for cache-hit detection
  const _sawDownloadingRef = useRef(false);

  // IPC listener: subscribe to whisper:download-progress on mount (D-09, D-10)
  useEffect(() => {
    const unsubscribe = window.whisper.onDownloadProgress((payload: WhisperDownloadProgress) => {
      if (payload.status === 'downloading') {
        _sawDownloadingRef.current = true;
      }

      setWhisperDownloadState({
        status: payload.status,
        percent: payload.percent,
        downloadedBytes: payload.downloadedBytes,
        totalBytes: payload.totalBytes,
        errorMessage: payload.errorMessage,
      });

      if (payload.status === 'success') {
        // Cache hit: no 'downloading' events preceded this success
        if (!_sawDownloadingRef.current) {
          showToast('info', 'Model already cached');
        }
        _sawDownloadingRef.current = false;
        // Clear state after 1.5s success indicator duration (D-07)
        setTimeout(() => setWhisperDownloadState(null), 1500);
      }

      if (payload.status === 'error') {
        // Detailed error in Toast; short message shown in WhisperSection Field
        showToast('error', `Download failed: ${payload.errorMessage ?? 'unknown error'}`);
      }
    });
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 62 — Kokoro download progress IPC listener
  useEffect(() => {
    if (!window.kokoro) return;
    const unsubscribe = window.kokoro.onDownloadProgress((payload: KokoroDownloadProgress) => {
      setKokoroDownloadState(payload);
      if (payload.status === 'success') {
        setKokoroModelCached(true);
        setTimeout(() => setKokoroDownloadState(null), 1500);
      }
      if (payload.status === 'error') {
        showToast('error', `Kokoro download failed: ${payload.errorMessage ?? 'unknown error'}`);
      }
    });
    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 53 — keep streamingTtsEnabled in sync with other windows (multi-window broadcast).
  useEffect(() => {
    const unsubscribe = window.settings.onStreamingTtsChanged((enabled: boolean) => {
      setStreamingTtsEnabled(enabled);
    });
    return unsubscribe;
  }, []);

  // Phase 60 — keep streamingLMStudioEventsEnabled in sync with other windows.
  useEffect(() => {
    const unsubLMStudio = window.settings.onStreamingLMStudioEventsChanged?.((enabled) => {
      setStreamingLMStudioEventsEnabled(enabled);
    });
    return () => { unsubLMStudio?.(); };
  }, []);

  // Auto-clear toast: 2s info, 5s error
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.type === 'info' ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Dirty tracking ---
  const formValues = { pttHotkey, ttsProvider, ttsApiKey, whisperModel, ttsVoiceIds, lmStudioUrl, llmProvider, kokoroLocalOnly };
  const dirty = JSON.stringify(formValues) !== JSON.stringify(initialSettings);

  // --- Helpers ---
  function showToast(type: 'info' | 'error', message: string) {
    setToast({ type, message });
  }

  // --- Handlers ---

  function handleWhisperModelChange(v: WhisperModelOption): void {
    setWhisperModel(v);
    // Reset cache-hit tracker for the new download
    _sawDownloadingRef.current = false;
    // Clear any previous error/success state
    setWhisperDownloadState(null);
    // Trigger immediate download (D-01) — fire-and-forget
    window.whisper.downloadModel(v).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SettingsLayout] whisper.downloadModel failed:', msg);
    });
  }

  async function handleSave() {
    // Kokoro does not require an API key (local model)
    if (ttsProvider !== 'kokoro' && !ttsApiKey.trim()) {
      setApiKeyError('API key cannot be empty');
      showToast('error', 'API key cannot be empty');
      return;
    }
    setApiKeyError(null);
    setSaving(true);
    try {
      const result = await window.settings.save({
        pttHotkey,
        ttsProvider,
        ttsApiKey: ttsApiKey.trim(),
        whisperModelOverride: whisperModel,
        ttsVoiceIds,
      });
      if (result.success) {
        showToast('info', 'Settings saved');
      } else {
        showToast('error', `Failed to save settings: ${result.error ?? 'unknown error'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to save settings: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    window.settings.close();
  }

  function handleVoiceIdChange(id: string): void {
    setTtsVoiceIds((prev) => ({ ...prev, [ttsProvider]: id }));
  }

  async function handleVadThresholdChange(ms: number): Promise<void> {
    setVadThresholdMs(ms);
    try {
      await window.settings.setVadThreshold(ms);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SettingsLayout] Failed to apply VAD threshold:', msg);
      showToast('error', `Failed to apply VAD threshold: ${msg}`);
    }
  }

  function handleVadThresholdReset(): void {
    void handleVadThresholdChange(VAD_THRESHOLD_DEFAULT_MS);
  }

  async function handleLmStudioUrlChange(url: string): Promise<void> {
    setLmStudioUrl(url);
    try {
      await window.settings.setLmStudioUrl(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to apply LM Studio URL: ${msg}`);
    }
  }

  async function handleLlmProviderChange(provider: LlmProvider): Promise<void> {
    setLlmProvider(provider);
    try {
      await window.settings.setLlmProvider(provider);
      showToast('info', `LLM provider switched to ${provider}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to apply LLM provider: ${msg}`);
    }
  }

  // Phase 53 — Streaming TTS toggle handler.
  // D-11: optimistic UI + IPC fire-and-forget; no Save bar cycle (apply-without-restart).
  // Plan 04 reads getStreamingTtsEnabled() at start of each voice turn.
  function handleStreamingTtsChange(enabled: boolean): void {
    setStreamingTtsEnabled(enabled);
    void window.settings.setStreamingTts(enabled).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to apply Streaming TTS: ${msg}`);
    });
  }

  // Phase 60 — LM Studio Streaming Events toggle handler (LLM-PROV-02).
  // Apply-without-restart: IPC fire-and-forget + backend reload triggered in main.
  function handleStreamingLMStudioEventsChange(enabled: boolean): void {
    setStreamingLMStudioEventsEnabled(enabled);
    void window.settings.setStreamingLMStudioEvents?.(enabled);
  }

  async function handleWakeWordThresholdChange(threshold: number): Promise<void> {
    setWakeWordThreshold(threshold);
    try {
      await window.settings.setWakeWordThreshold(threshold);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to apply wake word threshold: ${msg}`);
    }
  }

  // Phase 62 — Kokoro download handlers
  const handleKokoroDownload = async () => {
    if (!window.kokoro) return;
    setKokoroDownloadState({ status: 'downloading', percent: 0, downloadedMb: 0, totalMb: 350 });
    await window.kokoro.downloadModel();
  };

  const handleKokoroCancelDownload = () => {
    if (!window.kokoro) return;
    void window.kokoro.cancelDownload();
    setKokoroDownloadState(null);
  };

  // Phase 57 — Live LLM reload handler (LLM-PROV-01)
  async function handleReloadLlm(req: ReloadLlmRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.settings.reloadLlm(req);
      if (!result.success) {
        showToast('error', `Failed to reload LLM: ${result.error ?? 'unknown error'}`);
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to reload LLM: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // --- Section props (passed to section components) ---
  const sectionProps: SettingsSectionProps = {
    pttHotkey,
    onPttHotkeyChange: setPttHotkey,
    ttsProvider,
    onTtsProviderChange: setTtsProvider,
    ttsApiKey,
    onTtsApiKeyChange: setTtsApiKey,
    ttsVoiceIds,
    onVoiceIdChange: handleVoiceIdChange,
    whisperModel,
    onWhisperModelChange: handleWhisperModelChange,
    vadThresholdMs,
    onVadThresholdChange: handleVadThresholdChange,
    onVadThresholdReset: handleVadThresholdReset,
    apiKeyError,
    lmStudioUrl,
    onLmStudioUrlChange: handleLmStudioUrlChange,
    llmProvider,
    onLlmProviderChange: handleLlmProviderChange,
    wakeWordThreshold,
    onWakeWordThresholdChange: handleWakeWordThresholdChange,
    // Phase 53 — Streaming TTS feature flag (STTS-02). Apply-without-restart per D-11.
    streamingTtsEnabled,
    onStreamingTtsChange: handleStreamingTtsChange,
    // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02). Apply-without-restart.
    streamingLMStudioEventsEnabled,
    onStreamingLMStudioEventsChange: handleStreamingLMStudioEventsChange,
    // Phase 57 — Cloud provider API keys and LLM reload (LLM-PROV-01)
    openaiApiKey,
    anthropicApiKey,
    geminiApiKey,
    onReloadLlm: handleReloadLlm,
    // Phase 62 — Kokoro offline TTS (TTS-OFF-04, TTS-OFF-05)
    kokoroLocalOnly,
    onKokoroLocalOnlyChange: (v: boolean) => {
      setKokoroLocalOnly(v);
      void window.settings.save({ kokoroLocalOnly: v });
    },
    kokoroDownloadState,
    onKokoroDownload: handleKokoroDownload,
    onKokoroCancelDownload: handleKokoroCancelDownload,
    kokoroModelCached,
  };

  function renderSection() {
    switch (activeSection) {
      case 'ptt':
        return <PttSection {...sectionProps} />;
      case 'always-listening':
        return <AlwaysListeningSection {...sectionProps} />;
      case 'tts':
        return <TtsSection {...sectionProps} />;
      case 'whisper':
        return (
          <WhisperSection
            whisperModel={whisperModel}
            onWhisperModelChange={handleWhisperModelChange}
            downloadState={whisperDownloadState}
            onTryAgain={() => {
              _sawDownloadingRef.current = false;
              setWhisperDownloadState(null);
              window.whisper.downloadModel(whisperModel).catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[SettingsLayout] whisper retry failed:', msg);
              });
            }}
          />
        );
      case 'llm':
        return (
          <LlmSection
            lmStudioUrl={lmStudioUrl}
            onLmStudioUrlChange={handleLmStudioUrlChange}
            llmProvider={llmProvider}
            onLlmProviderChange={handleLlmProviderChange}
            openaiApiKey={openaiApiKey}
            anthropicApiKey={anthropicApiKey}
            geminiApiKey={geminiApiKey}
            onReloadLlm={handleReloadLlm}
            streamingLMStudioEventsEnabled={streamingLMStudioEventsEnabled}
            onStreamingLMStudioEventsChange={handleStreamingLMStudioEventsChange}
          />
        );
      case 'wake-word':
        return (
          <WakeWordSection
            wakeWordThreshold={wakeWordThreshold}
            onWakeWordThresholdChange={handleWakeWordThresholdChange}
          />
        );
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-screen bg-[var(--color-bg)]">
      {/* Sidebar — 200px fixed, D-01 */}
      <aside className="w-[200px] flex-shrink-0 flex flex-col border-r border-white/8 bg-surface">
        {/* Header — D-04 */}
        <div className="px-base py-lg border-b border-white/8">
          <span className="text-base font-semibold text-fg tracking-tight">Settings</span>
        </div>

        {/* Nav items — D-02, D-03 */}
        <nav className="flex flex-col gap-xs p-xs">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveSection(item.key)}
              className={[
                'flex items-center gap-xs px-base py-sm rounded text-sm font-medium transition-colors cursor-pointer',
                activeSection === item.key
                  ? 'bg-accent-soft border-l-2 border-accent text-fg pl-[calc(var(--spacing-base)-2px)]'
                  : 'text-fg-muted hover:bg-white/5 hover:text-fg border-l-2 border-transparent',
              ].join(' ')}
            >
              <item.Icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content panel — flex-1, internal scroll, D-05, D-06 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-xl pt-xl pb-[80px]">
          {renderSection()}
        </div>

        {/* Sticky save bar — D-07, D-08 */}
        <div className="sticky bottom-0 bg-surface border-t border-white/8 px-xl py-base shadow-sm flex justify-end gap-md">
          <Button variant="secondary" size="md" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={saving || !dirty}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={[
            'fixed bottom-4 right-4 px-4 py-2 rounded text-sm font-medium shadow-lg',
            toast.type === 'info'
              ? 'bg-surface text-fg border border-white/8'
              : 'bg-red-600 text-fg',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default SettingsLayout;
