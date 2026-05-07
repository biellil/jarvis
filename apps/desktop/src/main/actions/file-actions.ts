/**
 * File action handlers for LLM-initiated OS operations — Phase 55 (LACT-01..05)
 *
 * Each handler follows the ok()/fail() pattern from ActionResult but returns
 * ActionExecuteResult (Phase 55 type) which includes optional content for viewContent.
 *
 * Execution order: renderer confirms → calls IPC actions:execute →
 * main dispatches here → result returned to renderer → renderer sends ACK.
 * ACK status reflects what really happened in the OS (D-12, D-13).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import open from 'open';
import type { ActionExecuteResult } from '../../shared/ipc-types.js';
import { runExecFile, describeError } from './validators.js';

/** 1 MB limit for viewContent (D-04) */
const VIEW_CONTENT_MAX_BYTES = 1024 * 1024;

/**
 * openFolder — opens a folder in the OS file explorer.
 * Uses Electron shell.openPath() which is cross-platform (Finder/Files/Explorer).
 */
export async function openFolderHandler(folderPath: string): Promise<ActionExecuteResult> {
  console.log('[file-actions] openFolder path:', folderPath);
  try {
    const safePath = path.resolve(folderPath);
    const errMsg = await shell.openPath(safePath);
    console.log('[file-actions] openFolder shell.openPath result:', JSON.stringify(errMsg));
    if (errMsg) {
      return { success: false, error: `shell.openPath failed: ${errMsg}` };
    }
    return { success: true };
  } catch (err) {
    console.error('[file-actions] openFolder threw:', err);
    return { success: false, error: describeError(err) };
  }
}

/**
 * openFile — opens a file in its default application.
 * Uses shell.openPath() — Electron routes to the registered default app.
 */
export async function openFileHandler(filePath: string): Promise<ActionExecuteResult> {
  try {
    const safePath = path.resolve(filePath);
    const errMsg = await shell.openPath(safePath);
    if (!errMsg) {
      return { success: true };
    }
    // shell.openPath failed (e.g. unregistered .zip handler) — try open package
    try {
      await open(safePath);
      return { success: true };
    } catch (fallbackErr) {
      return {
        success: false,
        error: `Unable to open file: shell.openPath returned "${errMsg}"; fallback open() also failed: ${describeError(fallbackErr)}`,
      };
    }
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * closeFile — closes an application by process name (D-05, D-06, D-07).
 * The `processName` parameter is the executable name (e.g. 'notepad.exe', 'Preview').
 * Limitation: closes ALL windows of that process, not just a specific file (D-06).
 *
 * Windows: taskkill /IM <name> /F
 * macOS/Linux: pkill -f <name>
 */
export async function closeFileHandler(processName: string): Promise<ActionExecuteResult> {
  try {
    if (process.platform === 'win32') {
      await runExecFile('taskkill', ['/IM', processName, '/F']);
    } else {
      await runExecFile('pkill', ['-f', processName]);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * viewContent — reads a text file and returns its content (D-01, D-04).
 * Returns content in ActionExecuteResult.content on success.
 * Denies if file exceeds 1MB or is not readable as UTF-8 text.
 */
export async function viewContentHandler(filePath: string): Promise<ActionExecuteResult> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > VIEW_CONTENT_MAX_BYTES) {
      return {
        success: false,
        error: `File too large: ${stat.size} bytes (limit ${VIEW_CONTENT_MAX_BYTES} bytes / 1MB)`,
      };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * deleteFileHandler — removes a file permanently (FACT-11).
 * Requires explicit user confirmation before this handler is called.
 */
export async function deleteFileHandler(filePath: string): Promise<ActionExecuteResult> {
  try {
    const safePath = path.resolve(filePath);
    await fs.unlink(safePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * moveFileHandler — moves a file to a new location (FACT-11).
 * Path encoding: 'sourcePath::destPath' (two absolute paths joined by '::').
 * Requires explicit user confirmation before this handler is called.
 */
export async function moveFileHandler(encodedPath: string): Promise<ActionExecuteResult> {
  try {
    const [src, dest] = encodedPath.split('::');
    if (!src || !dest) {
      return { success: false, error: `moveFile: invalid path encoding, expected 'src::dest', got: ${encodedPath}` };
    }
    await fs.rename(path.resolve(src), path.resolve(dest));
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * renameFileHandler — renames a file in-place (FACT-11).
 * Path encoding: 'currentPath::newName' (current absolute path and new name, joined by '::').
 * newName may be just a filename (e.g. 'notes2.txt') or an absolute path.
 * Requires explicit user confirmation before this handler is called.
 */
export async function renameFileHandler(encodedPath: string): Promise<ActionExecuteResult> {
  try {
    const [src, newName] = encodedPath.split('::');
    if (!src || !newName) {
      return { success: false, error: `renameFile: invalid path encoding, expected 'src::newName', got: ${encodedPath}` };
    }
    const resolvedSrc = path.resolve(src);
    // If newName is just a filename (no separators), resolve it relative to src dir
    const resolvedDest = path.isAbsolute(newName)
      ? newName
      : path.join(path.dirname(resolvedSrc), newName);
    await fs.rename(resolvedSrc, resolvedDest);
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}
