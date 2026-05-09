// @vitest-environment happy-dom
/**
 * Orb — agentBadgeText prop tests (Phase 66 D-12)
 *
 * Verifies that the Orb badge correctly swaps text when agentBadgeText is set,
 * aria-label updates appropriately, and badge colors stay at voice-mode values.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Orb } from '../Orb.js';

// Mock OrbContext to control state/voiceMode
vi.mock('../OrbContext', () => ({
  useOrbContext: vi.fn(() => ({
    state: 'idle',
    wakeWordPaused: false,
    burstActive: false,
    voiceMode: 'wake-word',
  })),
}));

import { useOrbContext } from '../OrbContext';

describe('Orb — agentBadgeText prop (D-12)', () => {
  it('when agentBadgeText is undefined, badge shows voice-mode label (WW for wake-word)', () => {
    const { container } = render(<Orb />);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('WW');
    expect(badge.getAttribute('aria-label')).toContain('Wake Word');
  });

  it('when agentBadgeText="AGENT 3/7", badge shows "AGENT 3/7" instead of voice-mode label', () => {
    const { container } = render(<Orb agentBadgeText="AGENT 3/7" />);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AGENT 3/7');
  });

  it('badge border + text color CSS are NOT changed when agentBadgeText is set (D-12 — stays voice-mode-colored)', () => {
    const { container: withAgent } = render(<Orb agentBadgeText="AGENT 1/3" />);
    const { container: withoutAgent } = render(<Orb />);

    const agentBadge = withAgent.querySelector('[role="status"]') as HTMLElement;
    const defaultBadge = withoutAgent.querySelector('[role="status"]') as HTMLElement;

    // Both badges should have the same border color (voice-mode cyan for wake-word)
    expect(agentBadge.style.borderColor).toBe(defaultBadge.style.borderColor);
    expect(agentBadge.style.color).toBe(defaultBadge.style.color);
  });

  it('aria-label becomes "Agente executando — passo {N} de {M}" when agentBadgeText is set', () => {
    const { container } = render(<Orb agentBadgeText="AGENT 3/7" />);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.getAttribute('aria-label')).toBe('Agente executando — passo 3 de 7');
  });

  it('badge auto-reverts when agentBadgeText returns to undefined', () => {
    const { container, rerender } = render(<Orb agentBadgeText="AGENT 2/5" />);
    let badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AGENT 2/5');

    rerender(<Orb agentBadgeText={undefined} />);
    badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('WW');
  });

  it('badge transition integration — task:step:start changes AGENT N/M from 1/2 to 2/2', () => {
    // Simulate the sequence: task starts step 1, then step 2
    const { container, rerender } = render(<Orb agentBadgeText="AGENT 1/2" />);
    let badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AGENT 1/2');

    rerender(<Orb agentBadgeText="AGENT 2/2" />);
    badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AGENT 2/2');

    // After task:done, badge reverts to voice-mode label
    rerender(<Orb agentBadgeText={undefined} />);
    badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('WW');
  });

  it('works correctly with always-listening voice mode (AL badge)', () => {
    (useOrbContext as ReturnType<typeof vi.fn>).mockReturnValue({
      state: 'idle',
      wakeWordPaused: false,
      burstActive: false,
      voiceMode: 'always-listening',
    });

    const { container, rerender } = render(<Orb />);
    let badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AL');

    rerender(<Orb agentBadgeText="AGENT 1/3" />);
    badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AGENT 1/3');
    expect(badge.getAttribute('aria-label')).toBe('Agente executando — passo 1 de 3');

    rerender(<Orb />);
    badge = container.querySelector('[role="status"]')!;
    expect(badge.textContent).toBe('AL');
  });
});
