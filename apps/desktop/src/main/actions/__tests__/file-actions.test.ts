/**
 * file-actions.test.ts — Phase 55 (LACT-01..05)
 *
 * Unit tests for the 4 OS action handlers:
 *   - openFolderHandler: uses shell.openPath
 *   - openFileHandler: uses shell.openPath
 *   - closeFileHandler: uses runExecFile (taskkill on win32, pkill on others)
 *   - viewContentHandler: uses fs.promises.stat + fs.promises.readFile, 1MB limit
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mocks ----------

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(),
  },
}));

vi.mock('../validators.js', () => ({
  runExecFile: vi.fn(),
  describeError: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
  }),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    stat: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock('open', () => ({
  open: vi.fn(),
}));

// ---------- Imports (after mocks) ----------

import { shell } from 'electron';
import * as validators from '../validators.js';
import fs from 'node:fs/promises';
import * as openModule from 'open';
import {
  openFolderHandler,
  openFileHandler,
  closeFileHandler,
  viewContentHandler,
  deleteFileHandler,
  moveFileHandler,
  renameFileHandler,
} from '../file-actions.js';

const mockShell = shell as { openPath: ReturnType<typeof vi.fn> };
const mockRunExecFile = validators.runExecFile as ReturnType<typeof vi.fn>;
const mockStat = fs.stat as ReturnType<typeof vi.fn>;
const mockReadFile = fs.readFile as ReturnType<typeof vi.fn>;
const mockUnlink = fs.unlink as ReturnType<typeof vi.fn>;
const mockRename = fs.rename as ReturnType<typeof vi.fn>;
const mockOpen = openModule.open as ReturnType<typeof vi.fn>;

// ---------- Tests ----------

describe('openFolderHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success when shell.openPath resolves with empty string', async () => {
    mockShell.openPath.mockResolvedValue('');
    const result = await openFolderHandler('/home/user/Downloads');
    expect(result).toEqual({ success: true });
    // path.resolve() may transform POSIX paths on Windows — check filename is preserved
    expect(mockShell.openPath).toHaveBeenCalledWith(expect.stringContaining('Downloads'));
  });

  it('returns failure when shell.openPath returns an error string', async () => {
    mockShell.openPath.mockResolvedValue('No application found for path');
    const result = await openFolderHandler('/home/user/Downloads');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No application found for path');
  });

  it('returns failure when shell.openPath throws', async () => {
    mockShell.openPath.mockRejectedValue(new Error('Permission denied'));
    const result = await openFolderHandler('/home/user/Downloads');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('openFileHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success when shell.openPath resolves with empty string', async () => {
    mockShell.openPath.mockResolvedValue('');
    const result = await openFileHandler('/home/user/Documents/notes.txt');
    expect(result).toEqual({ success: true });
    // path.resolve() may transform POSIX paths on Windows — check filename is preserved
    expect(mockShell.openPath).toHaveBeenCalledWith(expect.stringContaining('notes.txt'));
  });

  it('returns failure when shell.openPath returns an error string', async () => {
    mockShell.openPath.mockResolvedValue('File not found');
    mockOpen.mockRejectedValue(new Error('open failed'));
    const result = await openFileHandler('/home/user/Documents/missing.pdf');
    expect(result.success).toBe(false);
    expect(result.error).toContain('shell.openPath returned');
  });

  it('falls back to open() package when shell.openPath returns error string', async () => {
    mockShell.openPath.mockResolvedValue('No handler for .zip');
    mockOpen.mockResolvedValue(undefined);
    const result = await openFileHandler('/home/user/Downloads/archive.zip');
    expect(result).toEqual({ success: true });
    expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('archive.zip'));
  });

  it('returns error when both shell.openPath and open() fail', async () => {
    mockShell.openPath.mockResolvedValue('No handler for .zip');
    mockOpen.mockRejectedValue(new Error('open failed'));
    const result = await openFileHandler('/home/user/Downloads/archive.zip');
    expect(result.success).toBe(false);
    expect(result.error).toContain('shell.openPath returned');
    expect(result.error).toContain('fallback open() also failed');
  });
});

describe('closeFileHandler', () => {
  const originalPlatform = process.platform;

  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses taskkill on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockRunExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await closeFileHandler('notepad.exe');
    expect(result).toEqual({ success: true });
    expect(mockRunExecFile).toHaveBeenCalledWith('taskkill', ['/IM', 'notepad.exe', '/F']);
  });

  it('uses pkill on non-Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockRunExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await closeFileHandler('Preview');
    expect(result).toEqual({ success: true });
    expect(mockRunExecFile).toHaveBeenCalledWith('pkill', ['-f', 'Preview']);
  });

  it('uses pkill on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockRunExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await closeFileHandler('evince');
    expect(result).toEqual({ success: true });
    expect(mockRunExecFile).toHaveBeenCalledWith('pkill', ['-f', 'evince']);
  });

  it('returns failure when process not found', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const err = new Error('subprocess_failed: no process found');
    mockRunExecFile.mockRejectedValue(err);

    const result = await closeFileHandler('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('viewContentHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns file content on success', async () => {
    mockStat.mockResolvedValue({ size: 100 });
    mockReadFile.mockResolvedValue('Hello, World!');

    const result = await viewContentHandler('/home/user/Documents/notes.txt');
    expect(result).toEqual({ success: true, content: 'Hello, World!' });
    expect(mockReadFile).toHaveBeenCalledWith('/home/user/Documents/notes.txt', 'utf-8');
  });

  it('returns failure when file exceeds 1MB limit', async () => {
    mockStat.mockResolvedValue({ size: 2 * 1024 * 1024 }); // 2MB

    const result = await viewContentHandler('/home/user/Downloads/huge.log');
    expect(result.success).toBe(false);
    expect(result.error).toContain('File too large');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('returns failure when file is exactly at limit (1MB) — allowed', async () => {
    mockStat.mockResolvedValue({ size: 1024 * 1024 }); // exactly 1MB — on boundary
    mockReadFile.mockResolvedValue('content at boundary');

    const result = await viewContentHandler('/home/user/Documents/boundary.txt');
    // Exactly 1MB (not exceeding) — should succeed
    expect(result.success).toBe(true);
    expect(result.content).toBe('content at boundary');
  });

  it('returns failure when file stat throws (file not found)', async () => {
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await viewContentHandler('/home/user/Documents/missing.txt');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns failure when readFile throws (permission denied)', async () => {
    mockStat.mockResolvedValue({ size: 100 });
    mockReadFile.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    const result = await viewContentHandler('/root/secret.txt');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('deleteFileHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls fs.unlink with resolved path and returns success', async () => {
    mockUnlink.mockResolvedValue(undefined);
    const result = await deleteFileHandler('/home/user/Downloads/old.txt');
    expect(result).toEqual({ success: true });
    expect(mockUnlink).toHaveBeenCalled();
  });

  it('returns failure when fs.unlink throws EACCES', async () => {
    mockUnlink.mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    );
    const result = await deleteFileHandler('/root/protected.txt');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('moveFileHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls fs.rename with decoded src and dest paths', async () => {
    mockRename.mockResolvedValue(undefined);
    const result = await moveFileHandler('/home/user/src.txt::/home/user/dest.txt');
    expect(result).toEqual({ success: true });
    expect(mockRename).toHaveBeenCalled();
  });

  it('returns failure when src::dest encoding is invalid', async () => {
    const result = await moveFileHandler('/home/user/src.txt');
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid path encoding');
  });

  it('returns failure when fs.rename throws', async () => {
    mockRename.mockRejectedValue(new Error('ENOENT'));
    const result = await moveFileHandler('/home/user/missing.txt::/home/user/dest.txt');
    expect(result.success).toBe(false);
  });
});

describe('renameFileHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls fs.rename with resolved src and dest when newName is absolute', async () => {
    mockRename.mockResolvedValue(undefined);
    const result = await renameFileHandler('/home/user/old.txt::/home/user/new.txt');
    expect(result).toEqual({ success: true });
  });

  it('calls fs.rename relative to src dir when newName is filename only', async () => {
    mockRename.mockResolvedValue(undefined);
    const result = await renameFileHandler('/home/user/docs/old.txt::new.txt');
    expect(result).toEqual({ success: true });
    const calls = mockRename.mock.calls;
    expect(calls[0][1]).toContain('new.txt');
  });

  it('returns failure when src::newName encoding is invalid', async () => {
    const result = await renameFileHandler('/home/user/old.txt');
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid path encoding');
  });
});
