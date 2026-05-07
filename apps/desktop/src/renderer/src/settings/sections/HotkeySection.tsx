import { HotkeyRecorder, Field } from '../../components/ui';
import type { SettingsSectionProps } from '../SettingsLayout';

export function HotkeySection({
  screenshotHotkey,
  onScreenshotHotkeyChange,
}: Pick<SettingsSectionProps, 'screenshotHotkey' | 'onScreenshotHotkeyChange'>) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg tracking-tight">Vision Hotkeys</h1>
      <p className="text-sm text-fg-subtle mt-sm mb-lg">
        Configure the global hotkey to capture your screen and start a vision conversation.
      </p>

      <Field>
        <Field.Label>Screenshot Hotkey</Field.Label>
        <Field.Helper>
          Press this hotkey anywhere to capture the screen and attach it to the chat input.
        </Field.Helper>
        <Field.Control>
          <HotkeyRecorder
            label="Screenshot Hotkey"
            value={screenshotHotkey}
            onRecorded={onScreenshotHotkeyChange}
          />
        </Field.Control>
      </Field>
    </div>
  );
}
