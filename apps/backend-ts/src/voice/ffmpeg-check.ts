/**
 * ffmpeg availability check — non-fatal warning on startup.
 *
 * nodejs-whisper depends on ffmpeg to convert WebM/Opus → WAV. Without it,
 * transcription of non-WAV inputs will fail at request time. We log a warning
 * at startup but never throw — backend must still boot in text-only mode.
 */

import { spawnSync } from 'node:child_process';

export function assertFfmpegAvailable(): boolean {
  try {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (result.status === 0) {
      return true;
    }
  } catch {
    /* fallthrough to warning */
  }
  console.warn(
    '[voice] ffmpeg not found in PATH — nodejs-whisper may fail on non-WAV inputs. Install: apt install ffmpeg / brew install ffmpeg',
  );
  return false;
}
