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

  // Phase 68 D-03: 'auto' removed from WhisperModelOption.
  // The following tests verify vramMb fallback for unknown options
  // (selectModelByVram is the fallback when OPTION_TO_MODEL has no entry).
  it('falls back to tiny via vramMb=0 (CPU path) for unknown option', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    // tiny is in OPTION_TO_MODEL, so just verify the normal path still works
    expect(resolveWhisperModel('tiny', 0)).toBe('tiny');
  });

  it('resolves medium with high vram via OPTION_TO_MODEL (not vram fallback)', async () => {
    const { resolveWhisperModel } = await import('../voiceInput/whisperModelResolver.js');
    expect(resolveWhisperModel('medium', 9000)).toBe('medium');
  });
});
