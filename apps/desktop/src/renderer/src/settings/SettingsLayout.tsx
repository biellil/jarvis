import React, { useState, useEffect } from 'react';
import { Keyboard, Mic, Volume2, Languages } from 'lucide-react';
import { Button } from '../components/ui';
import type { WhisperModelOption, TtsProviderOption } from '../../../shared/ipc-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAD_THRESHOLD_MIN_MS = 300;
const VAD_THRESHOLD_MAX_MS = 800;
const VAD_THRESHOLD_DEFAULT_MS = 500;
const VAD_THRESHOLD_STEP_MS = 50;

const WHISPER_OPTIONS: { label: string; value: WhisperModelOption }[] = [
  { label: 'Auto (by VRAM)', value: 'auto' },
  { label: 'Tiny', value: 'tiny' },
  { label: 'Base', value: 'base' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large v3 Turbo', value: 'large-v3-turbo' },
];

type SectionKey = 'ptt' | 'always-listening' | 'tts' | 'whisper';

const NAV_ITEMS: { key: SectionKey; label: string; Icon: React.ElementType }[] = [
  { key: 'ptt',              label: 'Push-to-Talk',    Icon: Keyboard  },
  { key: 'always-listening', label: 'Always-Listening', Icon: Mic       },
  { key: 'tts',              label: 'Text-to-Speech',  Icon: Volume2   },
  { key: 'whisper',          label: 'Whisper Model',   Icon: Languages },
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
  });
  const [whisperModel, setWhisperModel] = useState<WhisperModelOption>('auto');
  const [vadThresholdMs, setVadThresholdMs] = useState<number>(VAD_THRESHOLD_DEFAULT_MS);

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
      // Snapshot for dirty tracking
      setInitialSettings({
        pttHotkey: data.pttHotkey,
        ttsProvider: data.ttsProvider,
        ttsApiKey: data.ttsApiKey,
        whisperModel: data.whisperModelOverride,
        ttsVoiceIds: data.ttsVoiceIds ?? { murf: '', elevenlabs: '' },
      });
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to load settings: ${msg}`);
    });
  }, []);

  // Auto-clear toast: 2s info, 5s error
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.type === 'info' ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Dirty tracking ---
  const formValues = { pttHotkey, ttsProvider, ttsApiKey, whisperModel, ttsVoiceIds };
  const dirty = JSON.stringify(formValues) !== JSON.stringify(initialSettings);

  // --- Helpers ---
  function showToast(type: 'info' | 'error', message: string) {
    setToast({ type, message });
  }

  // --- Handlers ---
  async function handleSave() {
    if (!ttsApiKey.trim()) {
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
        setTimeout(() => window.settings.close(), 2000);
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

  // --- Section props (passed to placeholder and future real sections) ---
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
    onWhisperModelChange: setWhisperModel,
    vadThresholdMs,
    onVadThresholdChange: handleVadThresholdChange,
    onVadThresholdReset: handleVadThresholdReset,
    apiKeyError,
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
        return <WhisperSection {...sectionProps} />;
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

// ---------------------------------------------------------------------------
// PLACEHOLDER section components — replace with real imports in Wave 3
// ---------------------------------------------------------------------------

// PLACEHOLDER — replace with real import in Wave 3
function PttSection({ pttHotkey, onPttHotkeyChange }: SettingsSectionProps) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg mb-base">Push-to-Talk Settings</h1>
      <p className="text-sm text-fg-subtle mb-lg">Set the global hotkey for push-to-talk.</p>
      <div className="space-y-base">
        <div>
          <label className="block text-sm font-medium text-fg mb-xs" htmlFor="ptt-hotkey">
            Hotkey
          </label>
          <input
            id="ptt-hotkey"
            type="text"
            value={pttHotkey}
            readOnly
            onChange={() => onPttHotkeyChange(pttHotkey)}
            className="w-full px-base py-sm rounded text-sm bg-surface text-fg border border-white/8 outline-none"
          />
        </div>
      </div>
    </div>
  );
}

// PLACEHOLDER — replace with real import in Wave 3
function AlwaysListeningSection({
  vadThresholdMs,
  onVadThresholdChange,
  onVadThresholdReset,
}: SettingsSectionProps) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg mb-base">Voice Activity Detection</h1>
      <p className="text-sm text-fg-subtle mb-lg">Tune voice activity detection sensitivity.</p>
      <div className="space-y-base">
        <div className="flex justify-between items-baseline">
          <label htmlFor="vad-threshold" className="text-sm font-medium text-fg">
            Silence Threshold
          </label>
          <span className="text-sm font-medium text-fg">{vadThresholdMs} ms</span>
        </div>
        <input
          id="vad-threshold"
          type="range"
          min={VAD_THRESHOLD_MIN_MS}
          max={VAD_THRESHOLD_MAX_MS}
          step={VAD_THRESHOLD_STEP_MS}
          value={vadThresholdMs}
          onChange={(e) => void onVadThresholdChange(parseInt(e.target.value, 10))}
          aria-label="VAD silence threshold in milliseconds"
          aria-valuemin={VAD_THRESHOLD_MIN_MS}
          aria-valuemax={VAD_THRESHOLD_MAX_MS}
          aria-valuenow={vadThresholdMs}
          aria-valuetext={`${vadThresholdMs} milliseconds`}
          className="w-full"
        />
        <p className="text-xs text-fg-subtle">
          Lower = more responsive, less silence required. Higher = more patient.
        </p>
        <div className="mt-base">
          <Button variant="ghost" size="sm" onClick={onVadThresholdReset}>
            Reset to Default (500ms)
          </Button>
        </div>
      </div>
    </div>
  );
}

// PLACEHOLDER — replace with real import in Wave 3
function TtsSection({
  ttsProvider,
  onTtsProviderChange,
  ttsApiKey,
  onTtsApiKeyChange,
  ttsVoiceIds,
  onVoiceIdChange,
  apiKeyError,
}: SettingsSectionProps) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg mb-base">Text-to-Speech Configuration</h1>
      <p className="text-sm text-fg-subtle mb-lg">Choose the text-to-speech provider and voice.</p>
      <div className="space-y-base">
        <div>
          <label className="block text-sm font-medium text-fg mb-xs" htmlFor="tts-provider">
            Provider
          </label>
          <select
            id="tts-provider"
            value={ttsProvider}
            onChange={(e) => onTtsProviderChange(e.target.value as TtsProviderOption)}
            className="w-full px-base py-sm rounded text-sm bg-surface text-fg border border-white/8 outline-none"
          >
            <option value="elevenlabs">ElevenLabs</option>
            <option value="murf">Murf</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-xs" htmlFor="tts-api-key">
            API Key
          </label>
          <input
            id="tts-api-key"
            type="password"
            value={ttsApiKey}
            onChange={(e) => onTtsApiKeyChange(e.target.value)}
            className="w-full px-base py-sm rounded text-sm bg-surface text-fg border border-white/8 outline-none"
          />
          {apiKeyError && (
            <p className="mt-xs text-xs text-red-500">{apiKeyError}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-xs" htmlFor="tts-voice-id">
            Voice ID
          </label>
          <input
            id="tts-voice-id"
            type="text"
            value={ttsVoiceIds[ttsProvider]}
            onChange={(e) => onVoiceIdChange(e.target.value)}
            className="w-full px-base py-sm rounded text-sm bg-surface text-fg border border-white/8 outline-none"
          />
        </div>
      </div>
    </div>
  );
}

// PLACEHOLDER — replace with real import in Wave 3
function WhisperSection({ whisperModel, onWhisperModelChange }: SettingsSectionProps) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg mb-base">Speech-to-Text Model</h1>
      <p className="text-sm text-fg-subtle mb-lg">Choose the speech-to-text model.</p>
      <div className="space-y-base">
        <div>
          <label className="block text-sm font-medium text-fg mb-xs" htmlFor="whisper-model">
            Model
          </label>
          <select
            id="whisper-model"
            value={whisperModel}
            onChange={(e) => onWhisperModelChange(e.target.value as WhisperModelOption)}
            className="w-full px-base py-sm rounded text-sm bg-surface text-fg border border-white/8 outline-none"
          >
            {WHISPER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-xs text-xs text-fg-subtle">
            {whisperModel === 'auto'
              ? 'Auto: model selected based on available VRAM'
              : `Manual: ${whisperModel}`}
          </p>
        </div>
      </div>
    </div>
  );
}
