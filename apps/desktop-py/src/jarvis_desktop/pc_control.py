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
import time
from datetime import datetime, timezone
from pathlib import Path
from queue import Empty
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

# Default whitelist when config.pc_whitelist_dirs is empty (D-08)
_DEFAULT_WHITELIST: list[str] = [
    str(Path.home()),
    str(Path.home() / "Documents"),
    str(Path.home() / "Downloads"),
    str(Path.home() / "Desktop"),
]

# Common folder name aliases (pt-BR + en) → resolved Path
_FOLDER_ALIASES: dict[str, Path] = {
    "downloads": Path.home() / "Downloads",
    "documentos": Path.home() / "Documents",
    "documents": Path.home() / "Documents",
    "desktop": Path.home() / "Desktop",
    "área de trabalho": Path.home() / "Desktop",
    "area de trabalho": Path.home() / "Desktop",
    "imagens": Path.home() / "Pictures",
    "pictures": Path.home() / "Pictures",
    "músicas": Path.home() / "Music",
    "musicas": Path.home() / "Music",
    "music": Path.home() / "Music",
    "videos": Path.home() / "Videos",
    "vídeos": Path.home() / "Videos",
    "home": Path.home(),
    "início": Path.home(),
    "inicio": Path.home(),
}

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
        elif action == "read_file":
            content = read_file(params.get("path", ""), config)
            result["result"] = "ok"
            result["content"] = content
        elif action in ("delete_file", "move_file", "rename_file"):
            action_label = {"delete_file": "deletar", "move_file": "mover", "rename_file": "renomear"}[action]
            path_display = params.get("path", params.get("src", "?"))
            prompt = f"Confirmar {action_label} {Path(path_display).name!r}? Diga 'sim' ou pressione Enter em 10 segundos."
            confirmed = confirm_destructive(prompt, timeout=10)
            if confirmed:
                # Actual file ops implemented in future — placeholder executes and logs
                result["result"] = "ok"
            else:
                result["result"] = "aborted"
        elif action == "adjust_volume":
            adjust_volume(params.get("delta", 0))
            result["result"] = "ok"
        elif action == "toggle_mute":
            toggle_mute()
            result["result"] = "ok"
        elif action == "media_control":
            media_control(params.get("command", ""))
            result["result"] = "ok"
        elif action == "list_files":
            files = list_files(params.get("directory", "."))
            result["result"] = "ok"
            result["files"] = files
        elif action == "open_file":
            open_file(params.get("path", ""), config)
            result["result"] = "ok"
        elif action == "search_files":
            files = search_files(params.get("pattern", "*"), params.get("directory", "."))
            result["result"] = "ok"
            result["files"] = files
        elif action == "set_volume":
            set_volume(int(params.get("level", 50)))
            result["result"] = "ok"
        elif action == "set_brightness":
            set_brightness(int(params.get("level", 50)))
            result["result"] = "ok"
        elif action == "list_processes":
            procs = list_processes()
            result["result"] = "ok"
            result["processes"] = procs
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
    """Open path in native file explorer (Explorer/Finder/Nautilus).

    Resolves pt-BR/en folder name aliases ("downloads", "documentos", etc.)
    before passing to the OS file manager.
    """
    if not path or not path.strip():
        raise ValueError("Caminho da pasta não pode ser vazio. Especifique um nome de pasta (ex: 'downloads') ou caminho absoluto.")
    alias_key = path.strip().lower()
    if alias_key in _FOLDER_ALIASES:
        resolved = _FOLDER_ALIASES[alias_key]
    else:
        resolved = Path(path).expanduser().resolve()

    if not resolved.exists():
        raise FileNotFoundError(f"Pasta não encontrada: {path!r}")

    if _PLATFORM == "win32":
        import os
        os.startfile(str(resolved))
    elif _PLATFORM == "darwin":
        subprocess.Popen(["open", str(resolved)])
    else:
        subprocess.Popen(["xdg-open", str(resolved)])


_READ_TRUNCATE_BYTES: int = 51200  # 50 KB


def read_file(path: str, config: "JarvisConfig") -> str:
    """Read text file inside whitelist. Truncates at 50 KB with warning.

    Uses Path.resolve() for whitelist validation — detects ../ traversal and symlink escape.
    Tries UTF-8 first, falls back to Latin-1. Raises ValueError for binary files.
    """
    whitelist = list(getattr(config, "pc_whitelist_dirs", None) or []) or _DEFAULT_WHITELIST
    if not _is_path_allowed(path, whitelist):
        resolved_display = str(Path(path).expanduser().resolve())
        raise PermissionError(f"Path not in whitelist: {resolved_display!r}")

    resolved = Path(path).expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"File not found: {path!r}")
    if not resolved.is_file():
        raise ValueError(f"Not a file: {path!r}")

    raw = resolved.read_bytes()
    total_kb = len(raw) // 1024

    # Try UTF-8 first, fall back to Latin-1
    for encoding in ("utf-8", "latin-1"):
        try:
            content = raw[:_READ_TRUNCATE_BYTES].decode(encoding)
            if len(raw) > _READ_TRUNCATE_BYTES:
                content += f"\n[arquivo cortado — tamanho total: {total_kb} KB]"
            return content
        except UnicodeDecodeError:
            continue

    raise ValueError(f"File is binary or not decodable: {path!r}")


def list_files(directory: str) -> list:
    """List files in a directory. Resolves pt-BR/en aliases."""
    alias_key = directory.strip().lower() if directory.strip() else "home"
    if alias_key in _FOLDER_ALIASES:
        resolved = _FOLDER_ALIASES[alias_key]
    else:
        resolved = Path(directory).expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"Diretório não encontrado: {directory!r}")
    if not resolved.is_dir():
        raise ValueError(f"Não é um diretório: {directory!r}")
    return sorted(item.name for item in resolved.iterdir())


def open_file(path: str, config: "JarvisConfig") -> None:
    """Open a file with the default OS application. Validates against whitelist."""
    whitelist = list(getattr(config, "pc_whitelist_dirs", None) or []) or _DEFAULT_WHITELIST
    if not _is_path_allowed(path, whitelist):
        resolved_display = str(Path(path).expanduser().resolve())
        raise PermissionError(f"Path not in whitelist: {resolved_display!r}")
    resolved = Path(path).expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {path!r}")
    if _PLATFORM == "win32":
        import os
        os.startfile(str(resolved))
    elif _PLATFORM == "darwin":
        subprocess.Popen(["open", str(resolved)])
    else:
        subprocess.Popen(["xdg-open", str(resolved)])


def search_files(pattern: str, directory: str = ".") -> list:
    """Search files by glob pattern under directory."""
    alias_key = directory.strip().lower() if directory.strip() else "."
    if alias_key in _FOLDER_ALIASES:
        resolved = _FOLDER_ALIASES[alias_key]
    else:
        resolved = Path(directory).expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"Diretório não encontrado: {directory!r}")
    return sorted(str(p.relative_to(resolved)) for p in resolved.rglob(pattern) if p.is_file())


def set_volume(level: int) -> None:
    """Set system volume to absolute level 0-100."""
    level = max(0, min(100, level))
    if _PLATFORM == "win32":
        _set_volume_windows(level)
    elif _PLATFORM == "darwin":
        _set_volume_macos(level)
    else:
        _set_volume_linux(level)


def _set_volume_windows(level: int) -> None:
    """Windows: pycaw IAudioEndpointVolume set absolute volume."""
    try:
        import pycaw.api as pycaw_api
        devices = pycaw_api.AudioUtilities.GetSpeakers()
        interface = devices.Activate(pycaw_api.IAudioEndpointVolume._iid_, None, None)
        volume = interface.QueryInterface(pycaw_api.IAudioEndpointVolume)
        volume.SetMasterVolumeLevelScalar(level / 100.0, None)
    except ImportError:
        raise ValueError("pycaw not installed (required for Windows volume control)")
    except Exception as exc:
        raise ValueError(f"Windows volume control failed: {exc}")


def _set_volume_linux(level: int) -> None:
    """Linux: pactl absolute volume set."""
    try:
        subprocess.run(
            ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{level}%"],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise ValueError("pactl not found. Install PulseAudio: apt install pulseaudio-utils")
    except subprocess.TimeoutExpired:
        raise ValueError("pactl timed out (PulseAudio daemon stuck?)")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"pactl failed: {exc.stderr.decode().strip()}")


def _set_volume_macos(level: int) -> None:
    """macOS: osascript absolute volume set."""
    try:
        subprocess.run(
            ["osascript", "-e", f"set volume output volume {level}"],
            check=True,
            timeout=5,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("osascript timed out")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"macOS volume control failed: {exc}")


def set_brightness(level: int) -> None:
    """Set screen brightness 0-100 via screen-brightness-control."""
    level = max(0, min(100, level))
    try:
        import screen_brightness_control as sbc
        sbc.set_brightness(level)
    except ImportError:
        raise ValueError("screen-brightness-control não instalado (pip install screen-brightness-control)")
    except Exception as exc:
        raise ValueError(f"Falha ao definir brilho: {exc}")


def list_processes() -> list:
    """List running processes sorted by name."""
    import psutil
    procs = []
    for proc in psutil.process_iter(["pid", "name", "status"]):
        try:
            procs.append(proc.info)
        except psutil.NoSuchProcess:
            continue
    return sorted(procs, key=lambda p: (p.get("name") or "").lower())


def _get_voice_queue():
    """Return voice text queue — extracted for monkeypatching in tests."""
    from jarvis_desktop.voice_modes import get_text_queue
    return get_text_queue()


def _speak_prompt(msg: str) -> None:
    """Speak confirmation prompt via TTS — extracted for monkeypatching in tests."""
    if _config is not None:
        from jarvis_desktop.tts import speak
        speak(msg, _config)


def confirm_destructive(prompt: str, timeout: int = 10) -> bool:
    """Prompt user for confirmation via keyboard (s/n) or voice within timeout seconds.

    Shows a clear prompt and accepts:
      - Keyboard: 's' or Enter → confirm; 'n' or Escape → deny
      - Voice PTT: "sim", "yes", "confirmar" → confirm
    Returns True if confirmed, False on denial or timeout.
    """
    _ACCEPT_WORDS = {"sim", "yes", "confirmar"}

    queue = _get_voice_queue()

    # Drain stale voice utterances before starting
    while True:
        try:
            queue.get_nowait()
        except Empty:
            break

    sys.stdout.write(f"\n\x1b[1m\x1b[33m[confirmação]\x1b[0m {prompt}\n")
    sys.stdout.write(f"\x1b[33m[confirmação]\x1b[0m Digite 's' + Enter para confirmar, 'n' para cancelar ({timeout}s):\n> ")
    sys.stdout.flush()

    threading.Thread(target=_speak_prompt, args=(prompt,), daemon=True).start()

    start = time.time()
    chars: list[str] = []

    while time.time() - start < timeout:
        # Check voice queue (non-blocking)
        try:
            text = queue.get_nowait()
            if isinstance(text, dict):
                text = text.get("text", "")
            if text.strip().lower() in _ACCEPT_WORDS:
                sys.stdout.write("\n")
                sys.stdout.flush()
                return True
        except Empty:
            pass

        # Check keyboard (Windows only via msvcrt — non-blocking)
        if sys.platform == "win32":
            try:
                import msvcrt
                if msvcrt.kbhit():
                    raw = msvcrt.getwch()
                    if raw in ("\r", "\n"):  # Enter
                        sys.stdout.write("\n")
                        sys.stdout.flush()
                        typed = "".join(chars).strip().lower()
                        # Empty Enter or 's'/'sim'/'yes' → confirm
                        return not typed or typed in ("s", "sim", "yes")
                    elif raw in ("\x03", "\x04", "\x1b"):  # Ctrl+C, Ctrl+D, Escape
                        sys.stdout.write("\n")
                        sys.stdout.flush()
                        return False
                    elif raw == "\x08":  # Backspace
                        if chars:
                            chars.pop()
                            sys.stdout.write("\b \b")
                            sys.stdout.flush()
                    elif ord(raw) >= 32:
                        chars.append(raw)
                        sys.stdout.write(raw)
                        sys.stdout.flush()
            except Exception:
                pass

        time.sleep(0.05)

    sys.stdout.write("\n")
    sys.stdout.flush()
    _console().print("[confirmação] Tempo esgotado — ação abortada.")
    return False


def adjust_volume(delta: int) -> None:
    """Adjust system volume by ±N percentage points (D-02, PCTRL-07).

    Args:
        delta: Relative volume change in percentage points. Clamped to [-100, +100].
               +10 increases by 10 points; -5 decreases by 5 points.
    """
    delta = max(-100, min(100, delta))
    if _PLATFORM == "win32":
        _adjust_volume_windows(delta)
    elif _PLATFORM == "darwin":
        _adjust_volume_macos(delta)
    else:
        _adjust_volume_linux(delta)


def toggle_mute() -> None:
    """Toggle system audio mute on/off (D-02, PCTRL-07)."""
    if _PLATFORM == "win32":
        _toggle_mute_windows()
    elif _PLATFORM == "darwin":
        _toggle_mute_macos()
    else:
        _toggle_mute_linux()


def _adjust_volume_windows(delta: int) -> None:
    """Windows: pycaw IAudioEndpointVolume COM-based volume control."""
    try:
        import pycaw.api as pycaw_api
        devices = pycaw_api.AudioUtilities.GetSpeakers()
        interface = devices.Activate(pycaw_api.IAudioEndpointVolume._iid_, None, None)
        volume = interface.QueryInterface(pycaw_api.IAudioEndpointVolume)
        current = volume.GetMasterVolumeLevelScalar()  # [0.0, 1.0]
        new_vol = max(0.0, min(1.0, current + delta / 100.0))
        volume.SetMasterVolumeLevelScalar(new_vol, None)
    except ImportError:
        raise ValueError("pycaw not installed (required for Windows volume control)")
    except Exception as exc:
        raise ValueError(f"Windows volume control failed: {exc}")


def _adjust_volume_linux(delta: int) -> None:
    """Linux: pactl relative volume adjustment (PulseAudio/Pipewire)."""
    try:
        sign = "+" if delta >= 0 else ""
        subprocess.run(
            ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{sign}{delta}%"],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise ValueError("pactl not found. Install PulseAudio: apt install pulseaudio-utils")
    except subprocess.TimeoutExpired:
        raise ValueError("pactl timed out (PulseAudio daemon stuck?)")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"pactl failed: {exc.stderr.decode().strip()}")


def _adjust_volume_macos(delta: int) -> None:
    """macOS: osascript AppleScript volume adjustment."""
    try:
        result = subprocess.run(
            ["osascript", "-e", "output volume of (get volume settings)"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        current = int(result.stdout.strip())
        new_vol = max(0, min(100, current + delta))
        subprocess.run(
            ["osascript", "-e", f"set volume output volume {new_vol}"],
            check=True,
            timeout=5,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("osascript timed out")
    except (ValueError, subprocess.CalledProcessError) as exc:
        raise ValueError(f"macOS volume control failed: {exc}")


def _toggle_mute_windows() -> None:
    """Windows: pycaw toggle mute via IAudioEndpointVolume."""
    try:
        import pycaw.api as pycaw_api
        devices = pycaw_api.AudioUtilities.GetSpeakers()
        interface = devices.Activate(pycaw_api.IAudioEndpointVolume._iid_, None, None)
        volume = interface.QueryInterface(pycaw_api.IAudioEndpointVolume)
        current_mute = volume.GetMute()
        volume.SetMute(not current_mute, None)
    except ImportError:
        raise ValueError("pycaw not installed (required for Windows mute control)")
    except Exception as exc:
        raise ValueError(f"Windows mute toggle failed: {exc}")


def _toggle_mute_linux() -> None:
    """Linux: pactl toggle mute on default sink."""
    try:
        subprocess.run(
            ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle"],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise ValueError("pactl not found. Install PulseAudio: apt install pulseaudio-utils")
    except subprocess.TimeoutExpired:
        raise ValueError("pactl timed out (PulseAudio daemon stuck?)")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"pactl mute toggle failed: {exc.stderr.decode().strip()}")


def _toggle_mute_macos() -> None:
    """macOS: osascript toggle mute."""
    try:
        result = subprocess.run(
            ["osascript", "-e", "output muted of (get volume settings)"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        is_muted = result.stdout.strip().lower() == "true"
        new_muted = "true" if not is_muted else "false"
        subprocess.run(
            ["osascript", "-e", f"set volume output muted {new_muted}"],
            check=True,
            timeout=5,
        )
    except subprocess.TimeoutExpired:
        raise ValueError("osascript timed out")
    except (ValueError, subprocess.CalledProcessError) as exc:
        raise ValueError(f"macOS mute toggle failed: {exc}")


def media_control(command: str) -> None:
    """Control active media player: play_pause | next_track | prev_track (D-03, PCTRL-08).

    Windows/macOS: pynput media key simulation.
    Linux: playerctl subprocess (MPRIS D-Bus).
    """
    valid = {"play_pause", "next_track", "prev_track"}
    if command not in valid:
        raise ValueError(f"Unknown media command: {command!r}. Valid: {valid}")

    if _PLATFORM in ("win32", "darwin"):
        _media_control_pynput(command)
    else:
        _media_control_playerctl(command)


def _media_control_pynput(command: str) -> None:
    """Windows/macOS: simulate media key via pynput Controller."""
    from pynput.keyboard import Controller, Key

    key_map = {
        "play_pause": Key.media_play_pause,
        "next_track": Key.media_next,
        "prev_track": Key.media_previous,
    }
    key = key_map[command]  # Guaranteed valid by media_control()
    controller = Controller()
    controller.press(key)
    controller.release(key)


def _media_control_playerctl(command: str) -> None:
    """Linux: playerctl MPRIS media player control."""
    cmd_map = {
        "play_pause": "play-pause",
        "next_track": "next",
        "prev_track": "previous",
    }
    playerctl_cmd = cmd_map[command]  # Guaranteed valid by media_control()

    try:
        subprocess.run(
            ["playerctl", playerctl_cmd],
            check=True,
            capture_output=True,
            timeout=5,
        )
    except FileNotFoundError:
        raise ValueError("playerctl not found. Install: apt install playerctl")
    except subprocess.TimeoutExpired:
        raise ValueError("playerctl timed out")
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"playerctl failed: {exc.stderr.decode().strip()}")


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _resolve_app_alias(app_name: str) -> "str | None":
    """Return executable path/name from alias dict for current OS, or None."""
    aliases = _ALIAS_MAP.get(_PLATFORM, {})
    return aliases.get(app_name.lower())


def _is_path_allowed(user_path: str, whitelist_dirs: list) -> bool:
    """Return True if resolved path is under any whitelisted directory.

    Uses Path.resolve() to follow symlinks — detects ../ traversal and symlink escape.
    """
    try:
        resolved = Path(user_path).expanduser().resolve()
    except (OSError, ValueError):
        return False
    return any(
        resolved == Path(d).resolve() or resolved.is_relative_to(Path(d).resolve())
        for d in whitelist_dirs
    )


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
