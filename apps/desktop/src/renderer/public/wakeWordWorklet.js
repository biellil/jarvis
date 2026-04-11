// wakeWordWorklet.js — AudioWorkletProcessor runs in AudioWorkletGlobalScope.
//
// IMPORTANT: no ESM imports, no TypeScript syntax. This file is loaded
// verbatim by AudioContext.audioWorklet.addModule('/wakeWordWorklet.js').
// electron-vite copies it from src/renderer/public/ to dist/renderer/.
//
// Responsibility: chunker. Accumulates mono Float32 input samples into
// fixed-size 1280-sample frames (80ms @ 16kHz) and emits each frame to
// the main renderer thread via port.postMessage(buffer, [buffer]) with
// a Transferable for zero-copy handoff.
//
// Cadence: 1280 samples @ 16kHz = 12.5 frames/second, matching the
// openwakeword pipeline (mel → embed → vad → kw) inference cadence.
//
// Source: 22-RESEARCH.md Pattern 3 (AudioWorklet asset serving) +
// openwakeword_wasm reference implementation.

const FRAME_SIZE = 1280;

class WakeWordChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(FRAME_SIZE);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex++] = channel[i];
      if (this.bufferIndex === FRAME_SIZE) {
        // Slice cria uma cópia em um novo ArrayBuffer, que pode ser
        // transferido zero-copy para a main thread. Depois do transfer,
        // este processor recria seu buffer interno.
        const frame = this.buffer.slice();
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this.bufferIndex = 0;
      }
    }

    // Retornar true mantém o processor vivo.
    return true;
  }
}

registerProcessor('wake-word-chunker', WakeWordChunker);
