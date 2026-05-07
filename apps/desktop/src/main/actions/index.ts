/**
 * Barrel export for PC action handlers (Phase 18_5-03).
 *
 * `ACTION_HANDLERS` maps the backend action names (snake_case, as emitted by
 * `apps/backend-ts/src/session/pc-tools.ts`) to their executor.
 *
 * `REQUIRES_CONFIRMATION` is the set of actions that must prompt the user
 * before the executor (18_5-04) invokes the handler.
 *
 * Phase 55 (LACT-01..05): FILE_ACTION_HANDLERS maps FileAction camelCase names
 * to the new OS-level handlers (openFolder, openFile, closeFile, viewContent).
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
// Phase 55 — LLM file action handlers (LACT-01..05)
import { openFolderHandler } from './open-folder.js';
import { openFileHandler } from './open-file.js';
import { closeFileHandler } from './close-file.js';
import { viewContentHandler } from './view-content.js';
// Phase 59 — system controls (SYSCTRL-01, SYSCTRL-02)
import { adjustVolumeHandler } from './adjust-volume.js';
import { toggleMuteHandler } from './toggle-mute.js';
import { mediaControlHandler } from './media-control.js';

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
  // Phase 55 — LLM file actions (camelCase, per FileAction type in ipc-types.ts)
  openFolder: openFolderHandler,
  openFile: openFileHandler,
  closeFile: closeFileHandler,
  viewContent: viewContentHandler,
  // Phase 59 — system controls (SYSCTRL-01, SYSCTRL-02)
  adjust_volume: adjustVolumeHandler,
  toggle_mute: toggleMuteHandler,
  media_control: mediaControlHandler,
};

export const REQUIRES_CONFIRMATION: Set<string> = new Set(['delete_file']);

export type { ActionHandler, ActionResult } from './types.js';
