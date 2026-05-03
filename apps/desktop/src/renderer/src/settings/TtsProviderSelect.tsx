export interface TtsProviderSelectProps {
  provider: 'murf' | 'elevenlabs';
  apiKey: string;
  /** QUICK-260427-tjc: voice ID do provider ativo. Empty string = use provider default. */
  voiceId: string;
  onProviderChange: (p: 'murf' | 'elevenlabs') => void;
  onApiKeyChange: (key: string) => void;
  /** QUICK-260427-tjc: callback ao editar voice ID — pai redireciona para o provider ativo. */
  onVoiceIdChange: (id: string) => void;
}

export function TtsProviderSelect({
  provider,
  apiKey,
  voiceId,
  onProviderChange,
  onApiKeyChange,
  onVoiceIdChange,
}: TtsProviderSelectProps) {
  // QUICK-260427-tjc: placeholder específico mostra o default hardcoded do provider
  // — comunica visualmente o que vai ser usado se o input ficar vazio.
  const voiceIdPlaceholder =
    provider === 'murf'
      ? 'pt-BR-heitor (default)'
      : 'EXAVITQu4vr4xnSDxMaL (default)';

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-white/70">Provider</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as 'murf' | 'elevenlabs')}
          className="w-full px-3 py-2 rounded text-sm font-medium bg-gray-800 text-white border border-white/20 focus:border-cyan-500/80 focus:shadow-[0_0_8px_rgba(6,182,212,0.3)] outline-none"
          aria-label="TTS provider"
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="murf">Murf.ai</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-white/70">API Key</label>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="Paste your API key here..."
          aria-label="TTS API key"
          className="w-full px-3 py-2 rounded text-sm font-medium bg-gray-800 text-white border border-white/20 focus:border-cyan-500/80 focus:shadow-[0_0_8px_rgba(6,182,212,0.3)] outline-none placeholder:text-white/30"
        />
      </div>
      {/* QUICK-260427-tjc: Voice ID per-provider — input controlled, sem validação de formato no UI
          (Murf usa "pt-BR-heitor", ElevenLabs usa hash; backend recebe como-está). */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-white/70">Voice ID</label>
        <input
          type="text"
          value={voiceId}
          onChange={(e) => onVoiceIdChange(e.target.value)}
          placeholder={voiceIdPlaceholder}
          aria-label="TTS voice ID"
          className="w-full px-3 py-2 rounded text-sm font-medium bg-gray-800 text-white border border-white/20 focus:border-cyan-500/80 focus:shadow-[0_0_8px_rgba(6,182,212,0.3)] outline-none placeholder:text-white/30"
        />
        <p className="text-xs text-white/50">
          Leave empty to use provider's default voice.
        </p>
      </div>
      <p role="status" className="text-xs text-cyan-500">
        Active: {provider === 'murf' ? 'Murf.ai' : 'ElevenLabs'}
      </p>
    </div>
  );
}
