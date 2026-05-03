/**
 * @vitest-environment happy-dom
 *
 * HotkeyRecorder component tests — Phase 34 Plan 01 (SET-02)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HotkeyRecorder } from '../../components/ui';

describe('HotkeyRecorder', () => {
  it('renders label and current value', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    expect(screen.getByText('PTT Hotkey')).toBeTruthy();
    expect(screen.getByDisplayValue('Ctrl+Space')).toBeTruthy();
  });

  it('shows "Record" button in normal state', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    expect(screen.getByText('Record')).toBeTruthy();
  });

  it('enters recording state on Record click', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    fireEvent.click(screen.getByText('Record'));
    expect(screen.getByText('Recording...')).toBeTruthy();
  });

  it('calls onRecorded with accelerator on key combo', () => {
    const onRecorded = vi.fn();
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={onRecorded} />);
    fireEvent.click(screen.getByText('Record'));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: ' ', code: 'Space', ctrlKey: true });
    expect(onRecorded).toHaveBeenCalledWith('Ctrl+Space');
  });

  it('cancels recording on Escape', () => {
    render(<HotkeyRecorder label="PTT Hotkey" value="Ctrl+Space" onRecorded={vi.fn()} />);
    fireEvent.click(screen.getByText('Record'));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByDisplayValue('Ctrl+Space')).toBeTruthy();
  });
});
