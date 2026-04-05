"""Unit tests for ToolLogger — SQLite audit log for tool calls.

Per TDD: these tests are written first (RED) then ToolLogger is implemented (GREEN).
"""

import sqlite3

import pytest

from jarvis.memory.store import ToolLogger


def test_tool_logger_creates_table(tmp_path):
    """ToolLogger creates tool_calls table on init."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tool_calls'"
    )
    assert cursor.fetchone() is not None, "tool_calls table must exist"
    conn.close()
    logger.close()


def test_tool_logger_log_success(tmp_path):
    """log() inserts a row with correct columns for success outcome."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    logger.log("open_app", {"app": "firefox"}, "success")

    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT tool_name, outcome, error FROM tool_calls WHERE tool_name = 'open_app'"
    )
    row = cursor.fetchone()
    conn.close()
    logger.close()

    assert row is not None
    assert row[0] == "open_app"
    assert row[1] == "success"
    assert row[2] is None


def test_tool_logger_log_cancelled(tmp_path):
    """log() stores outcome='cancelled' correctly."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    logger.log("delete_file", {"path": "/tmp/x"}, "cancelled")

    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT outcome FROM tool_calls WHERE tool_name = 'delete_file'"
    )
    row = cursor.fetchone()
    conn.close()
    logger.close()

    assert row is not None
    assert row[0] == "cancelled"


def test_tool_logger_log_error_with_message(tmp_path):
    """log() stores error text when provided."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    logger.log("move_file", {"src": "/a", "dst": "/b"}, "error", "Permission denied")

    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT outcome, error FROM tool_calls WHERE tool_name = 'move_file'"
    )
    row = cursor.fetchone()
    conn.close()
    logger.close()

    assert row is not None
    assert row[0] == "error"
    assert row[1] == "Permission denied"


def test_tool_logger_log_broken_db_does_not_raise(tmp_path):
    """log() with broken DB does NOT raise — returns silently (MEM-05 pattern)."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    # Close the connection to simulate a broken DB state
    logger._conn.close()
    # This should not raise
    logger.log("open_app", {"app": "test"}, "success")


def test_tool_logger_close_idempotent(tmp_path):
    """close() does not raise even if called twice."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    logger.close()
    logger.close()  # Second call should not raise


def test_tool_logger_params_json_stored(tmp_path):
    """log() serializes params as JSON in params_json column."""
    db_path = str(tmp_path / "test.db")
    logger = ToolLogger(db_path)
    logger.log("search_files", {"pattern": "*.py", "directory": "/home"}, "success")

    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT params_json FROM tool_calls WHERE tool_name = 'search_files'"
    )
    row = cursor.fetchone()
    conn.close()
    logger.close()

    assert row is not None
    import json
    params = json.loads(row[0])
    assert params["pattern"] == "*.py"
    assert params["directory"] == "/home"
