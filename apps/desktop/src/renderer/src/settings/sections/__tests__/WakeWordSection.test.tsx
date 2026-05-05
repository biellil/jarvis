/**
 * @vitest-environment happy-dom
 *
 * WakeWordSection tests — Phase 52 (SEXT-03)
 *
 * Radix Slider: getByRole('slider') + aria-valuenow for value; keyboard arrow keys for change.
 * Pattern mirrors AlwaysListeningSection tests in SettingsForm.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WakeWordSection } from '../WakeWordSection';

const defaultProps = {
  wakeWordThreshold: 0.5,
  onWakeWordThresholdChange: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WakeWordSection — threshold slider (SEXT-03)', () => {
  it('renders slider with current wakeWordThreshold as aria-valuenow', () => {
    render(<WakeWordSection {...defaultProps} />);
    // Radix Slider Thumb renders role="slider"; aria-label is on the Root but may not
    // propagate to Thumb accessible name in happy-dom. Use getByRole without name filter,
    // consistent with SettingsForm.test.tsx VAD slider tests.
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5');
  });

  it('calls onWakeWordThresholdChange on arrow key interaction', () => {
    render(<WakeWordSection {...defaultProps} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(defaultProps.onWakeWordThresholdChange).toHaveBeenCalled();
  });

  it('Reset button calls onWakeWordThresholdChange with 0.5', () => {
    render(<WakeWordSection {...{ ...defaultProps, wakeWordThreshold: 0.8 }} />);
    const resetButton = screen.getByRole('button', { name: /reset to default/i });
    fireEvent.click(resetButton);
    expect(defaultProps.onWakeWordThresholdChange).toHaveBeenCalledWith(0.5);
  });
});
