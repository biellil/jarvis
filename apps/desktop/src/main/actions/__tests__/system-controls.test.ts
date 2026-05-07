/**
 * system-controls.test.ts — Phase 59 (SYSCTRL-01, SYSCTRL-02)
 *
 * Unit tests for the three OS system-control action handlers:
 *   - adjustVolumeHandler: delta-based volume adjustment, clamps to [0,100]
 *   - toggleMuteHandler: inverts current mute state
 *   - mediaControlHandler: play_pause / next_track / prev_track
 *
 * Tests also cover assertDelta validator edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mocks ----------

vi.mock('../validators.js', () => ({
  runExecFile: vi.fn(),
  describeError: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
  }),
  assertDelta: vi.fn((v: unknown) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < -100 || v > 100) {
      const err = new Error(`invalid_args: delta must be integer in [-100, 100]`);
      (err as unknown as { code: string }).code = 'invalid_args';
      throw err;
    }
    return v as number;
  }),
  ActionValidationError: class ActionValidationError extends Error {
    code: string;
    constructor(code: string, detail?: string) {
      super(detail ? `${code}: ${detail}` : code);
      this.code = code;
      this.name = 'ActionValidationError';
    }
  },
}));

// ---------- Imports (after mocks) ----------

import * as validators from '../validators.js';
import { adjustVolumeHandler } from '../adjust-volume.js';
import { toggleMuteHandler } from '../toggle-mute.js';
import { mediaControlHandler } from '../media-control.js';

const mockRunExecFile = validators.runExecFile as ReturnType<typeof vi.fn>;

// ---------- Helpers ----------

const originalPlatform = process.platform;

function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

// ---------- assertDelta (via validators mock) ----------

describe('assertDelta (validator)', () => {
  it('accepts 0', () => {
    expect(validators.assertDelta(0)).toBe(0);
  });

  it('accepts 100 (max)', () => {
    expect(validators.assertDelta(100)).toBe(100);
  });

  it('accepts -100 (min)', () => {
    expect(validators.assertDelta(-100)).toBe(-100);
  });

  it('throws for 101 (over max)', () => {
    expect(() => validators.assertDelta(101)).toThrow('invalid_args');
  });

  it('throws for -101 (under min)', () => {
    expect(() => validators.assertDelta(-101)).toThrow('invalid_args');
  });

  it('throws for 1.5 (non-integer)', () => {
    expect(() => validators.assertDelta(1.5)).toThrow('invalid_args');
  });

  it('throws for "10" (string)', () => {
    expect(() => validators.assertDelta('10')).toThrow('invalid_args');
  });
});

// ---------- adjustVolumeHandler ----------

describe('adjustVolumeHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform('linux');
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  describe('Linux branch', () => {
    it('reads current volume and sets new level (delta +10 from 50 = 60)', async () => {
      mockRunExecFile
        .mockResolvedValueOnce({
          stdout: 'Volume: front-left: 32768 / 50% / 50%, mono: 32768 / 50% / 50%',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await adjustVolumeHandler({ delta: 10 });
      expect(result.success).toBe(true);
      expect(result.output).toBe('volume adjusted to 60%');
      expect(mockRunExecFile).toHaveBeenNthCalledWith(1, 'pactl', [
        'get-sink-volume',
        '@DEFAULT_SINK@',
      ]);
      expect(mockRunExecFile).toHaveBeenNthCalledWith(2, 'pactl', [
        'set-sink-volume',
        '@DEFAULT_SINK@',
        '60%',
      ]);
    });

    it('clamps to 100 when delta would exceed max (current=90, delta=+20)', async () => {
      mockRunExecFile
        .mockResolvedValueOnce({
          stdout: 'Volume: front-left: 58982 / 90% / 90%',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await adjustVolumeHandler({ delta: 20 });
      expect(result.success).toBe(true);
      expect(result.output).toBe('volume adjusted to 100%');
      expect(mockRunExecFile).toHaveBeenNthCalledWith(2, 'pactl', [
        'set-sink-volume',
        '@DEFAULT_SINK@',
        '100%',
      ]);
    });

    it('clamps to 0 when delta would go below min (current=5, delta=-20)', async () => {
      mockRunExecFile
        .mockResolvedValueOnce({
          stdout: 'Volume: front-left: 3276 / 5% / 5%',
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await adjustVolumeHandler({ delta: -20 });
      expect(result.success).toBe(true);
      expect(result.output).toBe('volume adjusted to 0%');
      expect(mockRunExecFile).toHaveBeenNthCalledWith(2, 'pactl', [
        'set-sink-volume',
        '@DEFAULT_SINK@',
        '0%',
      ]);
    });

    it('returns failure when subprocess throws', async () => {
      mockRunExecFile.mockRejectedValueOnce(new Error('pactl: command not found'));

      const result = await adjustVolumeHandler({ delta: 10 });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('invalid delta', () => {
    it('returns failure for delta=101', async () => {
      const result = await adjustVolumeHandler({ delta: 101 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_args');
    });

    it('returns failure for non-integer delta', async () => {
      const result = await adjustVolumeHandler({ delta: 1.5 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_args');
    });
  });
});

// ---------- toggleMuteHandler ----------

describe('toggleMuteHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform('linux');
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  describe('Linux branch', () => {
    it('returns muted when was unmuted (Mute: no)', async () => {
      mockRunExecFile
        .mockResolvedValueOnce({ stdout: 'Mute: no', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await toggleMuteHandler({});
      expect(result.success).toBe(true);
      expect(result.output).toBe('muted');
      expect(mockRunExecFile).toHaveBeenNthCalledWith(1, 'pactl', [
        'get-sink-mute',
        '@DEFAULT_SINK@',
      ]);
      expect(mockRunExecFile).toHaveBeenNthCalledWith(2, 'pactl', [
        'set-sink-mute',
        '@DEFAULT_SINK@',
        'toggle',
      ]);
    });

    it('returns unmuted when was muted (Mute: yes)', async () => {
      mockRunExecFile
        .mockResolvedValueOnce({ stdout: 'Mute: yes', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await toggleMuteHandler({});
      expect(result.success).toBe(true);
      expect(result.output).toBe('unmuted');
    });

    it('returns failure when subprocess throws', async () => {
      mockRunExecFile.mockRejectedValueOnce(new Error('pactl: command not found'));

      const result = await toggleMuteHandler({});
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});

// ---------- mediaControlHandler ----------

describe('mediaControlHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform('linux');
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  describe('Linux branch', () => {
    it('sends play-pause to playerctl', async () => {
      mockRunExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await mediaControlHandler({ command: 'play_pause' });
      expect(result.success).toBe(true);
      expect(result.output).toBe('media: play_pause');
      expect(mockRunExecFile).toHaveBeenCalledWith('playerctl', ['play-pause']);
    });

    it('sends next to playerctl for next_track', async () => {
      mockRunExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await mediaControlHandler({ command: 'next_track' });
      expect(result.success).toBe(true);
      expect(result.output).toBe('media: next_track');
      expect(mockRunExecFile).toHaveBeenCalledWith('playerctl', ['next']);
    });

    it('sends previous to playerctl for prev_track', async () => {
      mockRunExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await mediaControlHandler({ command: 'prev_track' });
      expect(result.success).toBe(true);
      expect(result.output).toBe('media: prev_track');
      expect(mockRunExecFile).toHaveBeenCalledWith('playerctl', ['previous']);
    });

    it('returns failure with playerctl message when playerctl missing (ENOENT)', async () => {
      const enoentErr = new Error('command_not_found: playerctl');
      (enoentErr as unknown as { code: string }).code = 'command_not_found';
      mockRunExecFile.mockRejectedValueOnce(enoentErr);

      const result = await mediaControlHandler({ command: 'play_pause' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('playerctl');
    });
  });

  describe('validation', () => {
    it('returns failure for unknown command', async () => {
      const result = await mediaControlHandler({ command: 'stop' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('play_pause');
    });

    it('returns failure when command is not a string', async () => {
      const result = await mediaControlHandler({ command: 42 });
      expect(result.success).toBe(false);
    });

    it('returns failure when command is missing', async () => {
      const result = await mediaControlHandler({});
      expect(result.success).toBe(false);
    });
  });
});
