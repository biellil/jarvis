/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Orb } from '../Orb';
import * as OrbContext from '../OrbContext';

// Mock the context to control state
vi.mock('../OrbContext', () => ({
  useOrbContext: vi.fn(),
}));

type OrbCtx = ReturnType<typeof OrbContext.useOrbContext>;

// Helper — build a context mock with Phase 23 defaults, letting each test
// override only the fields it cares about.
function mockContext(overrides: Partial<OrbCtx> = {}): void {
  vi.mocked(OrbContext.useOrbContext).mockReturnValue({
    state: 'idle',
    setState: vi.fn(),
    wakeWordPaused: false,
    setWakeWordPaused: vi.fn(),
    burstActive: false,
    triggerWakeBurst: vi.fn(),
    ...overrides,
  } as OrbCtx);
}

/** The root div of the orb is the element with `width: 128px` in its inline style. */
function getRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('[style*="width: 128px"]');
  if (!root) throw new Error('orb root not found');
  return root;
}

describe('Orb component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── v1.2 regression coverage ─────────────────────────────────────────

  it('renders with idle animation and cyan gradient (ORB-01)', () => {
    mockContext({ state: 'idle' });

    const { container } = render(<Orb />);
    const sphere = container.querySelector('.animate-pulse-idle');

    expect(sphere).toBeInTheDocument();

    // v1.2 render uses #2BA8D4 (cyan-teal) — the old #06B6D4 literal
    // never existed in Orb.tsx. Asserting the actual rendered value.
    const style = sphere?.getAttribute('style');
    expect(style).toContain('#2BA8D4');

    // Should NOT have ripple rings in idle
    const rings = container.querySelectorAll('.animate-ripple');
    expect(rings).toHaveLength(0);
  });

  it('renders with listening animation and amber gradient (ORB-02)', () => {
    mockContext({ state: 'listening' });

    const { container } = render(<Orb />);
    const sphere = container.querySelector('.animate-pulse-listen');

    expect(sphere).toBeInTheDocument();
    const style = sphere?.getAttribute('style');
    expect(style).toContain('#F59E0B');
  });

  it('renders with processing animation and violet gradient (ORB-03)', () => {
    mockContext({ state: 'processing' });

    const { container } = render(<Orb />);
    const sphere = container.querySelector('.animate-spin-process');

    expect(sphere).toBeInTheDocument();
    const style = sphere?.getAttribute('style');
    expect(style).toContain('#8B5CF6');
  });

  it('renders with responding state and 3 ripple rings (ORB-04)', () => {
    mockContext({ state: 'responding' });

    const { container } = render(<Orb />);
    const rings = container.querySelectorAll('.animate-ripple');

    expect(rings).toHaveLength(3);

    // Staggered delays per D-09 (v1.2)
    expect(rings[0]).toHaveStyle({ animationDelay: '0s' });
    expect(rings[1]).toHaveStyle({ animationDelay: '0.5s' });
    expect(rings[2]).toHaveStyle({ animationDelay: '1s' });

    // Blue gradient for responding
    const sphere = container.querySelector('[style*="#3B82F6"]');
    expect(sphere).toBeInTheDocument();
  });

  it('applies 400ms transition with filter + opacity on the root (D-05)', () => {
    mockContext({ state: 'idle' });

    const { container } = render(<Orb />);
    const root = getRoot(container);
    const transition = root.style.transition;

    // Phase 23 D-05 keeps transitions alive even under reduced-motion —
    // they are safe for vestibular sensitivity and essential for state
    // communication. Duration 0.4s is preserved from v1.2.
    expect(transition).toContain('filter');
    expect(transition).toContain('opacity');
    expect(transition).toContain('0.4s');
  });

  // ─── Phase 23 — wakeWordPaused visual (D-01 + WAKE-04) ────────────────

  describe('wakeWordPaused visual (D-01 + WAKE-04)', () => {
    it('does not apply opacity 0.6 when idle and wakeWordPaused=false', () => {
      mockContext({ state: 'idle', wakeWordPaused: false });

      const { container } = render(<Orb />);
      const root = getRoot(container);

      // Full visibility
      expect(root.style.opacity).toBe('1');
      // Default glow 24px
      expect(root.style.filter).toMatch(/drop-shadow\(0 0 24px /);
    });

    it('applies opacity 0.6 when idle AND wakeWordPaused=true (D-01)', () => {
      mockContext({ state: 'idle', wakeWordPaused: true });

      const { container } = render(<Orb />);
      const root = getRoot(container);

      expect(root.style.opacity).toBe('0.6');
    });

    it('applies drop-shadow radius 12px with alpha 0.28 when paused (D-01)', () => {
      mockContext({ state: 'idle', wakeWordPaused: true });

      const { container } = render(<Orb />);
      const root = getRoot(container);

      expect(root.style.filter).toMatch(/drop-shadow\(0 0 12px rgba\([^)]*0\.28/);
    });

    it('inner sphere border is rgba(180,180,180,0.22) when paused', () => {
      mockContext({ state: 'idle', wakeWordPaused: true });

      const { container } = render(<Orb />);
      const sphere = container.querySelector<HTMLElement>('.animate-pulse-idle');

      expect(sphere).toBeInTheDocument();
      expect(sphere!.style.border).toContain('rgba(180, 180, 180, 0.22)');
    });

    it('IGNORES wakeWordPaused when state !== idle (D-01 — listening overrides)', () => {
      mockContext({ state: 'listening', wakeWordPaused: true });

      const { container } = render(<Orb />);
      const root = getRoot(container);

      // Full brightness even though wakeWordPaused is true
      expect(root.style.opacity).toBe('1');
      // Default glow radius
      expect(root.style.filter).toMatch(/drop-shadow\(0 0 24px /);
    });
  });

  // ─── Phase 23 — wake burst overlay (D-02 + WAKE-02) ───────────────────

  describe('wake burst overlay (D-02 + WAKE-02)', () => {
    it('root div has animate-wake-burst class when burstActive=true', () => {
      mockContext({ state: 'idle', burstActive: true });

      const { container } = render(<Orb />);
      const root = getRoot(container);

      expect(root.className).toContain('animate-wake-burst');
    });

    it('root div does NOT have animate-wake-burst class when burstActive=false', () => {
      mockContext({ state: 'idle', burstActive: false });

      const { container } = render(<Orb />);
      const root = getRoot(container);

      expect(root.className).not.toContain('animate-wake-burst');
    });

    it('renders amber ring overlay (2px #F59E0B) when burstActive=true', () => {
      mockContext({ state: 'idle', burstActive: true });

      const { container } = render(<Orb />);
      const ring = container.querySelector<HTMLElement>('.animate-wake-burst-ring');

      expect(ring).toBeInTheDocument();
      // 2px solid amber, circular, absolute-positioned overlay
      expect(ring!.style.border).toContain('#F59E0B');
      expect(ring!.style.border).toContain('2px');
      expect(ring!.style.borderRadius).toBe('50%');
      expect(ring!.style.position).toBe('absolute');
      expect(ring!.style.pointerEvents).toBe('none');
    });

    it('does NOT render amber ring when burstActive=false', () => {
      mockContext({ state: 'idle', burstActive: false });

      const { container } = render(<Orb />);
      const ring = container.querySelector('.animate-wake-burst-ring');

      expect(ring).not.toBeInTheDocument();
    });

    it('burst overlay works while paused (can flash even when idle+paused)', () => {
      mockContext({ state: 'idle', wakeWordPaused: true, burstActive: true });

      const { container } = render(<Orb />);
      const root = getRoot(container);
      const ring = container.querySelector('.animate-wake-burst-ring');

      // Root has burst class
      expect(root.className).toContain('animate-wake-burst');
      // AND still has paused opacity
      expect(root.style.opacity).toBe('0.6');
      // Ring renders
      expect(ring).toBeInTheDocument();
    });
  });
});
