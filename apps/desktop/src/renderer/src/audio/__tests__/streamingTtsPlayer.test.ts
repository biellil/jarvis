/**
 * streamingTtsPlayer tests — Phase 53 Plan 02 (STTS-01)
 *
 * @vitest-environment happy-dom
 *
 * Uses the FakeAudioContext registered by setup-audio-context.ts.
 * Inspect scheduling via (ctx as any)._scheduledStarts and stops via
 * (ctx as any)._stoppedSources.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueueChunk,
  stopTurn,
  setOnFirstSentenceStart,
  __getActiveTurnsForTest,
  __resetStreamingPlayerForTest,
} from '../streamingTtsPlayer';
import {
  __resetAudioContextForTest,
  getAudioContext,
} from '../audioContextSingleton';

interface ScheduledStart {
  source: { buffer: { duration: number } | null; __stopped: boolean };
  when: number;
}
interface CtxInternals {
  currentTime: number;
  state: 'running' | 'suspended';
  _scheduledStarts: ScheduledStart[];
  _stoppedSources: { __stopped: boolean }[];
  resume: () => Promise<void>;
}

function ctx(): CtxInternals {
  return getAudioContext() as unknown as CtxInternals;
}

function makeChunk(
  turnId: string,
  idx: number,
  durationSec: number,
  isLast = false,
): {
  turnId: string;
  idx: number;
  audioBase64: string;
  format: 'mp3';
  isLast: boolean;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__nextDecodedDuration = durationSec;
  return {
    turnId,
    idx,
    audioBase64: btoa('x'.repeat(8)),
    format: 'mp3' as const,
    isLast,
  };
}

beforeEach(() => {
  __resetStreamingPlayerForTest();
  __resetAudioContextForTest();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__nextDecodedDuration = undefined;
});

describe('streamingTtsPlayer — gapless scheduling', () => {
  it('Test 1: schedules in-order chunks with sample-accurate when=lastEnd', async () => {
    await enqueueChunk(makeChunk('T', 0, 1.0));
    await enqueueChunk(makeChunk('T', 1, 2.0));
    await enqueueChunk(makeChunk('T', 2, 0.5));

    const starts = ctx()._scheduledStarts;
    expect(starts).toHaveLength(3);
    expect(starts[0].when).toBe(0);
    expect(starts[1].when).toBe(1.0);
    expect(starts[2].when).toBe(3.0); // 1.0 + 2.0
  });

  it('Test 2: out-of-order arrival (idx=1 before idx=0) drains in idx order', async () => {
    await enqueueChunk(makeChunk('T', 1, 1.0));
    // Nothing scheduled yet — waiting for idx 0
    expect(ctx()._scheduledStarts).toHaveLength(0);

    await enqueueChunk(makeChunk('T', 0, 1.0));
    const starts = ctx()._scheduledStarts;
    expect(starts).toHaveLength(2);
    expect(starts[0].when).toBe(0);
    expect(starts[1].when).toBe(1.0);
  });

  it('Test 3: 3-way out-of-order (2, 0, 1) drains correctly when gap fills', async () => {
    await enqueueChunk(makeChunk('T', 2, 1.0));
    expect(ctx()._scheduledStarts).toHaveLength(0);

    await enqueueChunk(makeChunk('T', 0, 1.0));
    expect(ctx()._scheduledStarts).toHaveLength(1);
    expect(ctx()._scheduledStarts[0].when).toBe(0);

    await enqueueChunk(makeChunk('T', 1, 1.0));
    const starts = ctx()._scheduledStarts;
    expect(starts).toHaveLength(3);
    expect(starts.map((s) => s.when)).toEqual([0, 1.0, 2.0]);
  });
});

describe('streamingTtsPlayer — stopTurn cleanup', () => {
  it('Test 4: stopTurn calls stop() on every active source and clears state', async () => {
    await enqueueChunk(makeChunk('A', 0, 1.0));
    await enqueueChunk(makeChunk('A', 1, 1.0));
    expect(__getActiveTurnsForTest()).toContain('A');

    stopTurn('A');

    expect(ctx()._stoppedSources).toHaveLength(2);
    expect(__getActiveTurnsForTest()).not.toContain('A');

    // Subsequent enqueueChunk('A', idx=0) starts a NEW queue (lastEnd resets to 0)
    await enqueueChunk(makeChunk('A', 0, 1.0));
    const starts = ctx()._scheduledStarts;
    // 2 stopped + 1 fresh schedule = 3 total scheduledStarts entries (Fake doesn't filter)
    // The newest entry's `when` should be 0 because the new queue's lastEnd=0.
    expect(starts[starts.length - 1].when).toBe(0);
  });

  it('Test 5: multi-turn isolation — stopTurn(A) does not affect B', async () => {
    await enqueueChunk(makeChunk('A', 0, 1.0));
    await enqueueChunk(makeChunk('B', 0, 1.0));
    await enqueueChunk(makeChunk('A', 1, 1.0));
    expect(__getActiveTurnsForTest().sort()).toEqual(['A', 'B']);

    stopTurn('A');

    expect(ctx()._stoppedSources).toHaveLength(2); // Both A's sources stopped
    expect(__getActiveTurnsForTest()).toEqual(['B']);
  });
});

describe('streamingTtsPlayer — first-sentence callback (D-07)', () => {
  it('Test 6: onFirstSentenceStart fires once on first chunk, not on subsequent', async () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    setOnFirstSentenceStart(spy);

    await enqueueChunk(makeChunk('T', 0, 1.0));
    // setTimeout(0) — advance just past tick
    await vi.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('T');

    await enqueueChunk(makeChunk('T', 1, 1.0));
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).toHaveBeenCalledTimes(1); // not called again

    vi.useRealTimers();
  });
});

describe('streamingTtsPlayer — suspended AudioContext resume (Pitfall 2)', () => {
  it('Test 7: resume() is awaited before scheduling when context is suspended', async () => {
    const c = ctx();
    c.state = 'suspended';
    const resumeSpy = vi.spyOn(c, 'resume');

    await enqueueChunk(makeChunk('T', 0, 1.0));

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(c._scheduledStarts).toHaveLength(1);
    expect(c.state).toBe('running'); // resume flips it
  });
});
