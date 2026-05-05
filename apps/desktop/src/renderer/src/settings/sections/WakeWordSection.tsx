/**
 * WakeWordSection — Settings section for wake word sensitivity (SEXT-03).
 *
 * Slider: 0.0–1.0, step 0.05. Real-time IPC apply (no Save button needed).
 * Follows AlwaysListeningSection pattern exactly.
 */
import { Slider, Button, Field } from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';

const WAKE_WORD_THRESHOLD_MIN = 0.0;
const WAKE_WORD_THRESHOLD_MAX = 1.0;
const WAKE_WORD_THRESHOLD_STEP = 0.05;
const WAKE_WORD_THRESHOLD_DEFAULT = 0.5;

type Props = Pick<
  SettingsSectionProps,
  'wakeWordThreshold' | 'onWakeWordThresholdChange'
>;

export function WakeWordSection({ wakeWordThreshold, onWakeWordThresholdChange }: Props) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg tracking-tight">Wake Word Detection</h1>
      <p className="text-sm text-fg-subtle mt-sm mb-lg">
        Tune how sensitive JARVIS is to the wake word "Hey JARVIS".
      </p>

      <Field>
        <Field.Label>Detection Sensitivity</Field.Label>
        <Field.Control>
          <Slider
            min={WAKE_WORD_THRESHOLD_MIN}
            max={WAKE_WORD_THRESHOLD_MAX}
            step={WAKE_WORD_THRESHOLD_STEP}
            value={[wakeWordThreshold]}
            onValueChange={(vals) => void onWakeWordThresholdChange(vals[0]!)}
            aria-label="Wake word detection sensitivity"
            aria-valuemin={WAKE_WORD_THRESHOLD_MIN}
            aria-valuemax={WAKE_WORD_THRESHOLD_MAX}
            aria-valuenow={wakeWordThreshold}
            aria-valuetext={`${wakeWordThreshold.toFixed(2)} sensitivity`}
          />
        </Field.Control>
        <Field.Helper>
          Lower = fewer false negatives (easier to trigger), more false positives.
          Higher = fewer false positives, but JARVIS may miss "Hey JARVIS" sometimes.
          Typical: 0.4–0.6.
        </Field.Helper>
      </Field>

      <p className="text-xs text-fg-subtle mt-sm">{wakeWordThreshold.toFixed(2)}</p>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onWakeWordThresholdChange(WAKE_WORD_THRESHOLD_DEFAULT)}
        className="mt-base"
      >
        Reset to Default (0.50)
      </Button>
    </div>
  );
}
