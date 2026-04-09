/**
 * LocalSTTProvider — STT offline via nodejs-whisper.
 *
 * Paridade com WhisperTranscriber (src/jarvis/core/voice.py): modelo 'base' default,
 * override via construtor ou env var WHISPER_MODEL, lazy load pelo próprio nodejs-whisper,
 * idioma default 'pt'.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nodewhisper } from 'nodejs-whisper';

import type { STTProvider, STTTranscribeOptions } from './provider.js';

export interface LocalSTTProviderOptions {
  modelName?: string;
}

export class LocalSTTProvider implements STTProvider {
  public readonly name = 'local';
  private readonly modelName: string;

  constructor(opts: LocalSTTProviderOptions = {}) {
    this.modelName = opts.modelName ?? process.env.WHISPER_MODEL ?? 'base';
  }

  async transcribe(audio: Buffer, opts?: STTTranscribeOptions): Promise<string> {
    if (!audio || audio.length === 0) {
      throw new Error('audio buffer is empty');
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-stt-'));
    const tmpPath = path.join(tmpDir, 'input.webm');
    try {
      await fs.writeFile(tmpPath, audio);
      const result = await nodewhisper(tmpPath, {
        modelName: this.modelName,
        autoDownloadModelName: this.modelName,
        removeWavFileAfterExecution: true,
        whisperOptions: {
          language: opts?.language ?? 'pt',
          outputInText: true,
        },
      } as Parameters<typeof nodewhisper>[1]);
      return String(result ?? '').trim();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
        /* ignore cleanup errors */
      });
    }
  }
}
