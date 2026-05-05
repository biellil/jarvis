/**
 * voiceHandler.streaming.test.ts — Phase 53 Plan 04 (STTS-01, STTS-02).
 *
 * Verifies bifurcation of handleAudio gated by getStreamingTtsEnabled():
 *   - flag=false → legacy LLM+TTS path (success criteria #3, no regression)
 *   - flag=true  → delegates to runStreamingTurn (success criteria #1)
 *   - mid-turn toggle ignored (D-11)
 *   - two-turn flag flip without restart (success criteria #4)
 *   - barge-in via abortActiveStreamingTurn fires handle.abort + tts:stop IPC (D-12)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks so they're applied before the module-under-test is imported.
const mocks = vi.hoisted(() => ({
  getStreamingTtsEnabled: vi.fn<[], boolean>(() => false),
  runStreamingTurn: vi.fn(),
  createTTSProvider: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn().mockReturnValue('/tmp/userData') },
}));
vi.mock('../audioNormalizer.js');
vi.mock('../whisperResources.js');
vi.mock('@fugood/whisper.node');

vi.mock('../../store', () => ({
  getStreamingTtsEnabled: mocks.getStreamingTtsEnabled,
}));

vi.mock('../streamingTurn.js', () => ({
  runStreamingTurn: mocks.runStreamingTurn,
}));

vi.mock('../tts/index.js', () => ({
  createTTSProvider: () => mocks.createTTSProvider(),
}));

// Import after mocks
import {
  handleAudio,
  abortActiveStreamingTurn,
} from '../voiceHandler.js';
import { IPC_CHANNELS } from '../../../shared/ipc-types.js';

interface FakeMainWindow {
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof vi.fn> };
}

function makeFakeMainWindow(): FakeMainWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: { send: vi.fn() },
  };
}

function makeDeps(mainWindow: FakeMainWindow | null = null) {
  const deps: any = {
    config: { backendUrl: 'http://localhost:3000', apiKey: 'test-key' },
    selectedModel: 'base' as const,
    ttsProvider: {
      name: 'murf',
      synthesize: vi.fn().mockResolvedValue({ audio: Buffer.from([1, 2, 3]), format: 'mp3' }),
    },
  };
  if (mainWindow) deps.mainWindow = mainWindow;
  return deps;
}

async function setupSttHappyPath(transcription = 'olá jarvis'): Promise<void> {
  const { normalizeAudioToWav } = await import('../audioNormalizer.js');
  const { getWhisperInstance } = await import('../whisperResources.js');
  (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0, 1, 2, 3]));
  (getWhisperInstance as ReturnType<typeof vi.fn>).mockResolvedValue({
    transcribeData: vi.fn().mockReturnValue({
      promise: Promise.resolve({ result: transcription }),
    }),
    release: vi.fn().mockResolvedValue(undefined),
  });
}

describe('handleAudio — Phase 53 Plan 04 streaming bifurcation', () => {
  beforeEach(() => {
    mocks.getStreamingTtsEnabled.mockReset();
    mocks.runStreamingTurn.mockReset();
    mocks.createTTSProvider.mockReset();
    mocks.getStreamingTtsEnabled.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'olá!' }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Test 1 — flag=false uses legacy path (no regression / success criteria #3)', async () => {
    await setupSttHappyPath();
    mocks.getStreamingTtsEnabled.mockReturnValue(false);

    const deps = makeDeps(makeFakeMainWindow());
    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(mocks.runStreamingTurn).not.toHaveBeenCalled();
    expect(deps.ttsProvider.synthesize).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcription).toBe('olá jarvis');
      expect(result.data.message).toBe('olá!');
      expect(result.data.audioBase64).not.toBe('');
      expect(result.data.audioBase64).not.toBeNull();
    }
  });

  it('Test 2 — flag=true delegates to runStreamingTurn', async () => {
    await setupSttHappyPath();
    mocks.getStreamingTtsEnabled.mockReturnValue(true);

    const handle = {
      turnId: 'T1',
      abort: vi.fn(),
      done: Promise.resolve(),
    };
    mocks.runStreamingTurn.mockReturnValue(handle);

    const mainWindow = makeFakeMainWindow();
    const deps = makeDeps(mainWindow);
    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(mocks.runStreamingTurn).toHaveBeenCalledTimes(1);
    const call = mocks.runStreamingTurn.mock.calls[0]!;
    expect(call[0]).toMatchObject({
      backendUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      mainWindow,
    });
    expect(call[1]).toBe('olá jarvis');

    // Legacy synthesize NOT called
    expect(deps.ttsProvider.synthesize).not.toHaveBeenCalled();
    // Legacy fetch to /api/chat NOT called either (streaming uses SSE inside runStreamingTurn)
    expect(globalThis.fetch).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcription).toBe('olá jarvis');
    }
  });

  it('Test 3 — D-11 mid-turn toggle ignored (in-flight turn finishes streaming)', async () => {
    await setupSttHappyPath();
    mocks.getStreamingTtsEnabled.mockReturnValue(true);

    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => { resolveDone = resolve; });
    const handle = {
      turnId: 'T-mid',
      abort: vi.fn(),
      done,
    };
    mocks.runStreamingTurn.mockReturnValue(handle);

    const deps = makeDeps(makeFakeMainWindow());
    const turnPromise = handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    // Yield so the streaming branch starts
    await new Promise((r) => setImmediate(r));

    // Mid-flight: flip flag to false. Should not affect already-started turn.
    mocks.getStreamingTtsEnabled.mockReturnValue(false);

    // Resolve the streaming handle
    resolveDone();
    await turnPromise;

    expect(mocks.runStreamingTurn).toHaveBeenCalledTimes(1);
    expect(deps.ttsProvider.synthesize).not.toHaveBeenCalled();
  });

  it('Test 4 — two-turn flag flip without restart (success criteria #4)', async () => {
    // Turn 1: flag=false → legacy path
    await setupSttHappyPath('turn one');
    mocks.getStreamingTtsEnabled.mockReturnValue(false);

    const deps1 = makeDeps(makeFakeMainWindow());
    const result1 = await handleAudio(Buffer.from([1]), deps1);
    expect(result1.success).toBe(true);
    expect(deps1.ttsProvider.synthesize).toHaveBeenCalledTimes(1);
    expect(mocks.runStreamingTurn).not.toHaveBeenCalled();

    // Turn 2: flag=true → streaming path
    await setupSttHappyPath('turn two');
    mocks.getStreamingTtsEnabled.mockReturnValue(true);
    mocks.runStreamingTurn.mockReturnValue({
      turnId: 'T2',
      abort: vi.fn(),
      done: Promise.resolve(),
    });

    const deps2 = makeDeps(makeFakeMainWindow());
    const result2 = await handleAudio(Buffer.from([2]), deps2);
    expect(result2.success).toBe(true);
    expect(mocks.runStreamingTurn).toHaveBeenCalledTimes(1);
    expect(deps2.ttsProvider.synthesize).not.toHaveBeenCalled();
  });

  it('Test 5 — abortActiveStreamingTurn calls handle.abort + sends tts:stop IPC', async () => {
    await setupSttHappyPath();
    mocks.getStreamingTtsEnabled.mockReturnValue(true);

    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => { resolveDone = resolve; });
    const handle = {
      turnId: 'T-abort',
      abort: vi.fn(),
      done,
    };
    mocks.runStreamingTurn.mockReturnValue(handle);

    const mainWindow = makeFakeMainWindow();
    const deps = makeDeps(mainWindow);
    const turnPromise = handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    // Yield so the streaming turn registers the handle
    await new Promise((r) => setImmediate(r));

    // Trigger barge-in
    abortActiveStreamingTurn(mainWindow);
    expect(handle.abort).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.TTS_STOP,
      { turnId: 'T-abort' },
    );

    // Subsequent abort is a no-op (handle cleared)
    abortActiveStreamingTurn(mainWindow);
    expect(handle.abort).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledTimes(1);

    // Resolve done so handleAudio settles
    resolveDone();
    await turnPromise;
  });
});
