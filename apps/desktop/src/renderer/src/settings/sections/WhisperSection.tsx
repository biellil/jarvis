import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Field,
} from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';
import type { WhisperModelOption } from '../../../../shared/ipc-types';

const WHISPER_OPTIONS: { label: string; value: WhisperModelOption }[] = [
  { label: 'Auto (by VRAM)', value: 'auto' },
  { label: 'Tiny', value: 'tiny' },
  { label: 'Base', value: 'base' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large v3 Turbo', value: 'large-v3-turbo' },
];

type Props = Pick<SettingsSectionProps, 'whisperModel' | 'onWhisperModelChange'>;

export function WhisperSection({ whisperModel, onWhisperModelChange }: Props) {
  // Conditional helper text — D-12 (preserved from v2.0 SettingsForm)
  const helperText =
    whisperModel === 'auto'
      ? 'Auto: model selected based on available VRAM'
      : `Manual: ${whisperModel}`;

  return (
    <div className="space-y-base">
      <h1 className="text-lg font-semibold text-fg tracking-tight">
        Speech-to-Text Model
      </h1>
      <p className="text-sm text-fg-subtle">Choose the speech-to-text model.</p>

      <Field>
        <Field.Label>Model</Field.Label>
        <Field.Control>
          <Select
            value={whisperModel}
            onValueChange={(v) => onWhisperModelChange(v as WhisperModelOption)}
          >
            <SelectTrigger aria-label="Whisper model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHISPER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field.Control>
        <Field.Helper>{helperText}</Field.Helper>
      </Field>
    </div>
  );
}
