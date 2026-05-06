/**
 * File action dispatcher — Phase 55 (LACT-01..05)
 *
 * Routes FileAction enum values to their concrete handler.
 * Called by the IPC handler (fileActions.ts) after receiving the
 * actions:execute invoke from the renderer.
 */
import type { FileAction, ActionExecuteResult } from '../../shared/ipc-types.js';
import {
  openFolderHandler,
  openFileHandler,
  closeFileHandler,
  viewContentHandler,
} from './file-actions.js';

/**
 * Dispatches an OS action based on action type.
 *
 * @param action - FileAction type from the LLM request
 * @param path - Absolute file/folder path, or process name for closeFile (D-07)
 * @returns ActionExecuteResult with success/error and optional content
 */
export async function dispatchFileAction(
  action: FileAction,
  path: string,
): Promise<ActionExecuteResult> {
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
