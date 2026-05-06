/**
 * viewContentHandler — reads a text file and returns its content (Phase 55, LACT-05).
 *
 * Follows the ActionHandler interface (args: Record<string, unknown>).
 * Enforces 1MB size limit (D-04) via fs.stat before reading.
 * Returns content in ActionResult.output on success.
 *
 * NEVER logs full content — only first 100 chars in debug (privacy).
 */
import { promises as fs } from 'node:fs';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { describeError } from './validators.js';

const MAX_FILE_SIZE = 1_048_576; // 1MB — per D-04

export const viewContentHandler: ActionHandler = async (args) => {
  const path = args['path'];
  if (typeof path !== 'string' || path.length === 0) {
    return fail('invalid_args: path must be a non-empty string');
  }
  try {
    const stats = await fs.stat(path);
    if (stats.size >= MAX_FILE_SIZE) {
      return fail(`file too large: ${stats.size} bytes > 1MB limit`);
    }
    const content = await fs.readFile(path, 'utf-8');
    // Per D-04: NEVER log full content — truncate to 100 chars for debug
    console.debug(`[viewContent] read ${stats.size} bytes (preview: ${content.slice(0, 100)})`);
    return ok(content);
  } catch (err) {
    return fail(describeError(err));
  }
};
