import { describe, it, expect } from 'vitest';
import { snapshotMcpVars, diffMcpVars, WATCHED_KEYS } from '../env-diff.js';

describe('env-diff (D-09)', () => {
  describe('WATCHED_KEYS', () => {
    it('exports exactly the 3 MCP_SERVER_* keys', () => {
      expect(WATCHED_KEYS).toEqual([
        'MCP_SERVER_URL',
        'MCP_SERVER_BEARER',
        'MCP_SERVER_NAME',
      ]);
    });
  });

  describe('snapshotMcpVars', () => {
    it('reads MCP_SERVER_URL from .env when .env.local missing', () => {
      const snap = snapshotMcpVars('MCP_SERVER_URL=http://x\n');
      expect(snap.MCP_SERVER_URL).toBe('http://x');
      expect(snap.MCP_SERVER_BEARER).toBeUndefined();
      expect(snap.MCP_SERVER_NAME).toBeUndefined();
    });

    it('.env.local overrides .env', () => {
      const env = 'MCP_SERVER_URL=http://a\nMCP_SERVER_NAME=ena\n';
      const local = 'MCP_SERVER_URL=http://b\n';
      const snap = snapshotMcpVars(env, local);
      expect(snap.MCP_SERVER_URL).toBe('http://b');  // overridden
      expect(snap.MCP_SERVER_NAME).toBe('ena');       // preserved
    });

    it('handles only .env.local present', () => {
      const snap = snapshotMcpVars(undefined, 'MCP_SERVER_URL=http://only\n');
      expect(snap.MCP_SERVER_URL).toBe('http://only');
    });

    it('returns all undefined when both files missing', () => {
      const snap = snapshotMcpVars(undefined, undefined);
      expect(snap.MCP_SERVER_URL).toBeUndefined();
      expect(snap.MCP_SERVER_BEARER).toBeUndefined();
      expect(snap.MCP_SERVER_NAME).toBeUndefined();
    });

    it('ignores non-MCP keys', () => {
      const snap = snapshotMcpVars('LLM_PROVIDER=lmstudio\nMCP_SERVER_URL=http://x\nFOO=bar\n');
      expect(Object.keys(snap)).toEqual(['MCP_SERVER_URL', 'MCP_SERVER_BEARER', 'MCP_SERVER_NAME']);
    });
  });

  describe('diffMcpVars', () => {
    const baseline = {
      MCP_SERVER_URL: 'http://a',
      MCP_SERVER_BEARER: 'tok',
      MCP_SERVER_NAME: 'n8n',
    };

    it('identical snapshots → false', () => {
      expect(diffMcpVars(baseline, { ...baseline })).toBe(false);
    });

    it('MCP_SERVER_URL differs → true', () => {
      expect(diffMcpVars(baseline, { ...baseline, MCP_SERVER_URL: 'http://b' })).toBe(true);
    });

    it('NAME goes from undefined to set → true', () => {
      const empty = { MCP_SERVER_URL: undefined, MCP_SERVER_BEARER: undefined, MCP_SERVER_NAME: undefined };
      const next = { ...empty, MCP_SERVER_NAME: 'n8n' };
      expect(diffMcpVars(empty, next)).toBe(true);
    });

    it('non-MCP key changes are ignored (defensive)', () => {
      const a = { ...baseline, EXTRA: 'foo' } as any;
      const b = { ...baseline, EXTRA: 'bar' } as any;
      expect(diffMcpVars(a, b)).toBe(false);
    });
  });
});
