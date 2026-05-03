import React, { useState, useEffect } from 'react';
import { HotkeyRecorder } from './HotkeyRecorder';
import { TtsProviderSelect } from './TtsProviderSelect';
import type { WhisperModelOption, TtsProviderOption } from '../../../shared/ipc-types';

const WHISPER_OPTIONS: { label: string; value: WhisperModelOption }[] = [
  { label: 'Auto (by VRAM)', value: 'auto' },
  { label: 'Tiny', value: 'tiny' },
  { label: 'Base', value: 'base' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large v3 Turbo', value: 'large-v3-turbo' },
];

// Phase 40 (VLISTEN-04) — VAD silence threshold range/default.
// Mantido em sync com store.ts e ipc/settings.ts (clamp [300, 800]ms; default 500ms).
const VAD_THRESHOLD_MIN_MS = 300;
const VAD_THRESHOLD_MAX_MS = 800;
const VAD_THRESHOLD_DEFAULT_MS = 500;
const VAD_THRESHOLD_STEP_MS = 50;

export function SettingsForm() {
  const [pttHotkey, setPttHotkey] = useState('Ctrl+Space');
  const [ttsProvider, setTtsProvider] = useState<TtsProviderOption>('elevenlabs');
  const [ttsApiKey, setTtsApiKey] = useState('');
  // QUICK-260427-tjc: voice ID state per-provider — input mostra o do provider ativo.
  const [ttsVoiceIds, setTtsVoiceIds] = useState<Record<TtsProviderOption, string>>({
    murf: '',
    elevenlabs: '',
  });
  const [whisperModel, setWhisperModel] = useState<WhisperModelOption>('auto');
  // Phase 40 (VLISTEN-04) — VAD silence threshold slider state.
  // Default 500ms para usuários do v1.8 (store ainda sem o campo) — D-07.
  const [vadThresholdMs, setVadThresholdMs] = useState<number>(VAD_THRESHOLD_DEFAULT_MS);
  const [toast, setToast] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load current settings on mount
  useEffect(() => {
    window.settings.get().then((data) => {
      setPttHotkey(data.pttHotkey);
      setTtsProvider(data.ttsProvider);
      setTtsApiKey(data.ttsApiKey);
      setWhisperModel(data.whisperModelOverride);
      // Phase 40: campo opcional para usuários do v1.8 — fallback para default.
      setVadThresholdMs(data.vadSilenceThresholdMs ?? VAD_THRESHOLD_DEFAULT_MS);
      // QUICK-260427-tjc: hidrata voice IDs per-provider; fallback defensivo
      // para users em store v1.x que ainda não têm o campo.
      if (data.ttsVoiceIds) {
        setTtsVoiceIds(data.ttsVoiceIds);
      }
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Failed to load settings: ${msg}`);
    });
  }, []);

  // Auto-clear toast after 2s (info) or 5s (error)
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.type === 'info' ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function showToast(type: 'info' | 'error', message: string) {
    setToast({ type, message });
  }

  async function handleSave() {
    // Validation: API key must not be empty
    if (!ttsApiKey.trim()) {
      showToast('error', 'API key cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const result = await window.settings.save({
        pttHotkey,
        ttsProvider,
        ttsApiKey: ttsApiKey.trim(),
        whisperModelOverride: whisperModel,
        // QUICK-260427-tjc: envia o objeto completo (mais simples que diff parcial).
        ttsVoiceIds,
      });

      if (result.success) {
        showToast('info', 'Settings saved');
        // Close window after toast auto-clears (2s)
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

  /**
   * QUICK-260427-tjc — handler do input "Voice ID" no TtsProviderSelect.
   *
   * Atualiza só a chave do provider ativo no objeto ttsVoiceIds. Preserva
   * o valor do outro provider — usuário consegue ter voz Murf E voz
   * ElevenLabs configuradas simultaneamente, alternando via select Provider.
   */
  function handleVoiceIdChange(id: string): void {
    setTtsVoiceIds((prev) => ({ ...prev, [ttsProvider]: id }));
  }

  /**
   * Phase 40 (VLISTEN-04) — handler do slider VAD Silence Threshold.
   *
   * UX em tempo real (UI-SPEC.md): atualiza o state imediatamente
   * (UI responsiva), depois envia o IPC para o main aplicar. Erro de IPC é
   * logado mas não reverte o state — slider mantém o que o usuário escolheu.
   */
  async function handleVadThresholdChange(ms: number): Promise<void> {
    setVadThresholdMs(ms);
    try {
      await window.settings.setVadThreshold(ms);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SettingsForm] Failed to apply VAD threshold:', msg);
      showToast('error', `Failed to apply VAD threshold: ${msg}`);
    }
  }

  function handleVadThresholdReset(): void {
    void handleVadThresholdChange(VAD_THRESHOLD_DEFAULT_MS);
  }

  return (
    <div className="min-h-screen bg-black/95 text-white p-6 flex flex-col font-[Inter,_-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif]">
      <div className="flex-1 space-y-8">
        {/* PTT Section */}
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Push-to-Talk</h2>
          <HotkeyRecorder
            label="Hotkey"
            value={pttHotkey}
            onRecorded={setPttHotkey}
          />
        </section>
        <hr className="border-white/20" />

        {/*
          Phase 40 (VLISTEN-04) — Always-Listening Section.
          Inserida entre Push-to-Talk e Text-to-Speech conforme UI-SPEC.md
          (agrupa configurações relacionadas a captura por voz).
          Slider real-time apply: sem botão "Save" — IPC roundtrip a cada onChange.
        */}
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Always-Listening</h2>
          <div className="space-y-3">
            {/* Label + value display (right-aligned) */}
            <div className="flex justify-between items-baseline">
              <label
                htmlFor="vad-threshold-slider"
                className="text-xs font-medium text-white/70"
              >
                VAD Silence Threshold
              </label>
              <span className="text-xs font-medium text-white">
                {vadThresholdMs} ms
              </span>
            </div>

            {/* Slider — range 300-800ms, step 50ms, real-time IPC apply */}
            <input
              id="vad-threshold-slider"
              type="range"
              min={VAD_THRESHOLD_MIN_MS}
              max={VAD_THRESHOLD_MAX_MS}
              step={VAD_THRESHOLD_STEP_MS}
              value={vadThresholdMs}
              onChange={(e) =>
                void handleVadThresholdChange(parseInt(e.target.value, 10))
              }
              aria-label="VAD silence threshold in milliseconds"
              aria-valuemin={VAD_THRESHOLD_MIN_MS}
              aria-valuemax={VAD_THRESHOLD_MAX_MS}
              aria-valuenow={vadThresholdMs}
              aria-valuetext={`${vadThresholdMs} milliseconds`}
              className="slider-vad-threshold w-full h-2 bg-gray-800 rounded-full"
            />

            {/* Helper text — explains the responsiveness vs. patience trade-off */}
            <p className="text-xs text-white/50">
              Silence threshold after speech ends. Lower = more responsive but may
              trigger on breathing/clicks. Higher = patient but may miss end of
              phrase. Typical: 400–600ms.
            </p>

            {/* Reset button — back to 500ms default */}
            <button
              type="button"
              onClick={handleVadThresholdReset}
              className="mt-2 px-3 py-1.5 text-xs font-medium text-white/60 bg-transparent border border-white/20 rounded hover:border-white/40 hover:text-white transition-colors"
            >
              Reset to Default (500ms)
            </button>
          </div>
        </section>
        <hr className="border-white/20" />

        {/* TTS Section */}
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Text-to-Speech</h2>
          <TtsProviderSelect
            provider={ttsProvider}
            apiKey={ttsApiKey}
            voiceId={ttsVoiceIds[ttsProvider]}
            onProviderChange={setTtsProvider}
            onApiKeyChange={setTtsApiKey}
            onVoiceIdChange={handleVoiceIdChange}
          />
        </section>
        <hr className="border-white/20" />

        {/* Whisper Section */}
        <section>
          <h2 className="text-base font-semibold text-white mb-4">Speech-to-Text Model</h2>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-white/70">Model</label>
            <select
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value as WhisperModelOption)}
              className="w-full px-3 py-2 rounded text-sm font-medium bg-gray-800 text-white border border-white/20 focus:border-cyan-500/80 outline-none"
              aria-label="Whisper model"
            >
              {WHISPER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-white/50">
              {whisperModel === 'auto' ? 'Auto: model selected based on available VRAM' : `Manual: ${whisperModel}`}
            </p>
          </div>
        </section>
      </div>

      {/* Button Bar */}
      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 rounded text-sm font-medium border border-white/20 text-white bg-transparent hover:border-white/40 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded text-sm font-medium text-white bg-gray-800 border border-white/20 hover:bg-cyan-500 hover:border-cyan-500 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={[
            'fixed bottom-4 right-4 px-4 py-2 rounded text-sm font-medium shadow-lg',
            toast.type === 'info' ? 'bg-gray-800 text-white border border-white/20' : 'bg-red-600 text-white',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default SettingsForm;
