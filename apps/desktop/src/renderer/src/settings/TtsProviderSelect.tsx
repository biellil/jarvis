export interface TtsProviderSelectProps {
  provider: 'murf' | 'elevenlabs';
  apiKey: string;
  onProviderChange: (p: 'murf' | 'elevenlabs') => void;
  onApiKeyChange: (key: string) => void;
}

export function TtsProviderSelect({ provider, apiKey, onProviderChange, onApiKeyChange }: TtsProviderSelectProps) {
  return (
    <div className="space-y-3">
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
      <p role="status" className="text-xs text-cyan-500">
        Active: {provider === 'murf' ? 'Murf.ai' : 'ElevenLabs'}
      </p>
    </div>
  );
}
