"""Tests for ActionExecutor — dispatch to Linux handlers, logging, error handling.

Per TDD: these tests were written before the implementation.
"""

import asyncio
import shutil
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# These imports will fail until the implementation is created (RED phase)
from jarvis.executor.base import ActionExecutor
from jarvis.memory.store import ToolLogger


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_logger(tmp_path):
    """Real ToolLogger backed by a temporary DB."""
    tl = ToolLogger(str(tmp_path / "test.db"))
    yield tl
    tl.close()


@pytest.fixture
def executor(mock_logger):
    """ActionExecutor with a confirm_callback that always confirms."""
    return ActionExecutor(mock_logger, confirm_callback=AsyncMock(return_value=True))


@pytest.fixture
def tmp_dir(tmp_path):
    """Temp directory with a couple of test files."""
    (tmp_path / "hello.py").write_text("print('hello')")
    (tmp_path / "world.txt").write_text("world")
    return tmp_path


# ---------------------------------------------------------------------------
# File operations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_files_returns_success(executor, tmp_dir):
    payload = {"action": "list_files", "args": {"directory": str(tmp_dir)}}
    result = await executor.execute("list_files", payload, {"directory": str(tmp_dir)})
    assert result["status"] == "success"
    assert "files" in result
    names = [f["name"] for f in result["files"]]
    assert "hello.py" in names
    assert "world.txt" in names


@pytest.mark.asyncio
async def test_search_files_finds_py_files(executor, tmp_dir):
    payload = {"action": "search_files", "args": {"pattern": "*.py", "directory": str(tmp_dir)}}
    params = {"pattern": "*.py", "directory": str(tmp_dir)}
    result = await executor.execute("search_files", payload, params)
    assert result["status"] == "success"
    assert "matches" in result
    assert any("hello.py" in m for m in result["matches"])


@pytest.mark.asyncio
async def test_move_file(executor, tmp_dir):
    src = tmp_dir / "hello.py"
    dst = tmp_dir / "moved.py"
    payload = {"action": "move_file", "args": {"source": str(src), "destination": str(dst)}}
    params = {"source": str(src), "destination": str(dst)}
    result = await executor.execute("move_file", payload, params)
    assert result["status"] == "success"
    assert dst.exists()
    assert not src.exists()


@pytest.mark.asyncio
async def test_delete_file(executor, tmp_dir):
    target = tmp_dir / "world.txt"
    payload = {
        "action": "delete_file",
        "args": {"path": str(target)},
        "requires_confirmation": True,
    }
    params = {"path": str(target)}
    result = await executor.execute("delete_file", payload, params)
    assert result["status"] == "success"
    assert not target.exists()


# ---------------------------------------------------------------------------
# App operations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_open_app_calls_subprocess(executor, mock_logger):
    payload = {"action": "open_app", "args": {"app": "echo"}}
    params = {"app": "echo"}
    with patch("jarvis.executor.linux.subprocess.Popen") as mock_popen:
        mock_popen.return_value = MagicMock()
        result = await executor.execute("open_app", payload, params)
    assert result["status"] == "success"
    assert "launched" in result
    mock_popen.assert_called_once()


@pytest.mark.asyncio
async def test_close_app_not_found_returns_error(executor):
    payload = {"action": "close_app", "args": {"app": "this_app_does_not_exist_12345"}}
    params = {"app": "this_app_does_not_exist_12345"}
    result = await executor.execute("close_app", payload, params)
    assert result["status"] == "error"
    assert "encontrado" in result["message"]


# ---------------------------------------------------------------------------
# System operations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_volume_handles_missing_pactl(executor):
    payload = {"action": "set_volume", "args": {"level": 50}}
    params = {"level": 50}
    with patch("jarvis.executor.linux.subprocess.run", side_effect=FileNotFoundError):
        result = await executor.execute("set_volume", payload, params)
    # Either success (pactl available) or informative error
    assert result["status"] in ("success", "error")
    if result["status"] == "error":
        assert "pactl" in result["message"]


@pytest.mark.asyncio
async def test_set_brightness_handles_missing_brightnessctl(executor):
    payload = {"action": "set_brightness", "args": {"level": 75}}
    params = {"level": 75}
    with patch("jarvis.executor.linux.subprocess.run", side_effect=FileNotFoundError):
        result = await executor.execute("set_brightness", payload, params)
    assert result["status"] in ("success", "error")
    if result["status"] == "error":
        assert "brightnessctl" in result["message"]


@pytest.mark.asyncio
async def test_list_processes_returns_process_list(executor):
    payload = {"action": "list_processes", "args": {}}
    params = {}
    result = await executor.execute("list_processes", payload, params)
    assert result["status"] == "success"
    assert "processes" in result
    assert isinstance(result["processes"], list)
    assert len(result["processes"]) > 0
    # Each process should have pid and name
    proc = result["processes"][0]
    assert "pid" in proc
    assert "name" in proc


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_action_returns_error(executor):
    payload = {"action": "fly_to_moon", "args": {}}
    result = await executor.execute("unknown_tool", payload, {})
    assert result["status"] == "error"
    assert "fly_to_moon" in result["message"] or "desconhecida" in result["message"]


@pytest.mark.asyncio
async def test_handler_exception_is_caught(executor):
    """A handler that raises an exception should return status=error, not re-raise."""
    payload = {"action": "list_files", "args": {"directory": "/nonexistent_path_xyz"}}
    result = await executor.execute("list_files", payload, {"directory": "/nonexistent_path_xyz"})
    assert result["status"] == "error"


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_every_execute_call_triggers_logger(tmp_path):
    """Every execute() call must call tool_logger.log() exactly once."""
    mock_logger = MagicMock()
    mock_logger.log = MagicMock()
    executor = ActionExecutor(mock_logger, confirm_callback=AsyncMock(return_value=True))

    payload = {"action": "list_processes", "args": {}}
    await executor.execute("list_processes", payload, {})

    mock_logger.log.assert_called_once()
    call_args = mock_logger.log.call_args
    assert call_args[0][0] == "list_processes"  # tool_name
    assert call_args[0][2] in ("success", "error")  # outcome


@pytest.mark.asyncio
async def test_error_outcome_logged_on_exception(tmp_path):
    """When a handler raises, outcome='error' and error message is logged."""
    mock_logger = MagicMock()
    mock_logger.log = MagicMock()
    executor = ActionExecutor(mock_logger, confirm_callback=AsyncMock(return_value=True))

    payload = {"action": "list_files", "args": {"directory": "/nonexistent_xyz"}}
    await executor.execute("list_files", payload, {})

    mock_logger.log.assert_called_once()
    call_args = mock_logger.log.call_args[0]
    assert call_args[2] == "error"
