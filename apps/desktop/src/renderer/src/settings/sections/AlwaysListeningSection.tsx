import { Slider, Button, Field } from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';

const VAD_THRESHOLD_MIN_MS = 300;
const VAD_THRESHOLD_MAX_MS = 800;
const VAD_THRESHOLD_STEP_MS = 50;

type Props = Pick<
  SettingsSectionProps,
  'vadThresholdMs' | 'onVadThresholdChange' | 'onVadThresholdReset'
>;

export function AlwaysListeningSection({
  vadThresholdMs,
  onVadThresholdChange,
  onVadThresholdReset,
}: Props) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg tracking-tight">Voice Activity Detection</h1>
      <p className="text-sm text-fg-subtle mt-sm mb-lg">Tune voice activity detection sensitivity.</p>

      <Field>
        <Field.Label>Silence Threshold</Field.Label>
        <Field.Control>
          <Slider
            min={VAD_THRESHOLD_MIN_MS}
            max={VAD_THRESHOLD_MAX_MS}
            step={VAD_THRESHOLD_STEP_MS}
            value={[vadThresholdMs]}
            onValueChange={(vals) => void onVadThresholdChange(vals[0]!)}
            aria-label="VAD silence threshold in milliseconds"
            aria-valuemin={VAD_THRESHOLD_MIN_MS}
            aria-valuemax={VAD_THRESHOLD_MAX_MS}
            aria-valuenow={vadThresholdMs}
            aria-valuetext={`${vadThresholdMs} milliseconds`}
          />
        </Field.Control>
        <Field.Helper>
          Silence threshold after speech ends. Lower = more responsive but may trigger on
          breathing/clicks. Higher = patient but may miss end of phrase. Typical: 400–600ms.
        </Field.Helper>
      </Field>

      <p className="text-xs text-fg-subtle mt-sm">{vadThresholdMs} ms</p>

      <Button
        variant="ghost"
        size="sm"
        onClick={onVadThresholdReset}
        className="mt-base"
      >
        Reset to Default (500ms)
      </Button>
    </div>
  );
}
