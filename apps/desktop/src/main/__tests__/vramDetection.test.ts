import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getGPUInfo: vi.fn(),
    getPath: vi.fn().mockReturnValue('/tmp/userData'),
  },
}));

// Use dynamic import in each test so module state (selectedModel) resets
// between tests via vi.resetModules() in beforeEach
beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('detectVramAndSelectModel', () => {
  it('returns large when VRAM > 8192 MB and logs correctly', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auxAttributes: { gpuMemoryMB: 10240 },
    });

    const logSpy = vi.spyOn(console, 'log');
    const { detectVramAndSelectModel } = await import('../voiceInput/vramDetection');

    const result = await detectVramAndSelectModel();

    expect(result).toBe('large');
    expect(logSpy).toHaveBeenCalledWith('[whisper] VRAM detected: 10240 MB');
    expect(logSpy).toHaveBeenCalledWith('[whisper] Selecting model: large');
  });

  it('returns base when VRAM is 6144 MB (4096–8192 range)', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auxAttributes: { gpuMemoryMB: 6144 },
    });

    const logSpy = vi.spyOn(console, 'log');
    const { detectVramAndSelectModel } = await import('../voiceInput/vramDetection');

    const result = await detectVramAndSelectModel();

    expect(result).toBe('base');
    expect(logSpy).toHaveBeenCalledWith('[whisper] Selecting model: base');
  });

  it('returns base at exactly 4096 MB boundary', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auxAttributes: { gpuMemoryMB: 4096 },
    });

    const { detectVramAndSelectModel } = await import('../voiceInput/vramDetection');

    const result = await detectVramAndSelectModel();

    expect(result).toBe('base');
  });

  it('returns tiny when VRAM < 4096 MB', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auxAttributes: { gpuMemoryMB: 2048 },
    });

    const logSpy = vi.spyOn(console, 'log');
    const { detectVramAndSelectModel } = await import('../voiceInput/vramDetection');

    const result = await detectVramAndSelectModel();

    expect(result).toBe('tiny');
    expect(logSpy).toHaveBeenCalledWith('[whisper] Selecting model: tiny (CPU fallback)');
  });

  it('returns base when gpuMemoryMB is 0 (safe fallback per D-03)', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auxAttributes: { gpuMemoryMB: 0 },
    });

    const { detectVramAndSelectModel } = await import('../voiceInput/vramDetection');

    const result = await detectVramAndSelectModel();

    expect(result).toBe('base');
  });

  it('returns base when gpuMemoryMB is undefined (safe fallback per D-03)', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auxAttributes: {},
    });

    const { detectVramAndSelectModel } = await import('../voiceInput/vramDetection');

    const result = await detectVramAndSelectModel();

    expect(result).toBe('base');
  });

  it('getSelectedModel returns cached value without re-calling getGPUInfo', async () => {
    const { app } = await import('electron');
    (app.getGPUInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      auxAttributes: { gpuMemoryMB: 6144 },
    });

    const { detectVramAndSelectModel, getSelectedModel } = await import('../voiceInput/vramDetection');

    await detectVramAndSelectModel();
    const callCountAfterFirst = (app.getGPUInfo as ReturnType<typeof vi.fn>).mock.calls.length;

    // getSelectedModel should return cached value without calling getGPUInfo again
    const cached = getSelectedModel();
    expect(cached).toBe('base');
    expect((app.getGPUInfo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountAfterFirst);
  });
});
