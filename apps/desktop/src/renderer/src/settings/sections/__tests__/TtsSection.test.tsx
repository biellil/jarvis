/**
 * @vitest-environment happy-dom
 *
 * TtsSection tests — Phase 53 Plan 03 (STTS-02) + Phase 62 Plan 04 (TTS-OFF-03/04/05)
 *
 * Radix Switch: getByRole('switch') WITHOUT name filter — happy-dom does NOT propagate
 * aria-label from Switch.Root to accessible name predictably (Phase 52-03 STATE.md note).
 * Use fireEvent.click — Radix Switch dispatches via pointer, not native change events
 * (Phase 49 STATE.md: never use fireEvent.change on Radix primitives).
 *
 * Radix Select: items are rendered in the DOM with role="option" even before the popover
 * opens in happy-dom. Use document.querySelector('[value="kokoro"]') as fallback if
 * getByRole('option') doesn't find them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TtsSection } from '../TtsSection';
import type { TtsProviderOption, KokoroDownloadProgress } from '../../../../../shared/ipc-types';

const baseProps = {
  ttsProvider: 'elevenlabs' as TtsProviderOption,
  onTtsProviderChange: vi.fn(),
  ttsApiKey: '',
  onTtsApiKeyChange: vi.fn(),
  ttsVoiceIds: { murf: '', elevenlabs: '', kokoro: '' } as Record<TtsProviderOption, string>,
  onVoiceIdChange: vi.fn(),
  apiKeyError: null,
  streamingTtsEnabled: false,
  onStreamingTtsChange: vi.fn(),
  kokoroLocalOnly: false,
  onKokoroLocalOnlyChange: vi.fn(),
  kokoroDownloadState: null as KokoroDownloadProgress | null,
  onKokoroDownload: vi.fn(),
  onKokoroCancelDownload: vi.fn(),
  kokoroModelCached: false,
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

describe('TtsSection — Kokoro integration (Phase 62 Plan 04 / TTS-OFF-03/04/05)', () => {
  it('provider select contains kokoro option', () => {
    render(<TtsSection {...baseProps} />);
    // Radix Select: open the trigger, then check for kokoro item in expanded list
    const trigger = screen.getByRole('combobox', { name: /TTS provider/i });
    fireEvent.click(trigger);
    // After opening, Radix items are in the DOM
    const kokoroItem =
      screen.queryByText(/kokoro/i) ??
      document.querySelector('[data-value="kokoro"]') ??
      document.querySelector('[value="kokoro"]');
    expect(kokoroItem).not.toBeNull();
  });

  it('API Key field NOT rendered when provider=kokoro', () => {
    render(<TtsSection {...baseProps} ttsProvider="kokoro" />);
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
  });

  it('API Key field IS rendered when provider=murf', () => {
    render(<TtsSection {...baseProps} ttsProvider="murf" />);
    expect(screen.getByLabelText(/api key/i)).toBeTruthy();
  });

  it('API Key field IS rendered when provider=elevenlabs', () => {
    render(<TtsSection {...baseProps} ttsProvider="elevenlabs" />);
    expect(screen.getByLabelText(/api key/i)).toBeTruthy();
  });

  it('local-only toggle IS rendered when provider=kokoro', () => {
    render(<TtsSection {...baseProps} ttsProvider="kokoro" />);
    expect(screen.getByLabelText(/apenas local/i)).toBeTruthy();
  });

  it('local-only toggle NOT rendered when provider=murf', () => {
    render(<TtsSection {...baseProps} ttsProvider="murf" />);
    expect(screen.queryByLabelText(/apenas local/i)).toBeNull();
  });

  it('local-only toggle NOT rendered when provider=elevenlabs', () => {
    render(<TtsSection {...baseProps} ttsProvider="elevenlabs" />);
    expect(screen.queryByLabelText(/apenas local/i)).toBeNull();
  });

  it('shows Kokoro (local) in active badge when provider=kokoro', () => {
    render(<TtsSection {...baseProps} ttsProvider="kokoro" />);
    expect(screen.getByRole('status').textContent).toContain('Kokoro');
  });

  it('KokoroSection rendered when provider=kokoro', () => {
    render(<TtsSection {...baseProps} ttsProvider="kokoro" />);
    // KokoroSection renders "Download modelo" button when not cached
    expect(screen.getByRole('button', { name: /download/i })).toBeTruthy();
  });

  it('KokoroSection NOT rendered when provider=murf', () => {
    render(<TtsSection {...baseProps} ttsProvider="murf" />);
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });
});
