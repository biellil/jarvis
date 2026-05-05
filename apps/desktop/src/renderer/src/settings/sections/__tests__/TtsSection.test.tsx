/**
 * @vitest-environment happy-dom
 *
 * TtsSection tests — Phase 53 Plan 03 (STTS-02)
 *
 * Radix Switch: getByRole('switch') WITHOUT name filter — happy-dom does NOT propagate
 * aria-label from Switch.Root to accessible name predictably (Phase 52-03 STATE.md note).
 * Use fireEvent.click — Radix Switch dispatches via pointer, not native change events
 * (Phase 49 STATE.md: never use fireEvent.change on Radix primitives).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TtsSection } from '../TtsSection';
import type { TtsProviderOption } from '../../../../../shared/ipc-types';

const baseProps = {
  ttsProvider: 'elevenlabs' as TtsProviderOption,
  onTtsProviderChange: vi.fn(),
  ttsApiKey: '',
  onTtsApiKeyChange: vi.fn(),
  ttsVoiceIds: { murf: '', elevenlabs: '' } as Record<TtsProviderOption, string>,
  onVoiceIdChange: vi.fn(),
  apiKeyError: null,
  streamingTtsEnabled: false,
  onStreamingTtsChange: vi.fn(),
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TtsSection — Streaming TTS toggle (Phase 53 Plan 03 / STTS-02)', () => {
  it('renders Switch in unchecked state when streamingTtsEnabled=false', () => {
    render(<TtsSection {...baseProps} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('renders Switch in checked state when streamingTtsEnabled=true', () => {
    render(<TtsSection {...{ ...baseProps, streamingTtsEnabled: true }} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking the Switch calls onStreamingTtsChange with true (toggle from false)', () => {
    render(<TtsSection {...baseProps} />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    expect(baseProps.onStreamingTtsChange).toHaveBeenCalledWith(true);
  });

  it('shows the helper text "Begins playback at the first complete sentence"', () => {
    render(<TtsSection {...baseProps} />);
    expect(
      screen.getByText(/Begins playback at the first complete sentence/i),
    ).toBeTruthy();
  });

  it('shows the "Streaming TTS" label', () => {
    render(<TtsSection {...baseProps} />);
    expect(screen.getByText(/Streaming TTS/i)).toBeTruthy();
  });
});
