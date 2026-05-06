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
import { shell } from 'electron';
import type { ActionExecuteResult } from '../../shared/ipc-types.js';
import { runExecFile, describeError } from './validators.js';

/** 1 MB limit for viewContent (D-04) */
const VIEW_CONTENT_MAX_BYTES = 1024 * 1024;

/**
 * openFolder — opens a folder in the OS file explorer.
 * Uses Electron shell.openPath() which is cross-platform (Finder/Files/Explorer).
 */
export async function openFolderHandler(folderPath: string): Promise<ActionExecuteResult> {
  try {
    const errMsg = await shell.openPath(folderPath);
    if (errMsg) {
      return { success: false, error: `shell.openPath failed: ${errMsg}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/**
 * openFile — opens a file in its default application.
 * Uses shell.openPath() — Electron routes to the registered default app.
 */
export async function openFileHandler(filePath: string): Promise<ActionExecuteResult> {
  try {
    const errMsg = await shell.openPath(filePath);
    if (errMsg) {
      return { success: false, error: `shell.openPath failed: ${errMsg}` };
    }
    return { success: true };
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
