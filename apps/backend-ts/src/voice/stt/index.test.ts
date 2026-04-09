/**
 * Unit tests for createSTTProvider() factory.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('nodejs-whisper', () => ({
  nodewhisper: vi.fn(),
}));

import { createSTTProvider, LocalSTTProvider } from './index.js';

describe('createSTTProvider', () => {
  const originalEnv = process.env.STT_PROVIDER;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (originalEnv === undefined) delete process.env.STT_PROVIDER;
    else process.env.STT_PROVIDER = originalEnv;
  });

  test('default (unset) returns LocalSTTProvider without warning', () => {
    delete process.env.STT_PROVIDER;
    const p = createSTTProvider();
    expect(p).toBeInstanceOf(LocalSTTProvider);
    expect(p.name).toBe('local');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('STT_PROVIDER=local returns LocalSTTProvider without warning', () => {
    process.env.STT_PROVIDER = 'local';
    const p = createSTTProvider();
    expect(p).toBeInstanceOf(LocalSTTProvider);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('STT_PROVIDER=cloud falls back to local with warning', () => {
    process.env.STT_PROVIDER = 'cloud';
    const p = createSTTProvider();
    expect(p).toBeInstanceOf(LocalSTTProvider);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/cloud/);
  });

  test('STT_PROVIDER=garbage falls back to local with warning', () => {
    process.env.STT_PROVIDER = 'garbage';
    const p = createSTTProvider();
    expect(p).toBeInstanceOf(LocalSTTProvider);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
