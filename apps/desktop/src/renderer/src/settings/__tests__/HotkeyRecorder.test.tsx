/**
 * @vitest-environment happy-dom
 *
 * HotkeyRecorder component tests — Phase 34 Plan 01 (SET-02)
 * Updated in Phase 49 Plan 04 to import from components/ui (Phase 48 primitive).
 *
 * The Phase 48 HotkeyRecorder renders a div[role="button"] chip instead of
 * a native <input> — tests updated accordingly.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HotkeyRecorder } from '../../components/ui';

describe('HotkeyRecorder', () => {
  it('renders label and current value', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    expect(screen.getByText('PTT Hotkey')).toBeTruthy();
    // Phase 48: value is displayed as text in a span inside a div[role="button"] chip.
    // The chip also has an aria-live region with the same text, so getAllByText is used.
    const matches = screen.getAllByText('Ctrl+Space');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Record" button in normal state', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    expect(screen.getByText('Record')).toBeTruthy();
  });

  it('enters recording state on Record click', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    fireEvent.click(screen.getByText('Record'));
    // Phase 48: recording state shows "Press keys… Esc to cancel" in the chip
    expect(screen.getByText(/Press keys/i)).toBeTruthy();
  });

  it('calls onRecorded with accelerator on key combo', () => {
    const onRecorded = vi.fn();
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={onRecorded} />);
    fireEvent.click(screen.getByText('Record'));
    // Phase 48: keyboard events are handled on the div[role="button"] chip.
    // The chip's accessible name comes from aria-labelledby pointing to the label element.
    const chip = screen.getByRole('button', { name: /PTT Hotkey/i });
    fireEvent.keyDown(chip, { key: ' ', code: 'Space', ctrlKey: true });
    expect(onRecorded).toHaveBeenCalledWith('Ctrl+Space');
  });

  it('cancels recording on Escape', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    fireEvent.click(screen.getByText('Record'));
    const chip = screen.getByRole('button', { name: /PTT Hotkey/i });
    fireEvent.keyDown(chip, { key: 'Escape' });
    // After Escape, should return to showing current value
    const matches = screen.getAllByText('Ctrl+Space');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
