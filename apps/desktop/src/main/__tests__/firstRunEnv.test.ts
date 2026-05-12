/**
 * firstRunEnv.test.ts — testes para ensureUserEnvFile()
 *
 * Phase 71 D-08: first-run copy idempotente de .env.example → userData/.env
 * com chmod 0o600 em POSIX (T-71-01 mitigation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de electron
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((key: string) => (key === 'userData' ? '/tmp/jarvis-test' : '/tmp')),
  },
}));

// Mock de node:fs (síncrono)
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn(),
  },
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

// Mock de node:process — mantemos platform configurável nos testes
const mockProcess = {
  platform: 'linux' as string,
  resourcesPath: '/tmp/resources',
};
vi.mock('node:process', () => ({
  default: mockProcess,
}));

describe('ensureUserEnvFile', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 1: dev mode (isPackaged=false) → retorna false sem chamadas a fs', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = false;

    const { ensureUserEnvFile } = await import('../firstRunEnv.js');
    const result = ensureUserEnvFile();

    expect(result).toBe(false);
    const fs = await import('node:fs');
    expect(fs.default.copyFileSync).not.toHaveBeenCalled();
    expect(fs.default.mkdirSync).not.toHaveBeenCalled();
  });

  it('Test 2: isPackaged=true AND .env já existe → no-op (idempotent guard)', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;

    const fs = await import('node:fs');
    (fs.default.existsSync as ReturnType<typeof vi.fn>).mockImplementation((_p: unknown) => {
      // .env exists → guard hits first
      return true;
    });

    const { ensureUserEnvFile } = await import('../firstRunEnv.js');
    const result = ensureUserEnvFile();

    expect(result).toBe(false);
    expect(fs.default.copyFileSync).not.toHaveBeenCalled();
  });

  it('Test 3: isPackaged=true AND .env ausente AND template existe → copia arquivo', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;

    const fs = await import('node:fs');
    (fs.default.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: unknown) => {
      const s = String(p);
      // .env não existe; template existe
      if (s.endsWith('.env')) return false;
      if (s.endsWith('.env.example')) return true;
      return false;
    });

    const { ensureUserEnvFile } = await import('../firstRunEnv.js');
    const result = ensureUserEnvFile();

    expect(result).toBe(true);
    expect(fs.default.mkdirSync).toHaveBeenCalledOnce();
    expect(fs.default.copyFileSync).toHaveBeenCalledOnce();
  });

  it('Test 4: isPackaged=true AND .env ausente AND template ausente → warn, sem cópia', async () => {
    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;

    const fs = await import('node:fs');
    (fs.default.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ensureUserEnvFile } = await import('../firstRunEnv.js');
    const result = ensureUserEnvFile();

    expect(result).toBe(false);
    expect(fs.default.copyFileSync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('Test 5: POSIX → fs.chmodSync chamado com 0o600 após cópia bem-sucedida', async () => {
    // platform = linux (não win32) → chmod deve ser chamado
    mockProcess.platform = 'linux';

    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;

    const fs = await import('node:fs');
    (fs.default.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith('.env')) return false;
      if (s.endsWith('.env.example')) return true;
      return false;
    });

    const { ensureUserEnvFile } = await import('../firstRunEnv.js');
    ensureUserEnvFile();

    expect(fs.default.chmodSync).toHaveBeenCalledWith(expect.stringContaining('.env'), 0o600);
  });

  it('Test 6: win32 → fs.chmodSync NÃO é chamado (Windows usa ACL do NTFS)', async () => {
    mockProcess.platform = 'win32';

    const electron = await import('electron');
    (electron.app as unknown as { isPackaged: boolean }).isPackaged = true;

    const fs = await import('node:fs');
    (fs.default.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: unknown) => {
      const s = String(p);
      if (s.endsWith('.env')) return false;
      if (s.endsWith('.env.example')) return true;
      return false;
    });

    const { ensureUserEnvFile } = await import('../firstRunEnv.js');
    ensureUserEnvFile();

    expect(fs.default.chmodSync).not.toHaveBeenCalled();
  });
});
