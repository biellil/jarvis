/**
 * ffmpeg availability check — non-fatal warning on startup.
 *
 * nodejs-whisper depends on ffmpeg to convert WebM/Opus → WAV. Without it,
 * transcription of non-WAV inputs will fail at request time. We log a warning
 * at startup but never throw — backend must still boot in text-only mode.
 *
 * Fallback: if ffmpeg is not on the system PATH, we try to use the binary
 * bundled by `ffmpeg-static` (npm dependency) and prepend its directory to
 * PATH so nodejs-whisper can find it.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function tryFfmpegStatic(): boolean {
  try {
    const ffmpegPath: string = require('ffmpeg-static');
    if (!ffmpegPath) return false;

    const dir = path.dirname(ffmpegPath);
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`;

    const result = spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' });
    if (result.status === 0) {
      console.log(`[voice] Using bundled ffmpeg from ffmpeg-static: ${ffmpegPath}`);
      return true;
    }
  } catch {
    /* ffmpeg-static not installed — fallthrough */
  }
  return false;
}

export function assertFfmpegAvailable(): boolean {
  // 1. Check system PATH first
  try {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (result.status === 0) {
      return true;
    }
  } catch {
    /* fallthrough to ffmpeg-static */
  }

  // 2. Try ffmpeg-static fallback
  if (tryFfmpegStatic()) {
    return true;
  }

  console.warn(
    '[voice] ffmpeg not found in PATH — nodejs-whisper may fail on non-WAV inputs. Install: apt install ffmpeg / brew install ffmpeg / choco install ffmpeg',
  );
  return false;
}
