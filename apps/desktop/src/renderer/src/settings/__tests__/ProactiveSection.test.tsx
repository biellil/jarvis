/**
 * ProactiveSection tests — Phase 67 (PROACT-04, D-10, D-13, D-17)
 *
 * @vitest-environment happy-dom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProactiveSection } from '../sections/ProactiveSection';
import type { QuietHoursConfig, FolderWatchConfig, DailySummaryConfig } from '../../../../shared/ipc-types';

// ---------------------------------------------------------------------------
// Default props helpers
// ---------------------------------------------------------------------------

const defaultQuietHours: QuietHoursConfig = { enabled: false, start: '22:00', end: '08:00' };
const defaultFolderWatch: FolderWatchConfig = { enabled: false, path: '' };
const defaultDailySummary: DailySummaryConfig = { enabled: true, time: '09:00' };

function makeProps(overrides: {
  quietHours?: Partial<QuietHoursConfig>;
  folderWatch?: Partial<FolderWatchConfig>;
  dailySummary?: Partial<DailySummaryConfig>;
  onQuietHoursChange?: (c: QuietHoursConfig) => Promise<void>;
  onFolderWatchChange?: (c: FolderWatchConfig) => Promise<void>;
  onDailySummaryChange?: (c: DailySummaryConfig) => Promise<void>;
  _testPathError?: string;
} = {}) {
  return {
    quietHours: { ...defaultQuietHours, ...overrides.quietHours },
    onQuietHoursChange: overrides.onQuietHoursChange ?? vi.fn().mockResolvedValue(undefined),
    folderWatch: { ...defaultFolderWatch, ...overrides.folderWatch },
    onFolderWatchChange: overrides.onFolderWatchChange ?? vi.fn().mockResolvedValue(undefined),
    dailySummary: { ...defaultDailySummary, ...overrides.dailySummary },
    onDailySummaryChange: overrides.onDailySummaryChange ?? vi.fn().mockResolvedValue(undefined),
    _testPathError: overrides._testPathError,
  };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProactiveSection', () => {
  it('renders "Notificações proativas" section heading', () => {
    render(<ProactiveSection {...makeProps()} />);
    // Section title must be present
    expect(screen.getByText('Notificações proativas')).toBeDefined();
    // Section must have role="region" with accessible label
    expect(screen.getByRole('region', { name: /notificações proativas/i })).toBeDefined();
  });

  it('quiet hours time inputs are disabled when quietHoursEnabled is false', () => {
    render(<ProactiveSection {...makeProps({ quietHours: { enabled: false } })} />);
    const startInput = screen.getByLabelText(/início do horário silencioso/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/fim do horário silencioso/i) as HTMLInputElement;
    expect(startInput.disabled).toBe(true);
    expect(endInput.disabled).toBe(true);
  });

  it('quiet hours time inputs are enabled when quietHoursEnabled is true', () => {
    render(<ProactiveSection {...makeProps({ quietHours: { enabled: true } })} />);
    const startInput = screen.getByLabelText(/início do horário silencioso/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/fim do horário silencioso/i) as HTMLInputElement;
    expect(startInput.disabled).toBe(false);
    expect(endInput.disabled).toBe(false);
  });

  it('folder path input is disabled when folderWatchEnabled is false', () => {
    render(<ProactiveSection {...makeProps({ folderWatch: { enabled: false, path: '' } })} />);
    const pathInput = screen.getByLabelText(/caminho da pasta monitorada/i) as HTMLInputElement;
    expect(pathInput.disabled).toBe(true);
  });

  it('shows "Pasta não encontrada" Field.Error when _testPathError is set', () => {
    render(
      <ProactiveSection
        {...makeProps({
          folderWatch: { enabled: true, path: '/nonexistent' },
          _testPathError: 'Pasta não encontrada',
        })}
      />,
    );
    expect(screen.getByText('Pasta não encontrada')).toBeDefined();
  });

  it('daily summary time input is disabled when dailySummaryEnabled is false', () => {
    render(
      <ProactiveSection
        {...makeProps({ dailySummary: { enabled: false, time: '09:00' } })}
      />,
    );
    const timeInput = screen.getByLabelText(/horário do resumo diário/i) as HTMLInputElement;
    expect(timeInput.disabled).toBe(true);
  });
});
