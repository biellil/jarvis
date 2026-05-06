/**
 * file-actions.test.ts — Phase 55 (LACT-01..05)
 *
 * Unit tests for the 4 OS action handlers:
 *   - openFolderHandler: uses shell.openPath
 *   - openFileHandler: uses shell.openPath
 *   - closeFileHandler: uses runExecFile (taskkill on win32, pkill on others)
 *   - viewContentHandler: uses fs.promises.stat + fs.promises.readFile, 1MB limit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  },
}));

// ---------- Imports (after mocks) ----------

import { shell } from 'electron';
import * as validators from '../validators.js';
import fs from 'node:fs/promises';
import {
  openFolderHandler,
  openFileHandler,
  closeFileHandler,
  viewContentHandler,
} from '../file-actions.js';

const mockShell = shell as { openPath: ReturnType<typeof vi.fn> };
const mockRunExecFile = validators.runExecFile as ReturnType<typeof vi.fn>;
const mockStat = fs.stat as ReturnType<typeof vi.fn>;
const mockReadFile = fs.readFile as ReturnType<typeof vi.fn>;

// ---------- Tests ----------

describe('openFolderHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success when shell.openPath resolves with empty string', async () => {
    mockShell.openPath.mockResolvedValue('');
    const result = await openFolderHandler('/home/user/Downloads');
    expect(result).toEqual({ success: true });
    expect(mockShell.openPath).toHaveBeenCalledWith('/home/user/Downloads');
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
    expect(mockShell.openPath).toHaveBeenCalledWith('/home/user/Documents/notes.txt');
  });

  it('returns failure when shell.openPath returns an error string', async () => {
    mockShell.openPath.mockResolvedValue('File not found');
    const result = await openFileHandler('/home/user/Documents/missing.pdf');
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
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
