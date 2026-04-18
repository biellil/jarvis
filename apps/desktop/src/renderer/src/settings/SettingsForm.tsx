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

export function SettingsForm() {
  const [pttHotkey, setPttHotkey] = useState('Ctrl+Space');
  const [ttsProvider, setTtsProvider] = useState<TtsProviderOption>('elevenlabs');
  const [ttsApiKey, setTtsApiKey] = useState('');
  const [whisperModel, setWhisperModel] = useState<WhisperModelOption>('auto');
  const [toast, setToast] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load current settings on mount
  useEffect(() => {
    window.settings.get().then((data) => {
      setPttHotkey(data.pttHotkey);
      setTtsProvider(data.ttsProvider);
      setTtsApiKey(data.ttsApiKey);
      setWhisperModel(data.whisperModelOverride);
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

  return (
    <div className="min-h-screen bg-black/95 text-white p-6 flex flex-col font-[Inter,_-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif]">
      <div className="flex-1 space-y-6">
        {/* PTT Section */}
        <section>
          <h2 className="text-base font-semibold text-white mb-3">Push-to-Talk</h2>
          <HotkeyRecorder
            label="Hotkey"
            value={pttHotkey}
            onRecorded={setPttHotkey}
          />
        </section>
        <hr className="border-white/20" />

        {/* TTS Section */}
        <section>
          <h2 className="text-base font-semibold text-white mb-3">Text-to-Speech</h2>
          <TtsProviderSelect
            provider={ttsProvider}
            apiKey={ttsApiKey}
            onProviderChange={setTtsProvider}
            onApiKeyChange={setTtsApiKey}
          />
        </section>
        <hr className="border-white/20" />

        {/* Whisper Section */}
        <section>
          <h2 className="text-base font-semibold text-white mb-3">Speech-to-Text Model</h2>
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
