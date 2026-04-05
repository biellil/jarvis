"""Linux-specific action handlers for ActionExecutor.

Each handler receives an args dict and returns a result dict.
Per D-01: Linux only. Per Pitfall 3: catch FileNotFoundError for system tools.
"""

import glob
import shutil
import subprocess
from pathlib import Path
from typing import Any

import psutil
from loguru import logger


def handle_list_files(args: dict) -> dict:
    """List files in a directory.

    Returns dict with 'files' list, each entry having name, type, size.
    """
    directory = args.get("directory", ".")
    try:
        entries = list(Path(directory).iterdir())
    except FileNotFoundError:
        return {"status": "error", "message": f"Diretorio nao encontrado: {directory}"}
    except PermissionError:
        return {"status": "error", "message": f"Permissao negada: {directory}"}

    files = []
    for entry in entries:
        try:
            stat = entry.stat()
            files.append({
                "name": entry.name,
                "type": "dir" if entry.is_dir() else "file",
                "size": stat.st_size,
            })
        except (OSError, PermissionError):
            files.append({"name": entry.name, "type": "unknown", "size": 0})

    return {"status": "success", "files": files}


def handle_search_files(args: dict) -> dict:
    """Search for files matching a glob pattern in a directory.

    Limits results to 100 entries.
    """
    directory = args.get("directory", ".")
    pattern = args.get("pattern", "*")

    try:
        matches = list(Path(directory).rglob(pattern))[:100]
    except (FileNotFoundError, PermissionError) as e:
        return {"status": "error", "message": str(e)}

    return {"status": "success", "matches": [str(p) for p in matches]}


def handle_move_file(args: dict) -> dict:
    """Move or rename a file/directory.

    Tries Path.rename() first, falls back to shutil.move() for cross-device moves.
    """
    source = args.get("source", "")
    destination = args.get("destination", "")

    src_path = Path(source)
    if not src_path.exists():
        return {"status": "error", "message": f"Arquivo nao encontrado: {source}"}

    try:
        src_path.rename(destination)
    except OSError:
        try:
            shutil.move(source, destination)
        except Exception as e:
            return {"status": "error", "message": str(e)}

    return {"status": "success", "moved": {"from": source, "to": destination}}


def handle_delete_file(args: dict) -> dict:
    """Delete a file or directory.

    Uses Path.unlink() for files, shutil.rmtree() for directories.
    """
    path = args.get("path", "")
    target = Path(path)

    if not target.exists():
        return {"status": "error", "message": f"Nao encontrado: {path}"}

    try:
        if target.is_dir():
            shutil.rmtree(path)
        else:
            target.unlink()
    except (OSError, PermissionError) as e:
        return {"status": "error", "message": str(e)}

    return {"status": "success", "deleted": path}


def handle_open_app(args: dict) -> dict:
    """Launch an application.

    Tries direct Popen first, falls back to xdg-open for files/URLs.
    Per Pitfall 3: catches FileNotFoundError from subprocess.
    """
    app = args.get("app", "")

    try:
        subprocess.Popen(
            [app],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "success", "launched": app}
    except FileNotFoundError:
        pass

    # Fallback: xdg-open (opens files, URLs, or apps registered in .desktop)
    try:
        subprocess.Popen(
            ["xdg-open", app],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "success", "launched": app}
    except FileNotFoundError:
        return {
            "status": "error",
            "message": f"Aplicativo '{app}' nao encontrado e xdg-open indisponivel.",
        }


def handle_close_app(args: dict) -> dict:
    """Close all processes matching a given application name.

    Uses psutil.process_iter() to find and terminate matching processes.
    """
    app = args.get("app", "")
    app_lower = app.lower()

    terminated = []
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            proc_name = (proc.info.get("name") or "").lower()
            if app_lower in proc_name or proc_name in app_lower:
                proc.terminate()
                terminated.append({"pid": proc.info["pid"], "name": proc.info["name"]})
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    if not terminated:
        return {
            "status": "error",
            "message": f"Nenhum processo '{app}' encontrado",
        }

    return {"status": "success", "terminated": terminated}


def handle_set_volume(args: dict) -> dict:
    """Set system volume using pactl.

    Per Pitfall 3: catches FileNotFoundError if pactl is not installed.
    """
    level = args.get("level", 50)

    try:
        subprocess.run(
            ["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{level}%"],
            capture_output=True,
            text=True,
            check=False,
        )
        return {"status": "success", "volume": level}
    except FileNotFoundError:
        return {
            "status": "error",
            "message": "pactl nao encontrado. Instale com: apt install pulseaudio-utils",
        }


def handle_set_brightness(args: dict) -> dict:
    """Set screen brightness using brightnessctl.

    Per Pitfall 3: catches FileNotFoundError if brightnessctl is not installed.
    """
    level = args.get("level", 50)

    try:
        subprocess.run(
            ["brightnessctl", "set", f"{level}%"],
            capture_output=True,
            text=True,
            check=False,
        )
        return {"status": "success", "brightness": level}
    except FileNotFoundError:
        return {
            "status": "error",
            "message": "brightnessctl nao encontrado. Instale com: apt install brightnessctl",
        }


def handle_list_processes(args: dict) -> dict:
    """List running processes, limited to top 50 by memory usage."""
    procs = []
    for proc in psutil.process_iter(["pid", "name", "status", "cpu_percent", "memory_percent"]):
        try:
            info = proc.info
            procs.append({
                "pid": info.get("pid"),
                "name": info.get("name") or "",
                "status": info.get("status") or "",
                "cpu_percent": info.get("cpu_percent") or 0.0,
                "memory_percent": info.get("memory_percent") or 0.0,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    # Sort by memory usage descending, limit to 50
    procs.sort(key=lambda p: p["memory_percent"], reverse=True)
    return {"status": "success", "processes": procs[:50]}
