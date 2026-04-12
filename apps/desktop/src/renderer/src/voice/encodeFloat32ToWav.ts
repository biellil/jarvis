/**
 * encodeFloat32ToWav — browser-safe port of apps/backend-ts/src/voice/tts/wav-encoder.ts
 *
 * Converts a Float32Array of PCM samples (mono) into a WAV-formatted Uint8Array
 * suitable for `window.jarvis.sendAudio()` (Phase 24 Plan 04, addresses
 * VAD audio format mismatch — research §CRITICAL Pitfall, A4 resolution).
 *
 * MicVAD (`@ricky0123/vad-web`) emits raw Float32Array PCM @ 16kHz from
 * `onSpeechEnd`. The backend `/api/chat/audio` endpoint accepts WAV/MP3
 * (nodejs-whisper + ffmpeg handles decoding). This helper bridges the two
 * without leaving the renderer — zero Node.js Buffer dependency.
 *
 * Output layout (44-byte RIFF/WAVE header + Int16LE samples):
 *   - Bytes  0-3:  "RIFF"
 *   - Bytes  4-7:  file size - 8 (u32 LE) = 36 + dataSize
 *   - Bytes  8-11: "WAVE"
 *   - Bytes 12-15: "fmt "
 *   - Bytes 16-19: 16 (fmt chunk size, u32 LE)
 *   - Bytes 20-21: 1 (PCM format, u16 LE)
 *   - Bytes 22-23: numChannels (u16 LE) — always 1 (mono)
 *   - Bytes 24-27: sampleRate (u32 LE)
 *   - Bytes 28-31: byteRate = sampleRate * 2 (u32 LE)
 *   - Bytes 32-33: blockAlign = 2 (u16 LE)
 *   - Bytes 34-35: 16 (bitsPerSample, u16 LE)
 *   - Bytes 36-39: "data"
 *   - Bytes 40-43: dataSize = samples.length * 2 (u32 LE)
 *   - Bytes 44+:   Int16LE samples (clipped to [-1, 1] before scaling)
 *
 * Samples outside [-1, 1] are clipped BEFORE Int16 conversion. Negative
 * samples scale by 32768, positive samples scale by 32767 — matches the
 * backend reference implementation exactly.
 */
export function encodeFloat32ToWav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8; // 2
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');

  // fmt sub-chunk
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples — clipped to [-1, 1] then scaled to Int16 range.
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]!;
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    const int16 = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    view.setInt16(44 + i * 2, int16, true);
  }

  return new Uint8Array(buffer);
}

/**
 * Writes an ASCII string byte-by-byte into a DataView at the given offset.
 * Replaces backend's `buffer.write('RIFF', 0, 'ascii')` — browser DataView
 * has no string write method, so this helper fills the gap.
 */
function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
