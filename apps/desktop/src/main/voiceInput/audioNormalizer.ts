/**
 * audioNormalizer.ts — WebM/Opus → 16kHz PCM mono WAV via ffmpeg-static
 *
 * MediaRecorder outputs 48kHz stereo Opus in WebM container.
 * whisper.cpp requires 16kHz PCM mono WAV (D-06, D-07).
 * This module normalizes the format before every transcription call.
 *
 * Uses ffmpeg-static for bundled binary (D-08). Falls back to system
 * ffmpeg if ffmpeg-static not available.
 *
 * Log on success: "[whisper] audio normalized: 16kHz, mono (1 channel), PCM"
 * (required by success criteria 2)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

function getFfmpegPath(): string {
  try {
    const ffmpegStatic = _require('ffmpeg-static') as string | { default: string };
    // Handle both CJS (returns string directly) and ESM mock (returns {default: string})
    return typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic.default ?? 'ffmpeg');
  } catch {
    // Fallback to system ffmpeg if ffmpeg-static not bundled
    return 'ffmpeg';
  }
}

export async function normalizeAudioToWav(webmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    const ffmpeg = spawn(ffmpegPath, [
      '-i', 'pipe:0',         // Read WebM/Opus from stdin
      '-acodec', 'pcm_s16le', // PCM 16-bit signed little-endian
      '-ar', '16000',         // 16 kHz sample rate (required by whisper.cpp)
      '-ac', '1',             // Mono channel
      '-f', 'wav',            // WAV container
      'pipe:1',               // Write to stdout
    ]);

    const chunks: Buffer[] = [];

    ffmpeg.stdout!.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stderr!.on('data', (data: Buffer) => {
      console.debug('[whisper:ffmpeg]', data.toString().trim());
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code === 0) {
        // Success criteria 2: exact log string confirming normalization
        console.log('[whisper] audio normalized: 16kHz, mono (1 channel), PCM');
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err: Error) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ffmpeg.stdin!.write(webmBuffer);
    ffmpeg.stdin!.end();
  });
}
