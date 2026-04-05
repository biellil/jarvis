"""Tests for ActionExecutor destructive action confirmation flow.

Per D-03: Deletar arquivo and matar processo require confirmation.
Mover arquivos and fechar apps do NOT require confirmation.

Per TDD: these tests were written to verify the confirmation protocol.
"""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, call

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
def confirming_executor(mock_logger):
    """ActionExecutor that always confirms destructive actions."""
    return ActionExecutor(mock_logger, confirm_callback=AsyncMock(return_value=True))


@pytest.fixture
def denying_executor(mock_logger):
    """ActionExecutor that always denies destructive actions."""
    return ActionExecutor(mock_logger, confirm_callback=AsyncMock(return_value=False))


# ---------------------------------------------------------------------------
# Confirmation: delete_file (destructive)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_confirmed_executes_deletion(confirming_executor, tmp_path):
    """When user confirms, the file is deleted and status is success."""
    target = tmp_path / "to_delete.txt"
    target.write_text("delete me")
    assert target.exists()

    payload = {
        "action": "delete_file",
        "args": {"path": str(target)},
        "requires_confirmation": True,
    }
    params = {"path": str(target)}
    result = await confirming_executor.execute("delete_file", payload, params)

    assert result["status"] == "success"
    assert not target.exists(), "File should be deleted after confirmed action"


@pytest.mark.asyncio
async def test_delete_denied_leaves_file_intact(denying_executor, tmp_path):
    """When user denies, the file is NOT deleted and status is cancelled."""
    target = tmp_path / "keep_me.txt"
    target.write_text("keep me")
    assert target.exists()

    payload = {
        "action": "delete_file",
        "args": {"path": str(target)},
        "requires_confirmation": True,
    }
    params = {"path": str(target)}
    result = await denying_executor.execute("delete_file", payload, params)

    assert result["status"] == "cancelled"
    assert target.exists(), "File should remain when action is denied"


# ---------------------------------------------------------------------------
# No confirmation for non-destructive actions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close_app_does_not_trigger_confirmation(denying_executor):
    """close_app payload has no requires_confirmation — confirm_callback must NOT be called."""
    payload = {"action": "close_app", "args": {"app": "nonexistent_app_xyz"}}
    params = {"app": "nonexistent_app_xyz"}
    result = await denying_executor.execute("close_app", payload, params)

    # Confirm callback should NOT have been called (no requires_confirmation key)
    denying_executor._confirm.assert_not_called()
    # Result is error (app not found) but NOT cancelled
    assert result["status"] != "cancelled"


@pytest.mark.asyncio
async def test_move_file_does_not_trigger_confirmation(denying_executor, tmp_path):
    """move_file payload has no requires_confirmation — confirm_callback must NOT be called."""
    src = tmp_path / "source.txt"
    dst = tmp_path / "destination.txt"
    src.write_text("move me")

    payload = {"action": "move_file", "args": {"source": str(src), "destination": str(dst)}}
    params = {"source": str(src), "destination": str(dst)}
    result = await denying_executor.execute("move_file", payload, params)

    denying_executor._confirm.assert_not_called()
    assert result["status"] == "success"
    assert dst.exists()


# ---------------------------------------------------------------------------
# Confirm callback receives correct arguments
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_confirm_callback_receives_tool_name_and_params(mock_logger, tmp_path):
    """confirm_callback must be called with (tool_name, params)."""
    confirm_mock = AsyncMock(return_value=True)
    executor = ActionExecutor(mock_logger, confirm_callback=confirm_mock)

    target = tmp_path / "test_params.txt"
    target.write_text("test")
    params = {"path": str(target)}
    payload = {
        "action": "delete_file",
        "args": {"path": str(target)},
        "requires_confirmation": True,
    }

    await executor.execute("delete_file", payload, params)

    confirm_mock.assert_called_once_with("delete_file", params)


# ---------------------------------------------------------------------------
# Logging for cancelled actions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancelled_action_is_logged(tmp_path):
    """When action is denied, outcome='cancelled' must be logged."""
    mock_log = MagicMock()
    mock_logger = MagicMock()
    mock_logger.log = mock_log

    executor = ActionExecutor(mock_logger, confirm_callback=AsyncMock(return_value=False))

    target = tmp_path / "log_test.txt"
    target.write_text("log me")
    params = {"path": str(target)}
    payload = {
        "action": "delete_file",
        "args": {"path": str(target)},
        "requires_confirmation": True,
    }

    result = await executor.execute("delete_file", payload, params)

    assert result["status"] == "cancelled"
    mock_log.assert_called_once()
    call_args = mock_log.call_args[0]
    assert call_args[0] == "delete_file"  # tool_name
    assert call_args[2] == "cancelled"    # outcome
