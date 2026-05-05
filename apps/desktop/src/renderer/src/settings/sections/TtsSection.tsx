import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Input,
  Field,
  Switch,
} from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';
import type { TtsProviderOption } from '../../../../shared/ipc-types';

type Props = Pick<
  SettingsSectionProps,
  | 'ttsProvider'
  | 'onTtsProviderChange'
  | 'ttsApiKey'
  | 'onTtsApiKeyChange'
  | 'ttsVoiceIds'
  | 'onVoiceIdChange'
  | 'apiKeyError'
  | 'streamingTtsEnabled'
  | 'onStreamingTtsChange'
>;

export function TtsSection({
  ttsProvider,
  onTtsProviderChange,
  ttsApiKey,
  onTtsApiKeyChange,
  ttsVoiceIds,
  onVoiceIdChange,
  apiKeyError,
  streamingTtsEnabled,
  onStreamingTtsChange,
}: Props) {
  const voiceIdPlaceholder =
    ttsProvider === 'murf'
      ? 'pt-BR-heitor (default)'
      : 'EXAVITQu4vr4xnSDxMaL (default)';

  return (
    <div className="space-y-base">
      <h1 className="text-lg font-semibold text-fg tracking-tight">
        Text-to-Speech Configuration
      </h1>
      <p className="text-sm text-fg-subtle">
        Choose the text-to-speech provider and voice.
      </p>

      {/* Provider select */}
      <Field>
        <Field.Label>Provider</Field.Label>
        <Field.Control>
          <Select
            value={ttsProvider}
            onValueChange={(v) => onTtsProviderChange(v as TtsProviderOption)}
          >
            <SelectTrigger aria-label="TTS provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
              <SelectItem value="murf">Murf.ai</SelectItem>
            </SelectContent>
          </Select>
        </Field.Control>
      </Field>

      {/* API Key — with error display */}
      <Field error={!!apiKeyError}>
        <Field.Label>API Key</Field.Label>
        <Field.Control>
          <Input
            type="text"
            value={ttsApiKey}
            onChange={(e) => onTtsApiKeyChange(e.target.value)}
            placeholder="Paste your API key here..."
            aria-label="TTS API key"
          />
        </Field.Control>
        <Field.Error>{apiKeyError ?? ''}</Field.Error>
      </Field>

      {/* Voice ID */}
      <Field>
        <Field.Label>Voice ID</Field.Label>
        <Field.Control>
          <Input
            type="text"
            value={ttsVoiceIds[ttsProvider]}
            onChange={(e) => onVoiceIdChange(e.target.value)}
            placeholder={voiceIdPlaceholder}
            aria-label="TTS voice ID"
          />
        </Field.Control>
        <Field.Helper>Leave empty to use provider&apos;s default voice.</Field.Helper>
      </Field>

      {/* Streaming TTS toggle — Phase 53 Plan 03 (STTS-02).
          Apply-without-restart: onCheckedChange dispatches IPC immediately;
          Plan 04 reads getStreamingTtsEnabled() at start of each voice turn (D-11). */}
      <Field>
        <Field.Label>Streaming TTS (beta)</Field.Label>
        <Field.Control>
          <Switch
            checked={streamingTtsEnabled}
            onCheckedChange={onStreamingTtsChange}
            aria-label="Streaming TTS"
          />
        </Field.Control>
        <Field.Helper>Begins playback at the first complete sentence.</Field.Helper>
      </Field>

      {/* Active provider badge */}
      <p role="status" className="text-xs text-accent">
        Active: {ttsProvider === 'murf' ? 'Murf.ai' : 'ElevenLabs'}
      </p>
    </div>
  );
}
