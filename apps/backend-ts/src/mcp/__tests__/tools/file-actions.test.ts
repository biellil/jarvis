import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

// Mock fs/promises at module level to avoid ESM spy restrictions
const mockReaddir = vi.fn();
vi.mock('fs/promises', () => ({
  readdir: (...args: any[]) => mockReaddir(...args),
  stat: vi.fn(),
  readFile: vi.fn(),
}));

const registeredTools: Record<string, { handler: Function }> = {};
const mockServer = {
  tool: vi.fn((name: string, _params: unknown, handler: Function) => {
    registeredTools[name] = { handler };
  }),
};

const { registerFileActionTools } = await import('../../tools/file-actions.js');

describe('registerFileActionTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredTools).forEach(k => delete registeredTools[k]);
    registerFileActionTools(mockServer as any);
  });

  it('registers list_files, openFile, openFolder, viewContent', () => {
    expect(Object.keys(registeredTools).sort()).toEqual(
      ['list_files', 'openFile', 'openFolder', 'viewContent'].sort()
    );
  });

  it('list_files returns isError for path outside allowed dirs', async () => {
    const result = await registeredTools['list_files']!.handler({ path: '/etc/passwd' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Access denied/);
  });

  it('viewContent returns isError for path outside allowed dirs', async () => {
    const result = await registeredTools['viewContent']!.handler({ path: '/etc/hosts' });
    expect(result.isError).toBe(true);
  });

  it('list_files returns JSON entries for allowed dir (mocked fs)', async () => {
    // Use real home dir + Downloads for a valid path
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    // Mock readdir response
    mockReaddir.mockResolvedValueOnce([
      { name: 'file.txt', isDirectory: () => false },
    ]);
    const result = await registeredTools['list_files']!.handler({ path: downloadsPath });
    expect(result.isError).toBeFalsy();
    const entries = JSON.parse(result.content[0].text);
    expect(entries[0].name).toBe('file.txt');
  });
});
