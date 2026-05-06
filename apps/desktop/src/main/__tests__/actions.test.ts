/**
 * Tests for PC action handlers (Phase 18_5-03).
 *
 * Mocks `node:child_process` (execFile) and `node:fs/promises`. Verifies:
 *   - happy path args are passed as an array (no shell)
 *   - invalid args return structured errors without invoking subprocess
 *   - ENOENT → command_not_found / path_not_found
 *   - killed (timeout) → subprocess_timeout
 *   - EACCES → permission_denied
 *   - ACTION_HANDLERS exposes the 9 expected keys
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  readdir: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
}));

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>;
const statMock = fs.stat as unknown as ReturnType<typeof vi.fn>;
const readdirMock = fs.readdir as unknown as ReturnType<typeof vi.fn>;
const renameMock = fs.rename as unknown as ReturnType<typeof vi.fn>;
const unlinkMock = fs.unlink as unknown as ReturnType<typeof vi.fn>;

import { setVolumeHandler } from '../actions/set-volume.js';
import { setBrightnessHandler } from '../actions/set-brightness.js';
import { listProcessesHandler } from '../actions/list-processes.js';
import { openAppHandler } from '../actions/open-app.js';
import { closeAppHandler } from '../actions/close-app.js';
import { listFilesHandler } from '../actions/list-files.js';
import { searchFilesHandler } from '../actions/search-files.js';
import { moveFileHandler } from '../actions/move-file.js';
import { deleteFileHandler } from '../actions/delete-file.js';
import { ACTION_HANDLERS, REQUIRES_CONFIRMATION } from '../actions/index.js';

/** Helper: make execFile mock resolve with given stdout. */
function mockExecOk(stdout = '', stderr = '') {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(null, stdout, stderr);
  });
}

/** Helper: make execFile mock fail with an error shape. */
function mockExecFail(err: Record<string, unknown>, stderr = '') {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(err, '', stderr);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------- system handlers ----------

describe('setVolumeHandler', () => {
  test('invokes pactl with array args (happy path)', async () => {
    mockExecOk('ok');
    const res = await setVolumeHandler({ level: 50 });
    expect(res.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const call = execFileMock.mock.calls[0];
    expect(call[0]).toBe('pactl');
    expect(call[1]).toEqual(['set-sink-volume', '@DEFAULT_SINK@', '50%']);
    expect(call[2]).toMatchObject({ timeout: 30_000 });
  });

  test('rejects out-of-range level without calling execFile', async () => {
    const res = await setVolumeHandler({ level: 150 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid_args/);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  test('rejects non-integer level', async () => {
    const res = await setVolumeHandler({ level: 'loud' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid_args/);
  });

  test('maps ENOENT to command_not_found', async () => {
    mockExecFail({ code: 'ENOENT' });
    const res = await setVolumeHandler({ level: 10 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/command_not_found/);
  });

  test('maps killed=true to subprocess_timeout', async () => {
    mockExecFail({ killed: true });
    const res = await setVolumeHandler({ level: 10 });
    expect(res.success).toBe(false);
    expect(res.error).toBe('subprocess_timeout');
  });

  test('maps EACCES to permission_denied', async () => {
    mockExecFail({ code: 'EACCES' });
    const res = await setVolumeHandler({ level: 10 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/permission_denied/);
  });
});

describe('setBrightnessHandler', () => {
  test('invokes brightnessctl with array args', async () => {
    mockExecOk('ok');
    await setBrightnessHandler({ level: 75 });
    const call = execFileMock.mock.calls[0];
    expect(call[0]).toBe('brightnessctl');
    expect(call[1]).toEqual(['set', '75%']);
  });

  test('rejects invalid level', async () => {
    const res = await setBrightnessHandler({ level: -1 });
    expect(res.success).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe('listProcessesHandler', () => {
  test('calls ps with array args and returns stdout', async () => {
    mockExecOk('PID COMM %CPU %MEM\n1 init 0.0 0.1\n');
    const res = await listProcessesHandler({});
    expect(res.success).toBe(true);
    const call = execFileMock.mock.calls[0];
    expect(call[0]).toBe('ps');
    expect(call[1]).toEqual(['-eo', 'pid,comm,pcpu,pmem', '--sort=-pcpu']);
    if (res.success) expect(res.output).toContain('init');
  });
});

// ---------- app handlers ----------

describe('openAppHandler', () => {
  test('invokes xdg-open with validated app name', async () => {
    mockExecOk();
    await openAppHandler({ app: 'firefox' });
    expect(execFileMock.mock.calls[0][0]).toBe('xdg-open');
    expect(execFileMock.mock.calls[0][1]).toEqual(['firefox']);
  });

  test('rejects unsafe app name with semicolon (injection attempt)', async () => {
    const res = await openAppHandler({ app: 'firefox; rm -rf /' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid_args/);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  test('rejects empty app name', async () => {
    const res = await openAppHandler({ app: '' });
    expect(res.success).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe('closeAppHandler', () => {
  test('invokes pkill -f with validated app name', async () => {
    mockExecOk();
    await closeAppHandler({ app: 'vlc' });
    expect(execFileMock.mock.calls[0][0]).toBe('pkill');
    expect(execFileMock.mock.calls[0][1]).toEqual(['-f', 'vlc']);
  });

  test('pkill exit != 0 maps to no matching process', async () => {
    mockExecFail({ code: 1 }, '');
    const res = await closeAppHandler({ app: 'nothing' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('subprocess_failed: no matching process');
  });

  test('rejects unsafe name', async () => {
    const res = await closeAppHandler({ app: 'foo bar' });
    expect(res.success).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

// ---------- file handlers ----------

describe('listFilesHandler', () => {
  test('happy path returns JSON list', async () => {
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockResolvedValue([
      { name: 'a.txt', isDirectory: () => false },
      { name: 'sub', isDirectory: () => true },
    ]);
    const res = await listFilesHandler({ directory: '/tmp' });
    expect(res.success).toBe(true);
    if (res.success) {
      const parsed = JSON.parse(res.output!);
      expect(parsed).toEqual([
        { name: 'a.txt', type: 'file' },
        { name: 'sub', type: 'dir' },
      ]);
    }
  });

  test('rejects relative path', async () => {
    const res = await listFilesHandler({ directory: '~/Desktop' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path_must_be_absolute/);
    expect(statMock).not.toHaveBeenCalled();
  });

  test('rejects ./ relative path', async () => {
    const res = await listFilesHandler({ directory: './foo' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path_must_be_absolute/);
  });

  test('ENOENT maps to path_not_found', async () => {
    const err: NodeJS.ErrnoException = new Error('nope');
    err.code = 'ENOENT';
    statMock.mockRejectedValue(err);
    const res = await listFilesHandler({ directory: '/no/such/dir' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path_not_found/);
  });

  test('non-directory returns invalid_args', async () => {
    statMock.mockResolvedValue({ isDirectory: () => false });
    const res = await listFilesHandler({ directory: '/etc/hosts' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid_args/);
  });
});

describe('searchFilesHandler', () => {
  test('invokes find with validated args', async () => {
    mockExecOk('/tmp/a.txt\n');
    await searchFilesHandler({ directory: '/tmp', pattern: '*.txt' });
    const call = execFileMock.mock.calls[0];
    expect(call[0]).toBe('find');
    expect(call[1]).toEqual(['/tmp', '-maxdepth', '5', '-name', '*.txt']);
  });

  test('rejects pattern with ..', async () => {
    const res = await searchFilesHandler({ directory: '/tmp', pattern: '..' });
    expect(res.success).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  test('rejects pattern with slash', async () => {
    const res = await searchFilesHandler({ directory: '/tmp', pattern: 'sub/x' });
    expect(res.success).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  test('rejects relative directory', async () => {
    const res = await searchFilesHandler({ directory: 'tmp', pattern: '*.txt' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path_must_be_absolute/);
  });
});

describe('moveFileHandler', () => {
  test('calls fs.rename with absolute paths', async () => {
    renameMock.mockResolvedValue(undefined);
    const res = await moveFileHandler({ source: '/tmp/a', destination: '/tmp/b' });
    expect(res.success).toBe(true);
    expect(renameMock).toHaveBeenCalledWith('/tmp/a', '/tmp/b');
  });

  test('rejects relative source', async () => {
    const res = await moveFileHandler({ source: '~/a', destination: '/tmp/b' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path_must_be_absolute/);
    expect(renameMock).not.toHaveBeenCalled();
  });

  test('ENOENT maps to path_not_found', async () => {
    const err: NodeJS.ErrnoException = new Error('no');
    err.code = 'ENOENT';
    renameMock.mockRejectedValue(err);
    const res = await moveFileHandler({ source: '/tmp/a', destination: '/tmp/b' });
    expect(res.error).toMatch(/path_not_found/);
  });

  test('EXDEV reports cross-device error', async () => {
    const err: NodeJS.ErrnoException = new Error('xdev');
    err.code = 'EXDEV';
    renameMock.mockRejectedValue(err);
    const res = await moveFileHandler({ source: '/tmp/a', destination: '/other/b' });
    expect(res.error).toMatch(/cross-device/);
  });
});

describe('deleteFileHandler', () => {
  test('calls fs.unlink on absolute path', async () => {
    unlinkMock.mockResolvedValue(undefined);
    const res = await deleteFileHandler({ path: '/tmp/foo.txt' });
    expect(res.success).toBe(true);
    expect(unlinkMock).toHaveBeenCalledWith('/tmp/foo.txt');
  });

  test('rejects relative path', async () => {
    const res = await deleteFileHandler({ path: '../foo' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/path_must_be_absolute/);
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  test('ENOENT maps to path_not_found', async () => {
    const err: NodeJS.ErrnoException = new Error('no');
    err.code = 'ENOENT';
    unlinkMock.mockRejectedValue(err);
    const res = await deleteFileHandler({ path: '/tmp/nope' });
    expect(res.error).toMatch(/path_not_found/);
  });
});

// ---------- barrel ----------

describe('ACTION_HANDLERS barrel', () => {
  test('exports the 9 legacy snake_case actions + 4 Phase 55 camelCase actions', () => {
    const keys = Object.keys(ACTION_HANDLERS).sort();
    // 9 legacy backend tool actions (snake_case)
    expect(keys).toContain('close_app');
    expect(keys).toContain('delete_file');
    expect(keys).toContain('list_files');
    expect(keys).toContain('list_processes');
    expect(keys).toContain('move_file');
    expect(keys).toContain('open_app');
    expect(keys).toContain('search_files');
    expect(keys).toContain('set_brightness');
    expect(keys).toContain('set_volume');
    // 4 Phase 55 LLM file action handlers (camelCase, per FileAction in ipc-types.ts)
    expect(keys).toContain('openFolder');
    expect(keys).toContain('openFile');
    expect(keys).toContain('closeFile');
    expect(keys).toContain('viewContent');
    expect(keys).toHaveLength(13);
  });

  test('REQUIRES_CONFIRMATION contains delete_file only', () => {
    expect([...REQUIRES_CONFIRMATION].sort()).toEqual(['delete_file']);
  });

  test('every handler is an async function', () => {
    for (const [name, handler] of Object.entries(ACTION_HANDLERS)) {
      expect(typeof handler, name).toBe('function');
    }
  });
});
