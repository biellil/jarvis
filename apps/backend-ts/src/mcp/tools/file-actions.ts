// Phase 64 — MCP file action tools (MCP-SRV-01, D-05, D-07, D-15)
// Exposes: list_files, openFile, openFolder, viewContent
// Path validation via isPathValid() — copied from apps/gateway/src/lib/path-validator.ts (Phase 54 pattern)
// Cross-package import not supported in backend-ts tsconfig, so function is inlined below.
// CRITICAL: never use console.log() — corrupts stdio JSON-RPC (D-04).
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Copied from apps/gateway/src/lib/path-validator.ts — Phase 54 pattern
const WHITELISTED_DIRS = ['Downloads', 'Documents', 'Desktop'];

function isPathValid(userPath: string): boolean {
  if (!userPath) return false;
  try {
    const home = os.homedir();
    const absolutePath = path.resolve(userPath);
    // Must be inside home or be home itself
    if (!absolutePath.startsWith(home + path.sep) && absolutePath !== home) {
      return false;
    }
    const relative = path.relative(home, absolutePath);
    // Home itself
    if (relative === '' || relative === '.') return true;
    // Reject any path containing '..' (traversal after resolve — belt-and-suspenders)
    if (relative.includes('..')) return false;
    const topDir = relative.split(path.sep)[0];
    return WHITELISTED_DIRS.includes(topDir!);
  } catch {
    return false;
  }
}

const MAX_VIEW_BYTES = 50 * 1024; // 50KB cap for viewContent

function pathSchema(description: string) {
  return z.object({ path: z.string().describe(description) });
}

export function registerFileActionTools(server: McpServer): void {
  // list_files
  server.tool(
    'list_files',
    {
      description: 'Lists files and subdirectories in a given directory. Requires absolute path inside allowed directories (Downloads, Documents, Desktop).',
      inputSchema: pathSchema('Absolute path to directory'),
    },
    async ({ path: dirPath }: { path: string }) => {
      if (!isPathValid(dirPath)) {
        return {
          content: [{ type: 'text' as const, text: `Access denied: path '${dirPath}' is outside allowed directories (Downloads, Documents, Desktop).` }],
          isError: true,
        };
      }
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
        return { content: [{ type: 'text' as const, text: JSON.stringify(files, null, 2) }] };
      } catch (err) {
        console.error('[MCP] list_files error:', err);
        return {
          content: [{ type: 'text' as const, text: `Error listing '${dirPath}': ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // openFile
  server.tool(
    'openFile',
    {
      description: 'Opens a file using the default OS application. Requires absolute path inside allowed directories.',
      inputSchema: pathSchema('Absolute file path'),
    },
    async ({ path: filePath }: { path: string }) => {
      if (!isPathValid(filePath)) {
        return {
          content: [{ type: 'text' as const, text: `Access denied: path '${filePath}' is outside allowed directories.` }],
          isError: true,
        };
      }
      // MCP layer confirms; actual OS open is dispatched via Electron (same model as pc-tools.ts)
      return { content: [{ type: 'text' as const, text: `File open requested: ${filePath}` }] };
    },
  );

  // openFolder
  server.tool(
    'openFolder',
    {
      description: 'Opens a folder in the OS file explorer. Requires absolute path inside allowed directories.',
      inputSchema: pathSchema('Absolute folder path'),
    },
    async ({ path: folderPath }: { path: string }) => {
      if (!isPathValid(folderPath)) {
        return {
          content: [{ type: 'text' as const, text: `Access denied: path '${folderPath}' is outside allowed directories.` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text' as const, text: `Folder open requested: ${folderPath}` }] };
    },
  );

  // viewContent
  server.tool(
    'viewContent',
    {
      description: 'Reads and returns the text content of a file. Max 50KB. Requires absolute path inside allowed directories.',
      inputSchema: pathSchema('Absolute file path to read'),
    },
    async ({ path: filePath }: { path: string }) => {
      if (!isPathValid(filePath)) {
        return {
          content: [{ type: 'text' as const, text: `Access denied: path '${filePath}' is outside allowed directories.` }],
          isError: true,
        };
      }
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_VIEW_BYTES) {
          return {
            content: [{ type: 'text' as const, text: `File too large (${(stat.size / 1024).toFixed(0)}KB). Maximum is 50KB.` }],
            isError: true,
          };
        }
        const content = await fs.readFile(filePath, 'utf-8');
        return { content: [{ type: 'text' as const, text: content }] };
      } catch (err) {
        console.error('[MCP] viewContent error:', err);
        return {
          content: [{ type: 'text' as const, text: `Error reading '${filePath}': ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
