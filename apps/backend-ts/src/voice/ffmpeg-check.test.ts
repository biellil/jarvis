/**
 * Unit tests for assertFfmpegAvailable — child_process mocked.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}));

import { assertFfmpegAvailable } from './ffmpeg-check.js';

describe('assertFfmpegAvailable', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  test('returns true when ffmpeg -version exits 0', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertFfmpegAvailable()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('returns false and warns when exit status != 0', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertFfmpegAvailable()).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/ffmpeg not found/);
    warn.mockRestore();
  });

  test('returns false and warns when spawnSync throws', () => {
    spawnSyncMock.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertFfmpegAvailable()).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
