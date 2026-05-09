/**
 * Phase 65 — single source of truth for native JARVIS tool names.
 *
 * Used by McpClientManager.reload() (boot in index.ts) and the /internal/mcp-client/reload
 * route (live reload). MUST match the names produced inside ChatSession.create() and
 * ChatSession.swapLLM() so D-06 collision check is accurate.
 *
 * NOTE: analyze_screen is conditional on capabilities at session-create time but is
 * always included here defensively — better to skip an external `analyze_screen` than
 * to allow it to shadow the native one when capabilities later flip on.
 */
export const NATIVE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'recall_memory',
  'list_files', 'open_app', 'close_app', 'set_volume', 'set_brightness',
  'list_processes', 'search_files', 'move_file', 'delete_file',
  'request_file_action', 'analyze_screen',
  'media_control', 'adjust_volume', // Phase 59 system controls
]);
