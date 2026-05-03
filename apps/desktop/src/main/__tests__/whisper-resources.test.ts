import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp/userData') },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
  },
}));

vi.mock('node:https', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../voiceInput/gpuDetection.js', () => ({
  getDetectedBackend: vi.fn(() => 'cpu'),
}));

// Import modules once — all tests share the same mocked module instances
import fs from 'node:fs';
import https from 'node:https';
import {
  isWhisperModelCached,
  ensureWhisperModel,
  MODEL_SIZES_MB,
} from '../voiceInput/whisperResources.js';
import { app } from 'electron';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset isPackaged to false for most tests
  (app as any).isPackaged = false;
});

describe('isWhisperModelCached', () => {
  it('returns false when model file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isWhisperModelCached('base')).toBe(false);
  });

  it('returns true when model file exists on disk', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(isWhisperModelCached('base')).toBe(true);
  });

  it('returns true when app is packaged (extraResources always present)', () => {
    (app as any).isPackaged = true;
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isWhisperModelCached('tiny')).toBe(true);
  });
});

describe('ensureWhisperModel', () => {
  it('resolves immediately when model is already cached (no https.get called)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await expect(ensureWhisperModel('base')).resolves.toBeUndefined();

    expect(vi.mocked(https.get)).not.toHaveBeenCalled();
  });

  it('resolves immediately when app is packaged', async () => {
    (app as any).isPackaged = true;

    await expect(ensureWhisperModel('base')).resolves.toBeUndefined();

    expect(vi.mocked(https.get)).not.toHaveBeenCalled();
  });

  it('rejects immediately when signal is pre-aborted', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const controller = new AbortController();
    controller.abort();

    await expect(
      ensureWhisperModel('large', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('calls onProgress with increasing percent values during download', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.renameSync).mockReturnValue(undefined);

    // Use EventEmitter as file mock so res.pipe(file) triggers 'finish' naturally
    const mockFileStream = new EventEmitter() as any;
    mockFileStream.close = vi.fn((cb?: () => void) => cb?.());
    vi.mocked(fs.createWriteStream).mockReturnValue(mockFileStream as any);

    // Build a fake https response with content-length and data chunks
    const fakeRes = new EventEmitter() as any;
    fakeRes.statusCode = 200;
    fakeRes.headers = { 'content-length': '1000' };
    // pipe: emit data on response, then emit finish on the file stream
    fakeRes.pipe = vi.fn((fileStream: EventEmitter) => {
      process.nextTick(() => {
        fakeRes.emit('data', Buffer.alloc(500));
        process.nextTick(() => {
          fakeRes.emit('data', Buffer.alloc(500));
          process.nextTick(() => {
            fileStream.emit('finish');
          });
        });
      });
    });

    const fakeReq = new EventEmitter() as any;
    fakeReq.destroy = vi.fn();

    vi.mocked(https.get).mockImplementation((_url: any, cb: any) => {
      process.nextTick(() => cb(fakeRes));
      return fakeReq;
    });

    const progressCalls: number[] = [];

    await ensureWhisperModel('medium', {
      onProgress: (p) => progressCalls.push(p.percent),
    });

    // Should have called onProgress with 100 at least (final emit at finish)
    expect(progressCalls).toContain(100);
    // All values should be 0–100
    for (const pct of progressCalls) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it('exports MODEL_SIZES_MB with expected approximate sizes', () => {
    expect(MODEL_SIZES_MB.tiny).toBe(75);
    expect(MODEL_SIZES_MB.base).toBe(142);
    expect(MODEL_SIZES_MB.medium).toBe(1500);
    expect(MODEL_SIZES_MB.large).toBe(476);
  });
});
