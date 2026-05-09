// @vitest-environment happy-dom
import { describe, it } from 'vitest';

describe('Orb — agentBadgeText prop (D-12)', () => {
  it.todo('when agentBadgeText is undefined, badge shows voice-mode label (WW/AL/PTT)');
  it.todo('when agentBadgeText="AGENT 3/7", badge shows "AGENT 3/7" instead of voice-mode label');
  it.todo('badge border + text colors stay at current voice-mode values (no new accent color)');
  it.todo('aria-label becomes "Agente executando — passo {N} de {M}" when agentBadgeText is set');
  it.todo('badge auto-reverts when agentBadgeText returns to undefined');
});
