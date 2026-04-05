"""Unit tests for PC control @tool payload functions.

Per D-02: Tools return structured dict payloads — they never execute system commands.
Per TDD: these tests are written first (RED) then tools are implemented (GREEN).
"""

import pytest
from langchain_core.tools import BaseTool


# ---------------------------------------------------------------------------
# File tools
# ---------------------------------------------------------------------------


def test_list_files_returns_payload():
    from jarvis.tools.files import list_files

    result = list_files.invoke({"directory": "/tmp"})
    assert result == {"action": "list_files", "args": {"directory": "/tmp"}}


def test_search_files_returns_payload():
    from jarvis.tools.files import search_files

    result = search_files.invoke({"pattern": "*.py", "directory": "/home"})
    assert result == {
        "action": "search_files",
        "args": {"pattern": "*.py", "directory": "/home"},
    }


def test_search_files_default_directory():
    from jarvis.tools.files import search_files

    result = search_files.invoke({"pattern": "*.txt"})
    assert result["action"] == "search_files"
    assert result["args"]["pattern"] == "*.txt"
    assert "directory" in result["args"]


def test_move_file_returns_payload():
    from jarvis.tools.files import move_file

    result = move_file.invoke({"source": "/a.txt", "destination": "/b.txt"})
    assert result == {
        "action": "move_file",
        "args": {"source": "/a.txt", "destination": "/b.txt"},
    }


def test_delete_file_requires_confirmation():
    from jarvis.tools.files import delete_file

    result = delete_file.invoke({"file_path": "/tmp/x.txt"})
    assert result["action"] == "delete_file"
    assert result.get("requires_confirmation") is True


def test_delete_file_payload_args():
    from jarvis.tools.files import delete_file

    result = delete_file.invoke({"file_path": "/tmp/x.txt"})
    assert "path" in result["args"]
    assert result["args"]["path"] == "/tmp/x.txt"


# ---------------------------------------------------------------------------
# App tools
# ---------------------------------------------------------------------------


def test_open_app_returns_payload():
    from jarvis.tools.apps import open_app

    result = open_app.invoke({"app_name": "firefox"})
    assert result == {"action": "open_app", "args": {"app": "firefox"}}


def test_close_app_returns_payload():
    from jarvis.tools.apps import close_app

    result = close_app.invoke({"app_name": "firefox"})
    assert result["action"] == "close_app"
    assert result["args"]["app"] == "firefox"


def test_close_app_no_confirmation_required():
    """Per D-03: close_app does NOT require confirmation (only delete_file and kill_process do)."""
    from jarvis.tools.apps import close_app

    result = close_app.invoke({"app_name": "firefox"})
    assert "requires_confirmation" not in result


# ---------------------------------------------------------------------------
# System tools
# ---------------------------------------------------------------------------


def test_set_volume_returns_payload():
    from jarvis.tools.system import set_volume

    result = set_volume.invoke({"level": 50})
    assert result == {"action": "set_volume", "args": {"level": 50}}


def test_set_brightness_returns_payload():
    from jarvis.tools.system import set_brightness

    result = set_brightness.invoke({"level": 75})
    assert result == {"action": "set_brightness", "args": {"level": 75}}


def test_list_processes_returns_payload():
    from jarvis.tools.system import list_processes

    result = list_processes.invoke({})
    assert result == {"action": "list_processes", "args": {}}


# ---------------------------------------------------------------------------
# ALL_TOOLS export
# ---------------------------------------------------------------------------


def test_all_tools_has_nine_elements():
    from jarvis.tools import ALL_TOOLS

    assert len(ALL_TOOLS) == 9, f"Expected 9 tools, got {len(ALL_TOOLS)}"


def test_all_tools_are_base_tool_instances():
    from jarvis.tools import ALL_TOOLS

    for t in ALL_TOOLS:
        assert isinstance(t, BaseTool), f"{t} is not a BaseTool instance"


def test_all_tools_have_name_attribute():
    from jarvis.tools import ALL_TOOLS

    for t in ALL_TOOLS:
        assert hasattr(t, "name") and t.name, f"{t} has no name attribute"


# ---------------------------------------------------------------------------
# Purity checks: tools must NOT import system-executing libraries
# ---------------------------------------------------------------------------


def test_files_module_has_no_subprocess_import():
    import importlib
    import jarvis.tools.files as files_mod

    source_file = files_mod.__file__
    with open(source_file) as f:
        source = f.read()
    assert "import subprocess" not in source, "files.py must not import subprocess"
    assert "import shutil" not in source, "files.py must not import shutil"


def test_apps_module_has_no_subprocess_import():
    import jarvis.tools.apps as apps_mod

    source_file = apps_mod.__file__
    with open(source_file) as f:
        source = f.read()
    assert "import subprocess" not in source, "apps.py must not import subprocess"
    assert "import psutil" not in source, "apps.py must not import psutil"
