import * as React from 'react';
import { Button } from './button';
import { cn } from '@/lib/cn';

/**
 * HotkeyRecorder primitive — UI-SPEC §"7. HotkeyRecorder"
 *
 * Extracted from settings/HotkeyRecorder.tsx with the v2.0 prop API
 * preserved verbatim (Phase 49 will swap the import without changing
 * SettingsForm.tsx call sites). The KEY_MAP and Electron accelerator
 * construction (`Ctrl+Cmd+Shift+Alt+<Key>`) match the legacy file.
 *
 * Re-skinned to design-system tokens:
 * - Recording state: border-accent-ring, bg-accent-soft, animated pulse dot.
 * - Modifier-only validation surfaces inline error using UI-SPEC copy.
 * - motion-safe:animate-pulse honors prefers-reduced-motion.
 *
 * The legacy `apps/desktop/src/renderer/src/settings/HotkeyRecorder.tsx`
 * is left in place; Phase 49 owns deletion after migrating the import.
 */

export interface HotkeyRecorderProps {
  label: string;
  value: string;
  onRecorded: (accelerator: string) => void;
  disabled?: boolean;
}

const KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Backspace: 'BackSpace',
  Delete: 'Delete',
  Escape: 'Esc',
  Tab: 'Tab',
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
};

const MODIFIER_ONLY_ERROR =
  'Hotkey must include a non-modifier key (e.g., Ctrl+Space).';

export function HotkeyRecorder({
  label,
  value,
  onRecorded,
  disabled,
}: HotkeyRecorderProps) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [justRecorded, setJustRecorded] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const labelId = React.useId();
  const errorId = `${labelId}-error`;
  const liveId = `${labelId}-live`;

  // Track keys-pressed during a recording session so we can detect
  // "user released everything without pressing a non-modifier" cases.
  const sawNonModifierRef = React.useRef(false);
  const sawAnyKeyRef = React.useRef(false);

  React.useEffect(() => {
    if (!justRecorded) return;
    const t = window.setTimeout(() => setJustRecorded(false), 240);
    return () => window.clearTimeout(t);
  }, [justRecorded]);

  // Auto-clear modifier-only error after 3 seconds (UI-SPEC §7).
  React.useEffect(() => {
    if (!errorMessage) return;
    const t = window.setTimeout(() => setErrorMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [errorMessage]);

  const startRecording = () => {
    if (disabled) return;
    sawNonModifierRef.current = false;
    sawAnyKeyRef.current = false;
    setErrorMessage(null);
    setIsRecording(true);
  };

  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // When NOT recording, Space/Enter starts recording (UI-SPEC §7 a11y).
    if (!isRecording) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        startRecording();
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Cancel on Escape — restore previous value, no commit.
    if (e.key === 'Escape') {
      setIsRecording(false);
      return;
    }

    sawAnyKeyRef.current = true;

    // Build Electron accelerator from key event (preserved logic).
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Cmd');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    const mapped = KEY_MAP[e.key];
    const rawKey = mapped ?? (e.key.length === 1 ? e.key.toUpperCase() : null);

    // NOTE: UI-SPEC says "Enter commits"; the existing impl emits as soon as a
    // valid (modifier+key) combo is pressed, which is more responsive. We
    // preserve that behavior here. Explicit Enter-commit is a future
    // enhancement.
    if (rawKey && parts.length > 0) {
      sawNonModifierRef.current = true;
      parts.push(rawKey);
      const accelerator = parts.join('+');
      onRecorded(accelerator);
      setIsRecording(false);
      setJustRecorded(true);
    }
  };

  const handleChipKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRecording) return;
    // When all modifiers are released and no non-modifier was ever
    // pressed during the session, surface a modifier-only error.
    const stillHeld = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
    if (
      !stillHeld &&
      sawAnyKeyRef.current &&
      !sawNonModifierRef.current
    ) {
      setErrorMessage(MODIFIER_ONLY_ERROR);
      setIsRecording(false);
      sawAnyKeyRef.current = false;
    }
  };

  return (
    <div className="space-y-1">
      <label
        id={labelId}
        className="block text-xs font-medium text-fg-muted"
      >
        {label}
      </label>
      <div className="flex gap-sm">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Record hotkey, current value: ${value}`}
          aria-labelledby={labelId}
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={errorMessage ? true : undefined}
          aria-disabled={disabled || undefined}
          onKeyDown={handleChipKeyDown}
          onKeyUp={handleChipKeyUp}
          onClick={!isRecording ? startRecording : undefined}
          className={cn(
            'flex-1 flex items-center gap-sm rounded-md border bg-surface px-md py-sm text-sm transition-colors duration-base ease-standard outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            isRecording
              ? 'border-accent-ring border-2 bg-accent-soft text-fg cursor-default'
              : justRecorded
                ? 'border-accent text-fg cursor-pointer'
                : 'border-border text-fg hover:border-border-hover cursor-pointer',
            disabled && 'bg-surface/50 border-white/5 text-fg-disabled cursor-not-allowed',
          )}
        >
          {isRecording && (
            <span
              className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse"
              aria-hidden
            />
          )}
          <span
            className={cn(
              'flex-1 truncate',
              value && !isRecording ? 'font-mono' : 'text-fg-subtle text-xs',
            )}
          >
            {isRecording
              ? 'Press keys… Esc to cancel'
              : value
                ? value
                : 'Click to record'}
          </span>
          {/* Live region announces newly captured combo (UI-SPEC §7 a11y) */}
          <span id={liveId} aria-live="polite" className="sr-only">
            {value}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={startRecording}
          disabled={disabled || isRecording}
        >
          {isRecording ? 'Recording…' : 'Record'}
        </Button>
      </div>
      {errorMessage && (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-destructive flex items-center gap-xs"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
