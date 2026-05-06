/**
 * File action dispatcher — Phase 55 (LACT-01..05)
 *
 * Routes FileAction enum values to their concrete handler.
 * Called by the IPC handler (fileActions.ts) after receiving the
 * actions:execute invoke from the renderer.
 */
import os from 'os';
import nodePath from 'path';
import type { FileAction, ActionExecuteResult } from '../../shared/ipc-types.js';
import {
  openFolderHandler,
  openFileHandler,
  closeFileHandler,
  viewContentHandler,
} from './file-actions.js';

const KNOWN_DIRS: Record<string, string> = {
  downloads: 'Downloads',
  documents: 'Documents',
  desktop: 'Desktop',
  pictures: 'Pictures',
  music: 'Music',
  videos: 'Videos',
};

/**
 * Resolves a path that may be relative, use ~, or be a well-known folder name
 * (e.g. "Downloads") into an absolute path using the real OS home directory.
 * closeFile receives a process name — returned unchanged.
 */
function resolvePath(action: FileAction, p: string): string {
  if (action === 'closeFile') return p;
  const trimmed = p.trim();
  // Expand ~ or ~/...
  if (trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return nodePath.join(os.homedir(), trimmed.slice(1));
  }
  // Well-known short names (case-insensitive): "Downloads" → "%HOMEDIR%\Downloads"
  const lower = trimmed.toLowerCase();
  if (KNOWN_DIRS[lower]) {
    return nodePath.join(os.homedir(), KNOWN_DIRS[lower]!);
  }
  // Already absolute
  if (nodePath.isAbsolute(trimmed)) return trimmed;
  // Relative — resolve against home
  return nodePath.join(os.homedir(), trimmed);
}

/**
 * Dispatches an OS action based on action type.
 *
 * @param action - FileAction type from the LLM request
 * @param path - File/folder path (absolute, ~-prefixed, or well-known name), or process name for closeFile
 * @returns ActionExecuteResult with success/error and optional content
 */
export async function dispatchFileAction(
  action: FileAction,
  path: string,
): Promise<ActionExecuteResult> {
  const resolvedPath = resolvePath(action, path);
  console.log('[file-action-dispatcher] resolved path:', JSON.stringify(path), '→', JSON.stringify(resolvedPath));
  // Replace path with resolved for all downstream handlers
  path = resolvedPath;
  switch (action) {
    case 'openFolder':
      return openFolderHandler(path);
    case 'openFile':
      return openFileHandler(path);
    case 'closeFile':
      return closeFileHandler(path);
    case 'viewContent':
      return viewContentHandler(path);
    default: {
      // TypeScript exhaustiveness check — should never reach here
      const _exhaustive: never = action;
      return { success: false, error: `Unknown action: ${String(_exhaustive)}` };
    }
  }
}
