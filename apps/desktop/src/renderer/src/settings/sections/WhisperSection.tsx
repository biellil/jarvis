import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Field,
  Button,
  Progress,
} from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';
import type { WhisperModelOption } from '../../../../shared/ipc-types';

const WHISPER_OPTIONS: { label: string; value: WhisperModelOption }[] = [
  { label: 'Tiny (~75 MB)',            value: 'tiny' },
  { label: 'Base (~142 MB)',           value: 'base' },
  { label: 'Small (~244 MB)',          value: 'small' },
  { label: 'Medium (~1.5 GB)',         value: 'medium' },
  { label: 'Large v3 Turbo (~809 MB)', value: 'large-v3-turbo' },
];

// Short labels used in progress text (UI-SPEC Copywriting Contract)
const MODEL_PROGRESS_LABELS: Record<string, string> = {
  tiny: 'Tiny',
  base: 'Base',
  small: 'Small',
  medium: 'Medium',
  'large-v3-turbo': 'Large v3 Turbo',
};

function toMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

interface WhisperDownloadState {
  status: 'downloading' | 'success' | 'error';
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  errorMessage?: string;
}

type Props = Pick<SettingsSectionProps, 'whisperModel' | 'onWhisperModelChange'> & {
  downloadState?: WhisperDownloadState | null;
  onTryAgain?: () => void;
};

export function WhisperSection({
  whisperModel,
  onWhisperModelChange,
  downloadState,
  onTryAgain,
}: Props) {
  // Conditional helper text — D-12 (preserved from v2.0 SettingsForm)
  // Success state updates helper to "Model: {name} (ready)" per D-07 / UI-SPEC
  // Phase 68 D-03: 'auto' branch removed — dropdown is explicit-only
  let helperText: string;
  if (downloadState?.status === 'success') {
    const modelLabel = MODEL_PROGRESS_LABELS[whisperModel] ?? whisperModel;
    helperText = `Model: ${modelLabel} (ready)`;
  } else {
    helperText = `Manual: ${whisperModel}`;
  }

  // Progress text: "Downloading {modelLabel}… {N}% ({downloaded} / {total} MB)"
  const progressText =
    downloadState && downloadState.status === 'downloading'
      ? `Downloading ${MODEL_PROGRESS_LABELS[whisperModel] ?? whisperModel}… ${downloadState.percent}% (${toMb(downloadState.downloadedBytes)} / ${toMb(downloadState.totalBytes)} MB)`
      : null;

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
            disabled={downloadState?.status === 'downloading'}
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

        {/* Progress bar — visible only during/after download, hidden on error and idle */}
        {downloadState && downloadState.status !== 'error' && (
          <div className="mt-md space-y-xs">
            <Progress
              variant="linear"
              value={downloadState.status === 'success' ? 100 : downloadState.percent}
              status={downloadState.status === 'success' ? 'success' : 'progress'}
              size="sm"
              label="Download progress"
            />
            {progressText && (
              <p className="text-xs text-fg-subtle">{progressText}</p>
            )}
          </div>
        )}

        {/* Error state: error text + Try again button side by side */}
        {downloadState?.status === 'error' && (
          <div className="flex items-center gap-sm mt-xs">
            <span className="text-xs text-destructive">
              Couldn&apos;t download. Check your connection and try again.
            </span>
            <Button variant="ghost" size="sm" onClick={onTryAgain}>
              Try again
            </Button>
          </div>
        )}

        {/* Helper text — hidden when error (error row takes precedence) */}
        {downloadState?.status !== 'error' && (
          <Field.Helper>{helperText}</Field.Helper>
        )}
      </Field>
    </div>
  );
}
