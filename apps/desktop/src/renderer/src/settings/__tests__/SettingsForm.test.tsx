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
});
const mockSettingsSave = vi.fn().mockResolvedValue({ success: true });
const mockSettingsClose = vi.fn();

// Assign settings directly to the window object rather than replacing it,
// to avoid breaking happy-dom's DOM container detection.
(window as unknown as Record<string, unknown>).settings = {
  get: mockSettingsGet,
  save: mockSettingsSave,
  close: mockSettingsClose,
};

describe('SettingsForm', () => {
  beforeEach(() => {
    mockSettingsGet.mockReset();
    mockSettingsGet.mockResolvedValue({
      pttHotkey: 'Ctrl+Space',
      ttsProvider: 'elevenlabs',
      ttsApiKey: '',
      whisperModelOverride: 'auto',
    });
    mockSettingsSave.mockReset();
    mockSettingsSave.mockResolvedValue({ success: true });
    mockSettingsClose.mockReset();
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
});
