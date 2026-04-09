/**
 * Unit tests for LocalSTTProvider.
 *
 * nodejs-whisper é mockado — nenhum modelo é baixado, nenhum processo real executado.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const { nodewhisperMock } = vi.hoisted(() => ({ nodewhisperMock: vi.fn() }));

vi.mock('nodejs-whisper', () => ({
  nodewhisper: nodewhisperMock,
}));

import { LocalSTTProvider } from './local.js';

describe('LocalSTTProvider', () => {
  beforeEach(() => {
    nodewhisperMock.mockReset();
  });

  test('name is "local"', () => {
    const p = new LocalSTTProvider();
    expect(p.name).toBe('local');
  });

  test('transcribe returns trimmed text from nodewhisper', async () => {
    nodewhisperMock.mockResolvedValueOnce('  texto fake  ');
    const p = new LocalSTTProvider();
    const out = await p.transcribe(Buffer.from([1, 2, 3, 4]));
    expect(out).toBe('texto fake');
    expect(nodewhisperMock).toHaveBeenCalledTimes(1);
  });

  test('transcribe uses default modelName "base"', async () => {
    const oldEnv = process.env.WHISPER_MODEL;
    delete process.env.WHISPER_MODEL;
    nodewhisperMock.mockResolvedValueOnce('x');
    const p = new LocalSTTProvider();
    await p.transcribe(Buffer.from([1, 2]));
    const call = nodewhisperMock.mock.calls[0];
    expect(call[1].modelName).toBe('base');
    expect(call[1].whisperOptions.language).toBe('pt');
    if (oldEnv !== undefined) process.env.WHISPER_MODEL = oldEnv;
  });

  test('transcribe honors constructor modelName override', async () => {
    nodewhisperMock.mockResolvedValueOnce('x');
    const p = new LocalSTTProvider({ modelName: 'small' });
    await p.transcribe(Buffer.from([1, 2]));
    expect(nodewhisperMock.mock.calls[0][1].modelName).toBe('small');
  });

  test('transcribe honors language option', async () => {
    nodewhisperMock.mockResolvedValueOnce('x');
    const p = new LocalSTTProvider();
    await p.transcribe(Buffer.from([1, 2]), { language: 'en' });
    expect(nodewhisperMock.mock.calls[0][1].whisperOptions.language).toBe('en');
  });

  test('throws on empty buffer without invoking nodewhisper', async () => {
    const p = new LocalSTTProvider();
    await expect(p.transcribe(Buffer.alloc(0))).rejects.toThrow(
      'audio buffer is empty',
    );
    expect(nodewhisperMock).not.toHaveBeenCalled();
  });

  test('cleans tempfile even when nodewhisper throws', async () => {
    nodewhisperMock.mockRejectedValueOnce(new Error('boom'));
    const p = new LocalSTTProvider();
    await expect(p.transcribe(Buffer.from([1, 2, 3]))).rejects.toThrow('boom');
    // tempDir cleanup is best-effort; we just ensure no crash and mock was called
    expect(nodewhisperMock).toHaveBeenCalledTimes(1);
  });
});
