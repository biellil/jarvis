/**
 * actions-phase55.test.ts — Phase 55 Wave 0 acceptance tests (LACT-01..05)
 *
 * Verifies the 4 new ActionHandler-interface handlers created in Phase 55:
 *   - openFolderHandler (open-folder.ts)
 *   - openFileHandler   (open-file.ts)
 *   - closeFileHandler  (close-file.ts)
 *   - viewContentHandler (view-content.ts)
 *
 * Also verifies that ACTION_HANDLERS in index.ts exposes these 4 new handlers.
 *
 * These handlers follow the ActionHandler interface:
 *   (args: Record<string, unknown>) => Promise<ActionResult>
 * using ok()/fail() from types.ts (not ActionExecuteResult from ipc-types.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mocks ----------

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(),
  },
}));

vi.mock('../../main/actions/validators.js', () => ({
  assertSafeAppName: vi.fn((v: unknown) => {
    if (typeof v !== 'string' || v.length === 0) throw new Error('invalid_args');
    if (!/^[a-zA-Z0-9._\-+]+$/.test(v)) throw new Error('invalid_args: unsafe characters');
    return v;
  }),
  runExecFile: vi.fn(),
  describeError: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
  }),
}));

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}));

// ---------- Imports (after mocks) ----------

import { shell } from 'electron';
import * as validators from '../../main/actions/validators.js';
import * as fsModule from 'node:fs';
import { openFolderHandler } from '../actions/open-folder.js';
import { openFileHandler } from '../actions/open-file.js';
import { closeFileHandler } from '../actions/close-file.js';
import { viewContentHandler } from '../actions/view-content.js';
import { ACTION_HANDLERS } from '../actions/index.js';

const mockShell = shell as { openPath: ReturnType<typeof vi.fn> };
const mockRunExecFile = validators.runExecFile as ReturnType<typeof vi.fn>;
const mockStat = (fsModule.promises as { stat: ReturnType<typeof vi.fn> }).stat;
const mockReadFile = (fsModule.promises as { readFile: ReturnType<typeof vi.fn> }).readFile;

// ---------- openFolderHandler ----------

describe('openFolderHandler (Phase 55)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok() when shell.openPath resolves with empty string', async () => {
    mockShell.openPath.mockResolvedValue('');
    const result = await openFolderHandler({ path: '/home/user/Downloads' });
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.output).toContain('opened folder');
    expect(mockShell.openPath).toHaveBeenCalledWith('/home/user/Downloads');
  });

  it('returns fail() when shell.openPath returns an error message', async () => {
    mockShell.openPath.mockResolvedValue('No application found');
    const result = await openFolderHandler({ path: '/home/user/Downloads' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No application found');
  });

  it('returns fail() for missing path arg', async () => {
    const result = await openFolderHandler({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid_args');
  });
});

// ---------- openFileHandler ----------

describe('openFileHandler (Phase 55)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok() when shell.openPath resolves with empty string', async () => {
    mockShell.openPath.mockResolvedValue('');
    const result = await openFileHandler({ path: '/home/user/Documents/notes.txt' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('opened file');
  });

  it('returns fail() when shell.openPath returns an error message', async () => {
    mockShell.openPath.mockResolvedValue('File not found');
    const result = await openFileHandler({ path: '/home/user/missing.pdf' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });
});

// ---------- closeFileHandler ----------

describe('closeFileHandler (Phase 55)', () => {
  const originalPlatform = process.platform;

  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses taskkill on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockRunExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    const result = await closeFileHandler({ processName: 'notepad.exe' });
    expect(result.success).toBe(true);
    expect(mockRunExecFile).toHaveBeenCalledWith('taskkill', ['/IM', 'notepad.exe', '/F']);
  });

  it('uses pkill on non-Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockRunExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    const result = await closeFileHandler({ processName: 'Preview' });
    expect(result.success).toBe(true);
    expect(mockRunExecFile).toHaveBeenCalledWith('pkill', ['-f', 'Preview']);
  });

  it('returns fail() when process kill throws', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockRunExecFile.mockRejectedValue(new Error('no process found'));
    const result = await closeFileHandler({ processName: 'nonexistent' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------- viewContentHandler ----------

describe('viewContentHandler (Phase 55)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok() with file content on success', async () => {
    mockStat.mockResolvedValue({ size: 100 });
    mockReadFile.mockResolvedValue('Hello, World!');
    const result = await viewContentHandler({ path: '/home/user/notes.txt' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello, World!');
  });

  it('returns fail() when file exceeds 1MB limit (>= 1_048_576)', async () => {
    mockStat.mockResolvedValue({ size: 1_048_576 }); // exactly 1MB — should fail (>=)
    const result = await viewContentHandler({ path: '/home/user/big.log' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('file too large');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('returns fail() for missing path arg', async () => {
    const result = await viewContentHandler({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid_args');
  });

  it('returns fail() when stat throws', async () => {
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await viewContentHandler({ path: '/missing.txt' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------- ACTION_HANDLERS barrel ----------

describe('ACTION_HANDLERS includes Phase 55 handlers', () => {
  it('includes openFolder, openFile, closeFile, viewContent', () => {
    expect(ACTION_HANDLERS['openFolder']).toBeDefined();
    expect(ACTION_HANDLERS['openFile']).toBeDefined();
    expect(ACTION_HANDLERS['closeFile']).toBeDefined();
    expect(ACTION_HANDLERS['viewContent']).toBeDefined();
  });

  it('all 4 new handlers are async functions', () => {
    for (const key of ['openFolder', 'openFile', 'closeFile', 'viewContent']) {
      const handler = ACTION_HANDLERS[key];
      expect(typeof handler, key).toBe('function');
    }
  });
});
