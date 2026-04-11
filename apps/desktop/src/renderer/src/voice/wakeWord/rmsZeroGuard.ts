/**
 * RmsZeroGuard — sliding window zero-detection para detectar mic silenciado
 * (driver morto, hw mute, mute de sistema). Mitiga PITFALL #7 do research.
 *
 * Contrato: observe() recebe Float32Array por chunk; se a janela de
 * `windowFrames` frames consecutivos tiver rms < epsilon, `onSilentStream` é
 * chamado exatamente 1 vez e o guard fica "tripped" (idempotente) até
 * reset(). Um frame não-zero no meio da janela reseta a contagem.
 *
 * Defaults: 63 frames ~= 5s @ 12.5Hz cadência do worklet (1280 @ 16kHz).
 */
export interface RmsZeroGuardOptions {
  windowFrames: number; // default 63
  epsilon: number; // default 1e-8
  onSilentStream: () => void;
}

export class RmsZeroGuard {
  private zeroStreakFrames = 0;
  private tripped = false;

  constructor(private readonly opts: RmsZeroGuardOptions) {}

  observe(chunk: Float32Array): void {
    if (this.tripped) return;
    let sumSq = 0;
    for (let i = 0; i < chunk.length; i++) {
      const s = chunk[i];
      sumSq += s * s;
    }
    const rms = chunk.length > 0 ? Math.sqrt(sumSq / chunk.length) : 0;
    if (rms < this.opts.epsilon) {
      this.zeroStreakFrames++;
      if (this.zeroStreakFrames >= this.opts.windowFrames) {
        this.tripped = true;
        this.opts.onSilentStream();
      }
    } else {
      this.zeroStreakFrames = 0;
    }
  }

  reset(): void {
    this.zeroStreakFrames = 0;
    this.tripped = false;
  }
}
