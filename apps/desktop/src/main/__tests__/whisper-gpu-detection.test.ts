import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @fugood/whisper.node — not installed yet, will throw if not mocked
vi.mock('@fugood/whisper.node', () => ({
  initWhisper: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn().mockReturnValue('/tmp/userData') },
}));

// Use dynamic import in each test so module state (detectedBackend) resets
// between tests via vi.resetModules() in beforeEach
beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('initializeGpuDetection', () => {
  it('uses CUDA when initWhisper succeeds for cuda backend', async () => {
    const { initWhisper } = await import('@fugood/whisper.node');
    (initWhisper as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});  // cuda succeeds

    const logSpy = vi.spyOn(console, 'log');
    const { initializeGpuDetection, getDetectedBackend } = await import('../voiceInput/gpuDetection');

    await initializeGpuDetection();

    expect(logSpy).toHaveBeenCalledWith('Using GPU backend: cuda');
    expect(getDetectedBackend()).toBe('cuda');
  });

  it('uses Vulkan when CUDA fails but Vulkan succeeds', async () => {
    const { initWhisper } = await import('@fugood/whisper.node');
    const mock = initWhisper as ReturnType<typeof vi.fn>;
    mock.mockRejectedValueOnce(new Error('CUDA unavailable'));
    mock.mockResolvedValueOnce({});  // vulkan succeeds

    const logSpy = vi.spyOn(console, 'log');
    const { initializeGpuDetection, getDetectedBackend } = await import('../voiceInput/gpuDetection');

    await initializeGpuDetection();

    expect(logSpy).toHaveBeenCalledWith('Using GPU backend: vulkan');
    expect(getDetectedBackend()).toBe('vulkan');
  });

  it('uses Metal when CUDA and Vulkan fail but Metal succeeds', async () => {
    const { initWhisper } = await import('@fugood/whisper.node');
    const mock = initWhisper as ReturnType<typeof vi.fn>;
    mock.mockRejectedValueOnce(new Error('CUDA unavailable'));
    mock.mockRejectedValueOnce(new Error('Vulkan unavailable'));
    mock.mockResolvedValueOnce({});  // metal succeeds

    const logSpy = vi.spyOn(console, 'log');
    const { initializeGpuDetection, getDetectedBackend } = await import('../voiceInput/gpuDetection');

    await initializeGpuDetection();

    expect(logSpy).toHaveBeenCalledWith('Using GPU backend: metal');
    expect(getDetectedBackend()).toBe('metal');
  });

  it('falls back to CPU when all GPU backends fail', async () => {
    const { initWhisper } = await import('@fugood/whisper.node');
    const mock = initWhisper as ReturnType<typeof vi.fn>;
    mock.mockRejectedValue(new Error('no GPU'));

    const logSpy = vi.spyOn(console, 'log');
    const { initializeGpuDetection, getDetectedBackend } = await import('../voiceInput/gpuDetection');

    await initializeGpuDetection();

    expect(logSpy).toHaveBeenCalledWith('Falling back to CPU');
    expect(getDetectedBackend()).toBe('cpu');
  });

  it('caches detection result — initWhisper not called on second invocation', async () => {
    const { initWhisper } = await import('@fugood/whisper.node');
    (initWhisper as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { initializeGpuDetection, getDetectedBackend } = await import('../voiceInput/gpuDetection');

    await initializeGpuDetection();
    const firstResult = getDetectedBackend();
    const callCountAfterFirst = (initWhisper as ReturnType<typeof vi.fn>).mock.calls.length;

    await initializeGpuDetection();  // second call
    expect((initWhisper as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountAfterFirst);
    expect(getDetectedBackend()).toBe(firstResult);
  });
});
