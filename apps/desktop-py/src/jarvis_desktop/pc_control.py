"""JARVIS PC Control — App and file operations.

Phase 79: Open/close apps, open folders, read files, confirm destructive actions.
All actions logged to ~/.jarvis/audit.json (PCTRL-06).

Decisions honored:
  D-01: Hybrid SSE pattern — gateway emits task:pc_action, client executes locally
  D-03: Audit log is local append-only JSON Lines at ~/.jarvis/audit.json
  D-04: App resolution: shutil.which() primary + alias dict fallback
  D-05: Process termination via psutil.process_iter() + proc.kill()
  D-08: File whitelist: home, ~/Documents, ~/Downloads, ~/Desktop
  D-13: Audit entry fields: timestamp, action, params, result, error (optional)
"""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_audit_lock: threading.Lock = threading.Lock()
_config: "JarvisConfig | None" = None

# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def init_pc_control(config: "JarvisConfig") -> None:
    """Store config reference for later use by pc_control functions."""
    global _config
    _config = config
    _console().print("[PC Control] initialized")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def execute_pc_action(action: str, params: dict, config: "JarvisConfig") -> dict:
    """Execute app/file operation and return {timestamp, result, error?}. Wave 1."""
    raise NotImplementedError("Wave 1")


def launch_app(app_name: str) -> None:
    """Launch application by name using shutil.which() + alias fallback. Wave 1."""
    raise NotImplementedError("Wave 1")


def close_app(app_name: str) -> None:
    """Terminate running process by name using psutil. Wave 1."""
    raise NotImplementedError("Wave 1")


def open_folder(path: str) -> None:
    """Open path in native file explorer (Explorer/Finder/Nautilus). Wave 1."""
    raise NotImplementedError("Wave 1")


def read_file(path: str, config: "JarvisConfig") -> str:
    """Read text file inside whitelist, truncate at 50 KB. Wave 2."""
    raise NotImplementedError("Wave 2")


def confirm_destructive(prompt: str, timeout: int = 10) -> bool:
    """Prompt user and wait up to timeout seconds for voice/keyboard confirmation. Wave 2."""
    raise NotImplementedError("Wave 2")


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _resolve_app_alias(app_name: str) -> "str | None":
    """Return executable path from alias dict, or None if not found. Wave 1."""
    raise NotImplementedError("Wave 1")


def _is_path_allowed(user_path: str, whitelist_dirs: list) -> bool:
    """Return True if resolved path is under any whitelisted directory. Wave 2."""
    raise NotImplementedError("Wave 2")


def _audit_log(action: str, params: dict, result: dict) -> None:
    """Append one JSON Lines entry to ~/.jarvis/audit.json. Wave 1."""
    raise NotImplementedError("Wave 1")


# ---------------------------------------------------------------------------
# Console helper (lazy import to avoid circular)
# ---------------------------------------------------------------------------


def _console():
    from jarvis_desktop import ui
    return ui.get_console()
