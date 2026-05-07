import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn((key: string) => (key === 'userData' ? '/test/userData' : '')) },
}));

vi.mock('node:fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import {
  getKokoroModelDir,
  getKokoroModelPath,
  isKokoroModelCached,
  downloadKokoroModel,
  KOKORO_MODEL_SIZE_MB,
} from '../kokoroResources.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getKokoroModelDir', () => {
  it('returns a path ending with "kokoro" inside a userData-like directory', () => {
    const dir = getKokoroModelDir();
    expect(dir).toContain('userData');
    expect(dir).toMatch(/[/\\]kokoro$/);
  });
});

describe('getKokoroModelPath', () => {
  it('returns a path ending with "kokoro/model.onnx"', () => {
    const p = getKokoroModelPath();
    expect(p).toMatch(/[/\\]kokoro[/\\]model\.onnx$/);
  });
});

describe('isKokoroModelCached', () => {
  it('returns false when model.onnx does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isKokoroModelCached()).toBe(false);
  });

  it('returns true when model.onnx exists on disk', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(isKokoroModelCached()).toBe(true);
  });
});

describe('downloadKokoroModel', () => {
  const makeReadableStream = (chunks: Buffer[]) => {
    const stream = {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    };
    return stream;
  };

  const makeFetchResponse = (totalBytes: number, chunks: Buffer[]) => {
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name === 'content-length' ? String(totalBytes) : null),
      },
      body: makeReadableStream(chunks),
    };
  };

  it('calls onProgress with percent values between 0 and 100', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const chunkSize = 100 * 1024;
    const totalBytes = 300 * 1024;
    const chunks = [
      Buffer.alloc(chunkSize),
      Buffer.alloc(chunkSize),
      Buffer.alloc(chunkSize),
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse(totalBytes, chunks)),
    );

    const percents: number[] = [];
    await downloadKokoroModel({
      onProgress: (percent) => percents.push(percent),
    });

    expect(percents.length).toBeGreaterThan(0);
    for (const pct of percents) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }

    vi.unstubAllGlobals();
  });

  it('deletes partial file on network error (D-04)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure')),
    );

    await expect(downloadKokoroModel()).rejects.toThrow('Network failure');
    expect(vi.mocked(fsPromises.unlink)).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('throws AbortError when signal is aborted (D-02)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const controller = new AbortController();
    controller.abort();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      ),
    );

    await expect(
      downloadKokoroModel({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    vi.unstubAllGlobals();
  });
});

describe('KOKORO_MODEL_SIZE_MB', () => {
  it('is a positive number approximately equal to 350', () => {
    expect(KOKORO_MODEL_SIZE_MB).toBeGreaterThan(0);
    expect(KOKORO_MODEL_SIZE_MB).toBeCloseTo(350, -2);
  });
});
