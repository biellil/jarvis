/**
 * @vitest-environment happy-dom
 *
 * KokoroSection tests — Phase 62 Plan 04 (TTS-OFF-04)
 *
 * Tests cover: download button, progress bar, retry on error, cancel, success state.
 * Mirrors WhisperSection test pattern (D-12).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KokoroSection } from '../KokoroSection.js';
import type { KokoroDownloadProgress } from '../../../../../shared/ipc-types.js';

const defaultProps = {
  modelCached: false,
  downloadState: null as KokoroDownloadProgress | null,
  onDownload: vi.fn(),
  onCancelDownload: vi.fn(),
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KokoroSection', () => {
  it('shows not-downloaded status when modelCached=false and no downloadState', () => {
    render(<KokoroSection {...defaultProps} />);
    expect(screen.getByText(/not downloaded|não baixado/i)).toBeTruthy();
  });

  it('renders Download button when modelCached=false and downloadState=null', () => {
    render(<KokoroSection {...defaultProps} />);
    expect(screen.getByRole('button', { name: /download/i })).toBeTruthy();
  });

  it('calls onDownload when Download button clicked', () => {
    render(<KokoroSection {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(defaultProps.onDownload).toHaveBeenCalledTimes(1);
  });

  it('renders Progress bar during download', () => {
    const downloadState: KokoroDownloadProgress = {
      status: 'downloading', percent: 42, downloadedMb: 147, totalMb: 350
    };
    render(<KokoroSection {...defaultProps} downloadState={downloadState} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('shows correct percentage during download', () => {
    const downloadState: KokoroDownloadProgress = {
      status: 'downloading', percent: 42, downloadedMb: 147, totalMb: 350
    };
    render(<KokoroSection {...defaultProps} downloadState={downloadState} />);
    expect(screen.getByText(/42/)).toBeTruthy();
  });

  it('renders Try again button on error', () => {
    const downloadState: KokoroDownloadProgress = {
      status: 'error', percent: 0, downloadedMb: 0, totalMb: 350, errorMessage: 'Network error'
    };
    render(<KokoroSection {...defaultProps} downloadState={downloadState} />);
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeTruthy();
  });

  it('calls onDownload when Try again clicked', () => {
    const onDownload = vi.fn();
    const downloadState: KokoroDownloadProgress = {
      status: 'error', percent: 0, downloadedMb: 0, totalMb: 350
    };
    render(<KokoroSection {...defaultProps} onDownload={onDownload} downloadState={downloadState} />);
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('shows success state when modelCached=true', () => {
    render(<KokoroSection {...defaultProps} modelCached={true} />);
    expect(screen.getByText(/pronto|ready|downloaded/i)).toBeTruthy();
  });

  it('renders Cancel button during download and calls onCancelDownload', () => {
    const onCancelDownload = vi.fn();
    const downloadState: KokoroDownloadProgress = {
      status: 'downloading', percent: 20, downloadedMb: 70, totalMb: 350
    };
    render(
      <KokoroSection {...defaultProps} downloadState={downloadState} onCancelDownload={onCancelDownload} />
    );
    const cancelBtn = screen.getByRole('button', { name: /cancel|cancelar/i });
    fireEvent.click(cancelBtn);
    expect(onCancelDownload).toHaveBeenCalledTimes(1);
  });
});
