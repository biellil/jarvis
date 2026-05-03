import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron to avoid Electron-specific imports in tests
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('resolveWhisperModel', () => {
  it('resolves tiny → tiny', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('tiny', 0)).toBe('tiny');
  });

  it('resolves base → base', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('base', 0)).toBe('base');
  });

  it('resolves medium → medium', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('medium', 0)).toBe('medium');
  });

  it('resolves small → base (no small model file; documented fallback D-12)', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('small', 0)).toBe('base');
  });

  it('resolves large-v3-turbo → large (same ggml-large-v3.bin per D-12)', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('large-v3-turbo', 0)).toBe('large');
  });

  it('resolves auto with 0 MB vram → tiny (CPU fallback)', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('auto', 0)).toBe('tiny');
  });

  it('resolves auto with 6000 MB vram → medium', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('auto', 6000)).toBe('medium');
  });

  it('resolves auto with 9000 MB vram → large', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('auto', 9000)).toBe('large');
  });
});
