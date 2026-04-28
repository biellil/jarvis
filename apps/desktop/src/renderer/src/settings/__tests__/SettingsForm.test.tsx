/**
 * @vitest-environment happy-dom
 *
 * SettingsForm component tests — Phase 34 Plan 01 (SET-01, SET-02, SET-03, SET-04)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SettingsForm } from '../SettingsForm';

const mockSettingsGet = vi.fn().mockResolvedValue({
  pttHotkey: 'Ctrl+Space',
  ttsProvider: 'elevenlabs',
  ttsApiKey: '',
  whisperModelOverride: 'auto',
  // Phase 40 (VLISTEN-04) — settings:get retorna vadSilenceThresholdMs.
  vadSilenceThresholdMs: 500,
  // QUICK-260427-tjc — settings:get retorna ttsVoiceIds per-provider.
  ttsVoiceIds: { murf: '', elevenlabs: '' },
});
const mockSettingsSave = vi.fn().mockResolvedValue({ success: true });
const mockSettingsClose = vi.fn();
// Phase 40 (VLISTEN-04) — runtime apply do VAD slider via IPC.
const mockSettingsSetVadThreshold = vi
  .fn()
  .mockResolvedValue({ success: true, clampedMs: 500 });

// Assign settings directly to the window object rather than replacing it,
// to avoid breaking happy-dom's DOM container detection.
(window as unknown as Record<string, unknown>).settings = {
  get: mockSettingsGet,
  save: mockSettingsSave,
  close: mockSettingsClose,
  setVadThreshold: mockSettingsSetVadThreshold,
};

describe('SettingsForm', () => {
  beforeEach(() => {
    mockSettingsGet.mockReset();
    mockSettingsGet.mockResolvedValue({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'elevenlabs',
      ttsApiKey: '',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 500,
      ttsVoiceIds: { murf: '', elevenlabs: '' },
    });
    mockSettingsSave.mockReset();
    mockSettingsSave.mockResolvedValue({ success: true });
    mockSettingsClose.mockReset();
    mockSettingsSetVadThreshold.mockReset();
    mockSettingsSetVadThreshold.mockResolvedValue({ success: true, clampedMs: 500 });
    cleanup();
  });

  it('renders without crashing', () => {
    render(<SettingsForm />);
    expect(document.body).toBeTruthy();
  });

  it('shows "Push-to-Talk" section heading', () => {
    render(<SettingsForm />);
    expect(screen.getByText(/Push-to-Talk/i)).toBeTruthy();
  });

  it('shows "Text-to-Speech" section heading', () => {
    render(<SettingsForm />);
    expect(screen.getByText(/Text-to-Speech/i)).toBeTruthy();
  });

  it('shows "Speech-to-Text Model" section heading', () => {
    render(<SettingsForm />);
    expect(screen.getByText(/Speech-to-Text Model/i)).toBeTruthy();
  });

  it('shows "Save" button', () => {
    render(<SettingsForm />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('shows "Cancel" button', () => {
    render(<SettingsForm />);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('after window.settings.get() resolves, form fields are populated with loaded values', async () => {
    render(<SettingsForm />);
    await waitFor(() => {
      expect(mockSettingsGet).toHaveBeenCalled();
    });
    // After data loads, pttHotkey value should be displayed
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ctrl+Space')).toBeTruthy();
    });
  });

  it('clicking "Save" calls window.settings.save() with form data', async () => {
    mockSettingsGet.mockResolvedValue({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'elevenlabs',
      ttsApiKey: 'test-api-key',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 500,
      ttsVoiceIds: { murf: '', elevenlabs: '' },
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockSettingsSave).toHaveBeenCalled();
    });
  });

  it('clicking "Cancel" calls window.settings.close()', async () => {
    render(<SettingsForm />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockSettingsClose).toHaveBeenCalled();
  });

  // ============================================
  // Phase 40 (VLISTEN-04) — Always-Listening VAD slider
  // ============================================

  it('shows "Always-Listening" section heading', () => {
    render(<SettingsForm />);
    expect(screen.getByText('Always-Listening')).toBeTruthy();
  });

  it('shows "VAD Silence Threshold" label', () => {
    render(<SettingsForm />);
    expect(screen.getByText('VAD Silence Threshold')).toBeTruthy();
  });

  it('renders VAD slider with range 300-800 step 50 default 500', async () => {
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const slider = screen.getByLabelText(
      /VAD silence threshold in milliseconds/i,
    ) as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('300');
    expect(slider.max).toBe('800');
    expect(slider.step).toBe('50');
    await waitFor(() => expect(slider.value).toBe('500'));
  });

  it('loads vadSilenceThresholdMs from settings:get and reflects in slider value', async () => {
    mockSettingsGet.mockResolvedValueOnce({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'elevenlabs',
      ttsApiKey: '',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 650,
      ttsVoiceIds: { murf: '', elevenlabs: '' },
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const slider = screen.getByLabelText(
      /VAD silence threshold in milliseconds/i,
    ) as HTMLInputElement;
    await waitFor(() => expect(slider.value).toBe('650'));
    // Value display label reflete o valor carregado.
    expect(screen.getByText(/650 ms/i)).toBeTruthy();
  });

  it('falls back to 500ms default when vadSilenceThresholdMs is missing (v1.8 upgrade path)', async () => {
    mockSettingsGet.mockResolvedValueOnce({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'elevenlabs',
      ttsApiKey: '',
      whisperModelOverride: 'auto',
      // intentionally missing vadSilenceThresholdMs
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const slider = screen.getByLabelText(
      /VAD silence threshold in milliseconds/i,
    ) as HTMLInputElement;
    await waitFor(() => expect(slider.value).toBe('500'));
  });

  it('moving the slider invokes window.settings.setVadThreshold with new value', async () => {
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const slider = screen.getByLabelText(
      /VAD silence threshold in milliseconds/i,
    ) as HTMLInputElement;

    fireEvent.change(slider, { target: { value: '700' } });

    await waitFor(() =>
      expect(mockSettingsSetVadThreshold).toHaveBeenCalledWith(700),
    );
  });

  it('clicking "Reset to Default (500ms)" returns slider to 500 and applies via IPC', async () => {
    mockSettingsGet.mockResolvedValueOnce({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'elevenlabs',
      ttsApiKey: '',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 750,
      ttsVoiceIds: { murf: '', elevenlabs: '' },
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const slider = screen.getByLabelText(
      /VAD silence threshold in milliseconds/i,
    ) as HTMLInputElement;
    await waitFor(() => expect(slider.value).toBe('750'));

    fireEvent.click(screen.getByText(/Reset to Default \(500ms\)/i));

    await waitFor(() => expect(slider.value).toBe('500'));
    expect(mockSettingsSetVadThreshold).toHaveBeenCalledWith(500);
  });

  it('value display label updates as user moves slider', async () => {
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const slider = screen.getByLabelText(
      /VAD silence threshold in milliseconds/i,
    ) as HTMLInputElement;

    fireEvent.change(slider, { target: { value: '350' } });
    await waitFor(() => {
      expect(screen.getByText(/350 ms/i)).toBeTruthy();
    });
  });

  // ============================================
  // QUICK-260427-tjc — Voice ID per-provider UI
  // ============================================

  it('Test A — Voice ID input mostra valor de murf quando provider ativo é murf', async () => {
    mockSettingsGet.mockResolvedValueOnce({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'murf',
      ttsApiKey: 'k',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 500,
      ttsVoiceIds: { murf: 'pt-BR-yago', elevenlabs: '' },
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const voiceIdInput = await waitFor(
      () => screen.getByLabelText(/TTS voice ID/i) as HTMLInputElement,
    );
    await waitFor(() => expect(voiceIdInput.value).toBe('pt-BR-yago'));
  });

  it('Test B — trocar provider de murf para elevenlabs muda o valor exibido no Voice ID input', async () => {
    mockSettingsGet.mockResolvedValueOnce({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'murf',
      ttsApiKey: 'k',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 500,
      ttsVoiceIds: { murf: 'pt-BR-yago', elevenlabs: '' },
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const voiceIdInput = await waitFor(
      () => screen.getByLabelText(/TTS voice ID/i) as HTMLInputElement,
    );
    await waitFor(() => expect(voiceIdInput.value).toBe('pt-BR-yago'));

    // Troca provider para elevenlabs — deve mostrar string vazia (valor de elevenlabs no mock)
    const providerSelect = screen.getByLabelText(/TTS provider/i) as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: 'elevenlabs' } });

    await waitFor(() => expect(voiceIdInput.value).toBe(''));
  });

  it('Test C — editar Voice ID + Save envia ttsVoiceIds com novo valor para o provider ativo', async () => {
    mockSettingsGet.mockResolvedValueOnce({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'murf',
      ttsApiKey: 'my-key',
      whisperModelOverride: 'auto',
      vadSilenceThresholdMs: 500,
      ttsVoiceIds: { murf: '', elevenlabs: '' },
    });
    render(<SettingsForm />);
    await waitFor(() => expect(mockSettingsGet).toHaveBeenCalled());
    const voiceIdInput = await waitFor(
      () => screen.getByLabelText(/TTS voice ID/i) as HTMLInputElement,
    );

    fireEvent.change(voiceIdInput, { target: { value: 'pt-BR-gustavo' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockSettingsSave).toHaveBeenCalled());
    const savedPayload = mockSettingsSave.mock.calls[0]?.[0] as {
      ttsVoiceIds?: Record<string, string>;
    };
    expect(savedPayload.ttsVoiceIds).toEqual({
      murf: 'pt-BR-gustavo',
      elevenlabs: '',
    });
  });
});
