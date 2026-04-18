import { useState } from 'react';

export interface HotkeyRecorderProps {
  label: string;
  value: string;
  onRecorded: (accelerator: string) => void;
  disabled?: boolean;
}

const KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Enter': 'Return',
  'Backspace': 'BackSpace',
  'Delete': 'Delete',
  'Escape': 'Esc',
  'Tab': 'Tab',
  'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
  'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
  'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
};

export function HotkeyRecorder({ label, value, onRecorded, disabled }: HotkeyRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = () => {
    if (!disabled) setIsRecording(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isRecording) return;

    // Cancel on Escape
    if (e.key === 'Escape') {
      setIsRecording(false);
      return;
    }

    // Build Electron accelerator from key event
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Cmd');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // Get the main key
    const mapped = KEY_MAP[e.key];
    const rawKey = mapped ?? (e.key.length === 1 ? e.key.toUpperCase() : null);

    // Only emit if we have modifier(s) + a valid key
    if (rawKey && parts.length > 0) {
      parts.push(rawKey);
      const accelerator = parts.join('+');
      onRecorded(accelerator);
      setIsRecording(false);
    }
  };

  const displayValue = isRecording ? 'Press any key combination...' : value;

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-white/70">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={displayValue}
          onKeyDown={handleKeyDown}
          aria-label={`${label}, currently ${value}`}
          className={[
            'flex-1 px-3 py-2 rounded text-sm font-medium',
            'bg-gray-800 text-white border',
            isRecording
              ? 'border-cyan-500/80 shadow-[0_0_8px_rgba(6,182,212,0.3)] text-white/70 cursor-default'
              : 'border-white/20 cursor-not-allowed',
          ].join(' ')}
        />
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled || isRecording}
          className={[
            'px-4 py-2 rounded text-sm font-medium border transition-colors',
            'border-white/20 text-white',
            disabled || isRecording
              ? 'opacity-50 cursor-not-allowed bg-gray-800'
              : 'bg-gray-800 hover:border-white/40 hover:bg-gray-700',
          ].join(' ')}
        >
          {isRecording ? 'Recording...' : 'Record'}
        </button>
      </div>
      {isRecording && (
        <p role="status" className="text-xs text-cyan-500">
          Press any key combination... (Esc to cancel)
        </p>
      )}
    </div>
  );
}
