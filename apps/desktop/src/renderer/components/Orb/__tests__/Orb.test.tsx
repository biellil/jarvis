/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Orb } from '../Orb';
import * as OrbContext from '../OrbContext';

// Mock the context to control state
vi.mock('../OrbContext', () => ({
  useOrbContext: vi.fn(),
}));

describe('Orb component', () => {
  it('renders with idle animation and cyan color (ORB-01)', () => {
    vi.mocked(OrbContext.useOrbContext).mockReturnValue({
      state: 'idle',
      setState: vi.fn(),
    });

    const { container } = render(<Orb />);
    const orb = container.querySelector('.animate-pulse-idle');

    expect(orb).toBeInTheDocument();

    // Check background contains cyan color
    const style = orb?.getAttribute('style');
    expect(style).toContain('#06B6D4');

    // Should NOT have ripple rings in idle
    const rings = container.querySelectorAll('.animate-ripple');
    expect(rings).toHaveLength(0);
  });

  it('renders with listening animation and amber color (ORB-02)', () => {
    vi.mocked(OrbContext.useOrbContext).mockReturnValue({
      state: 'listening',
      setState: vi.fn(),
    });

    const { container } = render(<Orb />);
    const orb = container.querySelector('.animate-pulse-listen');

    expect(orb).toBeInTheDocument();

    // Check background contains amber color
    const style = orb?.getAttribute('style');
    expect(style).toContain('#F59E0B');
  });

  it('renders with processing animation and violet color (ORB-03)', () => {
    vi.mocked(OrbContext.useOrbContext).mockReturnValue({
      state: 'processing',
      setState: vi.fn(),
    });

    const { container } = render(<Orb />);
    const orb = container.querySelector('.animate-spin-process');

    expect(orb).toBeInTheDocument();

    // Check background contains violet color
    const style = orb?.getAttribute('style');
    expect(style).toContain('#8B5CF6');
  });

  it('renders with responding state and 3 ripple rings (ORB-04)', () => {
    vi.mocked(OrbContext.useOrbContext).mockReturnValue({
      state: 'responding',
      setState: vi.fn(),
    });

    const { container } = render(<Orb />);
    const rings = container.querySelectorAll('.animate-ripple');

    expect(rings).toHaveLength(3);

    // Check staggered delays per D-09
    expect(rings[0]).toHaveStyle({ animationDelay: '0s' });
    expect(rings[1]).toHaveStyle({ animationDelay: '0.5s' });
    expect(rings[2]).toHaveStyle({ animationDelay: '1s' });

    // Blue color for responding
    const orb = container.querySelector('[style*="#3B82F6"]');
    expect(orb).toBeInTheDocument();
  });

  it('applies 300ms transition for smooth state changes (D-04)', () => {
    vi.mocked(OrbContext.useOrbContext).mockReturnValue({
      state: 'idle',
      setState: vi.fn(),
    });

    const { container } = render(<Orb />);
    // Find orb by its inline style (width: 96px)
    const orb = container.querySelector('[style*="width: 96px"]');

    expect(orb).toHaveStyle({
      transition: 'all 0.3s ease-in-out'
    });
  });
});
