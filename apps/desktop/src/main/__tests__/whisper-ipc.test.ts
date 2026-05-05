import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

const mockSend = vi.fn();
const fakeWindow = {
  isDestroyed: () => false,
  webContents: { send: mockSend },
};

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
}));

const mockEnsureWhisperModel = vi.fn().mockResolvedValue(undefined);
const mockIsWhisperModelCached = vi.fn().mockReturnValue(false);

vi.mock('../voiceInput/whisperResources', () => ({
  ensureWhisperModel: (...args: unknown[]) => mockEnsureWhisperModel(...args),
  isWhisperModelCached: (...args: unknown[]) => mockIsWhisperModelCached(...args),
  MODEL_SIZES_MB: { tiny: 75, base: 142, medium: 1500, large: 476 },
}));

const mockResolveWhisperModel = vi.fn().mockReturnValue('base');

vi.mock('../voiceInput/whisperModelResolver', () => ({
  resolveWhisperModel: (...args: unknown[]) => mockResolveWhisperModel(...args),
}));

const mockSetActiveWhisperModel = vi.fn();

vi.mock('../voiceInput/voiceHandler', () => ({
  setActiveWhisperModel: (...args: unknown[]) => mockSetActiveWhisperModel(...args),
  reinitializeTTS: vi.fn().mockResolvedValue(undefined),
}));

const mockGetSelectedModel = vi.fn().mockReturnValue('base');

vi.mock('../voiceInput/vramDetection', () => ({
  getSelectedModel: () => mockGetSelectedModel(),
  detectVramAndSelectModel: vi.fn().mockResolvedValue('base'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupAndGetHandler() {
  const { ipcMain } = await import('electron');
  const { setupWhisperHandlers } = await import('../ipc/whisper');

  setupWhisperHandlers(() => fakeWindow as never);

  const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
  const lastCall = calls[calls.length - 1];
  return lastCall[1] as (_event: IpcMainInvokeEvent, option: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupWhisperHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureWhisperModel.mockResolvedValue(undefined);
    mockIsWhisperModelCached.mockReturnValue(false);
    mockResolveWhisperModel.mockReturnValue('base');
    mockGetSelectedModel.mockReturnValue('base');
  });

  it('cache hit path — broadcasts success immediately without calling ensureWhisperModel', async () => {
    mockIsWhisperModelCached.mockReturnValue(true);

    const handler = await setupAndGetHandler();
    await handler({} as IpcMainInvokeEvent, 'base');

    expect(mockEnsureWhisperModel).not.toHaveBeenCalled();
    expect(mockSetActiveWhisperModel).toHaveBeenCalledWith('base');
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('whisper'),
      expect.objectContaining({ status: 'success', percent: 100 }),
    );
  });

  it('download happy path — calls ensureWhisperModel, emits progress, broadcasts success', async () => {
    mockIsWhisperModelCached.mockReturnValue(false);
    mockEnsureWhisperModel.mockImplementation(async (_model: string, opts: { onProgress?: (p: { downloadedBytes: number; totalBytes: number; percent: number }) => void }) => {
      opts?.onProgress?.({ downloadedBytes: 71_000_000, totalBytes: 142_000_000, percent: 50 });
      opts?.onProgress?.({ downloadedBytes: 142_000_000, totalBytes: 142_000_000, percent: 100 });
    });

    const handler = await setupAndGetHandler();
    await handler({} as IpcMainInvokeEvent, 'base');

    // Should have received progress + success broadcasts
    expect(mockSend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'downloading', percent: 50 }),
    );
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'success', percent: 100 }),
    );
    expect(mockSetActiveWhisperModel).toHaveBeenCalledWith('base');
  });

  it('error path — broadcasts error and does NOT call setActiveWhisperModel', async () => {
    mockIsWhisperModelCached.mockReturnValue(false);
    mockEnsureWhisperModel.mockRejectedValue(new Error('Network timeout'));

    const handler = await setupAndGetHandler();
    await handler({} as IpcMainInvokeEvent, 'base');

    expect(mockSetActiveWhisperModel).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error', errorMessage: 'Network timeout' }),
    );
  });

  it('AbortError path — silently returns without broadcasting error or calling setActiveWhisperModel', async () => {
    mockIsWhisperModelCached.mockReturnValue(false);
    const abortError = new DOMException('Aborted', 'AbortError');
    mockEnsureWhisperModel.mockRejectedValue(abortError);

    const handler = await setupAndGetHandler();
    await handler({} as IpcMainInvokeEvent, 'base');

    expect(mockSetActiveWhisperModel).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('resolveWhisperModel called with option and vramMb for non-auto options', async () => {
    mockIsWhisperModelCached.mockReturnValue(true);
    mockResolveWhisperModel.mockReturnValue('medium');

    const handler = await setupAndGetHandler();
    await handler({} as IpcMainInvokeEvent, 'medium');

    expect(mockResolveWhisperModel).toHaveBeenCalledWith('medium', expect.any(Number));
    expect(mockSetActiveWhisperModel).toHaveBeenCalledWith('medium');
  });
});
