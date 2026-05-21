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

import json
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jarvis_desktop.config import JarvisConfig

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_audit_lock: threading.Lock = threading.Lock()
_config: "JarvisConfig | None" = None

# Current OS platform string: "win32", "darwin", "linux"
_PLATFORM = sys.platform

# Per-OS alias map: lowercase app name → executable/app name
_ALIAS_MAP: dict[str, dict[str, str]] = {
    "win32": {
        "explorador": "explorer.exe",
        "explorer": "explorer.exe",
        "notepad": "notepad.exe",
        "calculadora": "calc.exe",
        "calc": "calc.exe",
        "chrome": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "google chrome": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "firefox": r"C:\Program Files\Mozilla Firefox\firefox.exe",
    },
    "darwin": {
        "finder": "Finder",
        "chrome": "Google Chrome",
        "google chrome": "Google Chrome",
        "vscode": "Visual Studio Code",
        "code": "Visual Studio Code",
        "firefox": "Firefox",
        "safari": "Safari",
        "navegador": "Safari",
    },
    "linux": {
        "explorador": "nautilus",
        "files": "nautilus",
        "chrome": "google-chrome",
        "google chrome": "google-chrome",
        "vscode": "code",
        "navegador": "xdg-open",
        "firefox": "firefox",
    },
}

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
    """Execute app/file operation and return {timestamp, action, params, result, error?}."""
    result: dict = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "params": params,
    }
    try:
        if action == "open_app":
            launch_app(params.get("app_name", ""))
            result["result"] = "ok"
        elif action == "close_app":
            close_app(params.get("app_name", ""))
            result["result"] = "ok"
        elif action == "open_folder":
            open_folder(params.get("path", ""))
            result["result"] = "ok"
        elif action in ("read_file", "delete_file", "move_file", "rename_file"):
            # Wave 2 actions — not yet implemented
            raise NotImplementedError(f"Action {action!r} implemented in Wave 2")
        else:
            raise ValueError(f"Unknown action: {action!r}")
    except Exception as exc:
        result["result"] = "error"
        result["error"] = str(exc)
    finally:
        _audit_log(action, params, result)
    return result


def launch_app(app_name: str) -> None:
    """Launch application by name using shutil.which() + alias fallback."""
    import shutil

    path = shutil.which(app_name) or _resolve_app_alias(app_name)
    if not path:
        raise ValueError(f"App not found: {app_name!r}. Check spelling or app not installed.")
    if _PLATFORM == "darwin" and not path.startswith("/"):
        # macOS: open -a "App Name"
        subprocess.Popen(["open", "-a", path])
    else:
        subprocess.Popen([path])


def close_app(app_name: str) -> None:
    """Terminate running process by name using psutil."""
    import psutil

    target = app_name.lower().rstrip(".exe")
    found = False
    for proc in psutil.process_iter(["name", "pid"]):
        try:
            proc_name = (proc.info.get("name") or "").lower().rstrip(".exe")
            if proc_name == target:
                proc.kill()
                found = True
                break
        except psutil.NoSuchProcess:
            continue
        except psutil.AccessDenied:
            raise PermissionError(f"Cannot close {app_name!r}: protected process (permission denied)")
    if not found:
        raise ValueError(f"Process not found: {app_name!r}")


def open_folder(path: str) -> None:
    """Open path in native file explorer (Explorer/Finder/Nautilus)."""
    resolved = Path(path).expanduser().resolve()
    if _PLATFORM == "win32":
        subprocess.Popen(["explorer.exe", str(resolved)])
    elif _PLATFORM == "darwin":
        subprocess.Popen(["open", str(resolved)])
    else:
        subprocess.Popen(["xdg-open", str(resolved)])


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
    """Return executable path/name from alias dict for current OS, or None."""
    aliases = _ALIAS_MAP.get(_PLATFORM, {})
    return aliases.get(app_name.lower())


def _is_path_allowed(user_path: str, whitelist_dirs: list) -> bool:
    """Return True if resolved path is under any whitelisted directory. Wave 2."""
    raise NotImplementedError("Wave 2")


def _audit_log(action: str, params: dict, result: dict) -> None:
    """Append one JSON Lines entry to ~/.jarvis/audit.json. Thread-safe."""
    with _audit_lock:
        audit_path = Path.home() / ".jarvis" / "audit.json"
        audit_path.parent.mkdir(parents=True, exist_ok=True)
        with open(audit_path, "a", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
            f.write("\n")


# ---------------------------------------------------------------------------
# Console helper (lazy import to avoid circular)
# ---------------------------------------------------------------------------


def _console():
    from jarvis_desktop import ui
    return ui.get_console()
