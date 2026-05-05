/**
 * Vitest setup file — registers a minimal AudioContext mock on globalThis
 * so happy-dom-based tests for streamingTtsPlayer can decode/schedule
 * Web Audio nodes without a real audio device.
 *
 * Tests that want to assert on scheduling can read:
 *   (getAudioContext() as any)._scheduledStarts // [{ source, when }, ...]
 *   (getAudioContext() as any)._stoppedSources  // [source, ...]
 *
 * Tests that want to control decoded buffer durations can set:
 *   (globalThis as any).__nextDecodedDuration = 1.5; // applies to next decodeAudioData
 *
 * Existing ttsPlayer tests still vi.stubGlobal('AudioContext', ...) — that
 * override takes precedence over this default and remains unaffected.
 */

class FakeAudioBuffer {
  constructor(public duration: number, public sampleRate = 44100) {}
}

class FakeAudioBufferSourceNode {
  buffer: FakeAudioBuffer | null = null;
  onended: (() => void) | null = null;
  private _started = false;
  private _stopped = false;
  private _startWhen = 0;
  constructor(private ctx: FakeAudioContext) {}
  connect(_dest: unknown): void {
    /* noop */
  }
  start(when = 0): void {
    if (this._started) return;
    this._started = true;
    this._startWhen = when;
    this.ctx._scheduledStarts.push({ source: this, when });
  }
  stop(): void {
    if (this._stopped) return;
    this._stopped = true;
    this.ctx._stoppedSources.push(this);
    if (this.onended) queueMicrotask(this.onended);
  }
  get __startWhen(): number {
    return this._startWhen;
  }
  get __stopped(): boolean {
    return this._stopped;
  }
}

class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = {};
  _scheduledStarts: { source: FakeAudioBufferSourceNode; when: number }[] = [];
  _stoppedSources: FakeAudioBufferSourceNode[] = [];

  decodeAudioData(_buf: ArrayBuffer): Promise<FakeAudioBuffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const override = (globalThis as any).__nextDecodedDuration as
      | number
      | undefined;
    const dur = typeof override === 'number' ? override : 1.0;
    if (override !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__nextDecodedDuration = undefined;
    }
    return Promise.resolve(new FakeAudioBuffer(dur));
  }
  createBufferSource(): FakeAudioBufferSourceNode {
    return new FakeAudioBufferSourceNode(this);
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).AudioContext = FakeAudioContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__FakeAudioContext = FakeAudioContext;

export {};
