import { HotkeyRecorder, Field } from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';

export function PttSection({
  pttHotkey,
  onPttHotkeyChange,
}: Pick<SettingsSectionProps, 'pttHotkey' | 'onPttHotkeyChange'>) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg tracking-tight">Push-to-Talk Settings</h1>
      <p className="text-sm text-fg-subtle mt-sm mb-lg">Set the global hotkey for push-to-talk.</p>

      <Field>
        <Field.Label>Hotkey</Field.Label>
        <Field.Control>
          <HotkeyRecorder
            label="Hotkey"
            value={pttHotkey}
            onRecorded={onPttHotkeyChange}
          />
        </Field.Control>
      </Field>
    </div>
  );
}
