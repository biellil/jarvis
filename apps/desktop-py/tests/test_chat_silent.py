"""Tests for silent mode (agentic_step_progress) in _handle_agentic_event.

Covers D-05 (Phase 82):
- PY-02*: task:step:start / task:step:end suppressed when flag=False
- PY-03*: task:error / task:cancelled / task:awaiting-failure-decision always shown
- EVT-01*: task:auto-approved is silent (returns None, no print)
"""
import json
import pytest
from unittest.mock import patch, MagicMock
from jarvis_desktop.config import JarvisConfig


def make_config(**kwargs):
    """Create a JarvisConfig with given overrides, all other fields at defaults."""
    return JarvisConfig(**kwargs)


@pytest.fixture(autouse=True)
def reset_debug_mode():
    """Ensure _debug_mode global is False before each test."""
    import jarvis_desktop.chat as chat_module
    original = chat_module._debug_mode
    chat_module._debug_mode = False
    yield
    chat_module._debug_mode = original


@pytest.fixture
def mock_console():
    with patch("jarvis_desktop.chat._console") as mock_c:
        console_instance = MagicMock()
        mock_c.return_value = console_instance
        yield console_instance


# ---------------------------------------------------------------------------
# PY-02: task:step:start suppression
# ---------------------------------------------------------------------------

def test_step_start_suppressed_when_flag_false(mock_console):
    """PY-02: task:step:start NOT printed when agentic_step_progress=False."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1", "stepId": 1, "description": "Listar arquivos"})
    config = make_config(agentic_step_progress=False)
    result = _handle_agentic_event("task:step:start", payload, config)
    assert result is None
    mock_console.print.assert_not_called()


def test_step_start_shown_when_flag_true(mock_console):
    """PY-02b: task:step:start IS printed when agentic_step_progress=True."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1", "stepId": 1, "description": "Listar arquivos"})
    config = make_config(agentic_step_progress=True)
    _handle_agentic_event("task:step:start", payload, config)
    mock_console.print.assert_called_once()
    call_args = mock_console.print.call_args[0][0]
    assert "Listar arquivos" in call_args


def test_step_end_suppressed_when_flag_false(mock_console):
    """PY-02c: task:step:end NOT printed when agentic_step_progress=False."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1", "stepId": 1})
    config = make_config(agentic_step_progress=False)
    result = _handle_agentic_event("task:step:end", payload, config)
    assert result is None
    mock_console.print.assert_not_called()


def test_step_end_shown_when_flag_true(mock_console):
    """PY-02d: task:step:end IS printed when agentic_step_progress=True."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1", "stepId": 2})
    config = make_config(agentic_step_progress=True)
    _handle_agentic_event("task:step:end", payload, config)
    mock_console.print.assert_called_once()


# ---------------------------------------------------------------------------
# PY-03: critical events always shown regardless of flag
# ---------------------------------------------------------------------------

def test_task_error_always_shown(mock_console):
    """PY-03: task:error ALWAYS printed even when agentic_step_progress=False."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1", "message": "arquivo não encontrado"})
    config = make_config(agentic_step_progress=False)
    _handle_agentic_event("task:error", payload, config)
    mock_console.print.assert_called_once()
    call_args = mock_console.print.call_args[0][0]
    assert "arquivo não encontrado" in call_args


def test_task_cancelled_always_shown(mock_console):
    """PY-03b: task:cancelled ALWAYS printed even when agentic_step_progress=False."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1"})
    config = make_config(agentic_step_progress=False)
    _handle_agentic_event("task:cancelled", payload, config)
    mock_console.print.assert_called_once()


def test_task_awaiting_failure_decision_always_shown(mock_console):
    """PY-03c: task:awaiting-failure-decision ALWAYS printed even when flag=False."""
    from jarvis_desktop.chat import _handle_agentic_event
    from unittest.mock import patch as mock_patch
    payload = json.dumps({"taskId": "t1", "stepId": 2, "error": "timeout"})
    config = make_config(agentic_step_progress=False)

    # Patch _post_task_resume and ui.get_input to avoid actual HTTP calls + input
    with mock_patch("jarvis_desktop.chat._post_task_resume"), \
         mock_patch("jarvis_desktop.ui.get_input", return_value="n"):
        _handle_agentic_event("task:awaiting-failure-decision", payload, config)

    # At least one print call happened (the failure message)
    assert mock_console.print.call_count >= 1
    all_args = " ".join(str(c) for c in mock_console.print.call_args_list)
    assert "timeout" in all_args or "Falha" in all_args


# ---------------------------------------------------------------------------
# EVT-01: task:auto-approved is always silent
# ---------------------------------------------------------------------------

def test_auto_approved_silent_when_debug_false(mock_console):
    """EVT-01: task:auto-approved returns None and does NOT print when debug_events=False."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1"})
    config = make_config(debug_events=False, agentic_step_progress=False)
    result = _handle_agentic_event("task:auto-approved", payload, config)
    assert result is None
    mock_console.print.assert_not_called()


def test_auto_approved_debug_print_when_debug_true(mock_console):
    """EVT-01b: task:auto-approved prints [debug] when debug_events=True."""
    from jarvis_desktop.chat import _handle_agentic_event
    payload = json.dumps({"taskId": "t1"})
    config = make_config(debug_events=True, agentic_step_progress=False)
    _handle_agentic_event("task:auto-approved", payload, config)
    mock_console.print.assert_called_once()
    call_args = mock_console.print.call_args[0][0]
    assert "debug" in call_args.lower()
