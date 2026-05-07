import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn((key: string) => (key === 'userData' ? '/test/userData' : '')) },
}));

const mockHfEnv = { cacheDir: '', useFSCache: false };
vi.mock('@huggingface/transformers', () => ({ env: mockHfEnv }));

const mockFromPretrained = vi.fn();
vi.mock('kokoro-js', () => ({
  KokoroTTS: { from_pretrained: mockFromPretrained },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import fs from 'node:fs';
import {
  getHFCacheDir,
  isKokoroModelCached,
  configureHFEnv,
  downloadKokoroModel,
  KOKORO_MODEL_SIZE_MB,
} from '../kokoroResources.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockHfEnv.cacheDir = '';
  mockHfEnv.useFSCache = false;
  mockFromPretrained.mockResolvedValue(undefined);
});

describe('getHFCacheDir', () => {
  it('returns a path ending with "hf-cache" inside userData', () => {
    const dir = getHFCacheDir();
    expect(dir).toContain('userData');
    expect(dir).toMatch(/[/\\]hf-cache$/);
  });
});

describe('isKokoroModelCached', () => {
  it('returns false when snapshots directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isKokoroModelCached()).toBe(false);
  });

  it('returns true when snapshots directory exists and has entries', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readdirSync).mockReturnValue(['abc123def456'] as any);
    expect(isKokoroModelCached()).toBe(true);
  });

  it('returns false when snapshots directory exists but is empty', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    expect(isKokoroModelCached()).toBe(false);
  });

  it('returns false when readdirSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(isKokoroModelCached()).toBe(false);
  });
});

describe('configureHFEnv', () => {
  it('sets env.cacheDir to a path containing hf-cache', async () => {
    await configureHFEnv();
    expect(mockHfEnv.cacheDir).toMatch(/hf-cache/);
  });

  it('sets env.useFSCache to true', async () => {
    await configureHFEnv();
    expect(mockHfEnv.useFSCache).toBe(true);
  });
});

describe('downloadKokoroModel', () => {
  it('calls from_pretrained with correct model ID and q8 dtype', async () => {
    await downloadKokoroModel();
    expect(mockFromPretrained).toHaveBeenCalledWith(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      expect.objectContaining({ dtype: 'q8' }),
    );
  });

  it('calls onProgress when progress_callback fires', async () => {
    mockFromPretrained.mockImplementation(async (_id: string, opts: { progress_callback: (p: unknown) => void }) => {
      opts.progress_callback({
        status: 'downloading',
        progress: 50,
        loaded: 175 * 1024 * 1024,
        total: 350 * 1024 * 1024,
      });
    });

    const percents: number[] = [];
    await downloadKokoroModel({ onProgress: (pct) => percents.push(pct) });
    expect(percents).toContain(50);
  });

  it('clamps progress percent to 100 maximum', async () => {
    mockFromPretrained.mockImplementation(async (_id: string, opts: { progress_callback: (p: unknown) => void }) => {
      opts.progress_callback({ status: 'done', progress: 110, loaded: 0, total: 0 });
    });

    const percents: number[] = [];
    await downloadKokoroModel({ onProgress: (pct) => percents.push(pct) });
    expect(Math.max(...percents)).toBeLessThanOrEqual(100);
  });

  it('configures HF env before calling from_pretrained', async () => {
    await downloadKokoroModel();
    expect(mockHfEnv.cacheDir).toMatch(/hf-cache/);
    expect(mockFromPretrained).toHaveBeenCalled();
  });

  it('re-throws when from_pretrained rejects (e.g. AbortError)', async () => {
    mockFromPretrained.mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(downloadKokoroModel({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('KOKORO_MODEL_SIZE_MB', () => {
  it('is approximately 350 MB', () => {
    expect(KOKORO_MODEL_SIZE_MB).toBeGreaterThan(0);
    expect(KOKORO_MODEL_SIZE_MB).toBeCloseTo(350, -2);
  });
});
