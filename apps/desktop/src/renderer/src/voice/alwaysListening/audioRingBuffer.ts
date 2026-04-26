/**
 * AudioRingBuffer — Fixed-size circular buffer para pre-roll de áudio (VLISTEN-03).
 *
 * Implementação: Float32Array estática com writeHead/readHead circulares.
 * NÃO usa dynamic array (push/pop) — previne memory leak em sessões longas (Pitfall #2).
 *
 * Capacidade recomendada: 500ms @ 16kHz = 8000 samples → construir com 16000 para margem.
 *
 * @see .planning/phases/40-always-listening-intent-classifier/40-RESEARCH.md §Pattern 3
 * @see .planning/phases/40-always-listening-intent-classifier/40-CONTEXT.md D-03
 */
export class AudioRingBuffer {
  private readonly buffer: Float32Array;
  private writeHead = 0;
  private readHead = 0;
  private count = 0; // samples disponíveis para read

  constructor(private readonly capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  /**
   * write — escreve samples no buffer circular.
   * Se buffer está cheio, sobrescreve os samples mais antigos (oldest-first discard).
   */
  write(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeHead] = samples[i]!;
      this.writeHead = (this.writeHead + 1) % this.capacity;

      if (this.count < this.capacity) {
        this.count++;
      } else {
        // Buffer cheio: avança readHead (descarta oldest)
        this.readHead = (this.readHead + 1) % this.capacity;
      }
    }
  }

  /**
   * toArray — retorna todos os samples disponíveis em ordem cronológica.
   * Drena o buffer após a leitura (clear implícito).
   */
  toArray(): Float32Array {
    const size = this.count;
    const result = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const pos = (this.readHead + i) % this.capacity;
      result[i] = this.buffer[pos]!;
    }

    this.clear();
    return result;
  }

  /**
   * clear — reseta ponteiros sem realocar o backing array (zero GC pressure).
   */
  clear(): void {
    this.writeHead = 0;
    this.readHead = 0;
    this.count = 0;
  }

  /** Número de samples disponíveis para leitura. */
  getSize(): number {
    return this.count;
  }
}
