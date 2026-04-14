import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// ffmpeg-static not installed yet — mock the require call
vi.mock('ffmpeg-static', () => ({
  default: '/usr/bin/ffmpeg',
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

function makeFakeProcess(exitCode: number | null = 0, errorEvent?: Error) {
  const proc = {
    stdout: new EventEmitter(),
    stdin: { write: vi.fn(), end: vi.fn() },
    stderr: new EventEmitter(),
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      if (event === 'close' && exitCode !== null) {
        // Emit close asynchronously so stdin.end() call completes first
        setTimeout(() => cb(exitCode), 0);
      }
      if (event === 'error' && errorEvent) {
        setTimeout(() => cb(errorEvent), 0);
      }
    }),
  };
  return proc;
}

describe('normalizeAudioToWav', () => {
  it('spawns ffmpeg with 16kHz mono PCM args and logs confirmation', async () => {
    const { spawn } = await import('node:child_process');
    const fakeProc = makeFakeProcess(0);
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(fakeProc);

    const logSpy = vi.spyOn(console, 'log');
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer');

    const result = await normalizeAudioToWav(Buffer.from([1, 2, 3]));

    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spawnArgs[1]).toContain('-ar');
    expect(spawnArgs[1]).toContain('16000');
    expect(spawnArgs[1]).toContain('-ac');
    expect(spawnArgs[1]).toContain('1');
    expect(spawnArgs[1]).toContain('-acodec');
    expect(spawnArgs[1]).toContain('pcm_s16le');
    expect(logSpy).toHaveBeenCalledWith('[whisper] audio normalized: 16kHz, mono (1 channel), PCM');
    expect(result).toBeInstanceOf(Buffer);
  });

  it('rejects when ffmpeg exits with non-zero code', async () => {
    const { spawn } = await import('node:child_process');
    const fakeProc = makeFakeProcess(1);
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(fakeProc);

    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer');

    await expect(normalizeAudioToWav(Buffer.from([1]))).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('rejects when spawn emits error event', async () => {
    const { spawn } = await import('node:child_process');
    const fakeProc = makeFakeProcess(null, new Error('spawn ENOENT'));
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(fakeProc);

    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer');

    await expect(normalizeAudioToWav(Buffer.from([1]))).rejects.toThrow('ffmpeg spawn failed');
  });
});
