/**
 * Barrel export for PC action handlers (Phase 18_5-03).
 *
 * `ACTION_HANDLERS` maps the backend action names (snake_case, as emitted by
 * `apps/backend-ts/src/session/pc-tools.ts`) to their executor.
 *
 * `REQUIRES_CONFIRMATION` is the set of actions that must prompt the user
 * before the executor (18_5-04) invokes the handler.
 */
import type { ActionHandler } from './types.js';
import { openAppHandler } from './open-app.js';
import { closeAppHandler } from './close-app.js';
import { listFilesHandler } from './list-files.js';
import { searchFilesHandler } from './search-files.js';
import { moveFileHandler } from './move-file.js';
import { deleteFileHandler } from './delete-file.js';
import { setVolumeHandler } from './set-volume.js';
import { setBrightnessHandler } from './set-brightness.js';
import { listProcessesHandler } from './list-processes.js';

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  open_app: openAppHandler,
  close_app: closeAppHandler,
  list_files: listFilesHandler,
  search_files: searchFilesHandler,
  move_file: moveFileHandler,
  delete_file: deleteFileHandler,
  set_volume: setVolumeHandler,
  set_brightness: setBrightnessHandler,
  list_processes: listProcessesHandler,
};

export const REQUIRES_CONFIRMATION: Set<string> = new Set(['delete_file']);

export type { ActionHandler, ActionResult } from './types.js';
