/**
 * envPath.test.ts — testes para resolveEnvPath()
 *
 * Phase 71 D-07: single source of truth para caminho do .env em dev vs packaged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((key: string) => (key === 'userData' ? '/tmp/jarvis-test' : '/tmp')),
  },
}));

describe('resolveEnvPath', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns userData/.env when app.isPackaged is true', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;
    const { resolveEnvPath } = await import('../envPath.js');
    expect(resolveEnvPath()).toBe('/tmp/jarvis-test/.env');
  });

  it('returns monorepo root .env when app.isPackaged is false', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = false;
    const { resolveEnvPath } = await import('../envPath.js');
    const result = resolveEnvPath();
    expect(result).toMatch(/\.env$/);
    expect(result).not.toContain('/tmp/jarvis-test');
  });

  it('is pure — multiple calls return same value', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;
    const { resolveEnvPath } = await import('../envPath.js');
    expect(resolveEnvPath()).toBe(resolveEnvPath());
  });
});
