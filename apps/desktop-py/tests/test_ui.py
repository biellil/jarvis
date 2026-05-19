"""Tests for jarvis_desktop.ui singleton — PYUI-01.

Wave 0 stubs: xfail until ui.py is implemented in Plan 77-01.
"""
import pytest


@pytest.mark.xfail(strict=False, reason="ui.py not yet implemented — Wave 0 stub")
def test_init_ui():
    """init_ui() initializes Console and Live display without raising.

    PYUI-01: ui singleton must be ready before any output.
    """
    from jarvis_desktop import ui
    import importlib
    importlib.reload(ui)  # Reset module state for isolation
    ui.init_ui()
    c = ui.get_console()
    assert c is not None


@pytest.mark.xfail(strict=False, reason="ui.py not yet implemented — Wave 0 stub")
def test_init_ui_idempotent():
    """Calling init_ui() twice is a no-op — second call does not raise or reset state.

    PYUI-01: safe for __main__.py to call init_ui() multiple times.
    """
    from jarvis_desktop import ui
    import importlib
    importlib.reload(ui)
    ui.init_ui()
    ui.init_ui()  # Must not raise
    assert ui.get_console() is not None


@pytest.mark.xfail(strict=False, reason="ui.py not yet implemented — Wave 0 stub")
def test_set_state_valid_states():
    """set_state() accepts all 4 valid states without raising.

    PYUI-01: states are idle / listening / thinking / speaking (D-05).
    """
    from jarvis_desktop import ui
    import importlib
    importlib.reload(ui)
    ui.init_ui()
    for state in ("idle", "listening", "thinking", "speaking"):
        ui.set_state(state)  # Must not raise


@pytest.mark.xfail(strict=False, reason="ui.py not yet implemented — Wave 0 stub")
def test_set_state_invalid_state_ignored():
    """set_state() ignores unknown state strings — does not raise.

    PYUI-01: defensive against typos in caller code.
    """
    from jarvis_desktop import ui
    import importlib
    importlib.reload(ui)
    ui.init_ui()
    ui.set_state("unknown_state")  # Must not raise


@pytest.mark.xfail(strict=False, reason="ui.py not yet implemented — Wave 0 stub")
def test_status_line_format(monkeypatch):
    """Status line text contains mode, model, and state strings.

    PYUI-01: format is [ MODE | MODEL | STATE ] (D-02, readable at a glance).
    set_config() stores config reference; status line reads from it at render time.
    """
    from jarvis_desktop import ui
    from jarvis_desktop.config import JarvisConfig
    import importlib
    importlib.reload(ui)
    ui.init_ui()

    config = JarvisConfig(voice_mode="ptt", whisper_model="tiny", tts_provider="kokoro")
    ui.set_config(config)
    ui.set_state("idle")

    status = ui._build_status_text()
    assert "ptt" in status
    assert "tiny" in status
    assert "idle" in status


@pytest.mark.xfail(strict=False, reason="ui.py not yet implemented — Wave 0 stub")
def test_set_config_updates_status():
    """After set_config(), status line reads new voice_mode and whisper_model.

    PYUI-01: status reflects live config — Pitfall 4 prevention (D-04).
    """
    from jarvis_desktop import ui
    from jarvis_desktop.config import JarvisConfig
    import importlib
    importlib.reload(ui)
    ui.init_ui()

    config = JarvisConfig(voice_mode="wake_word", whisper_model="base", tts_provider="kokoro")
    ui.set_config(config)
    ui.set_state("listening")

    status = ui._build_status_text()
    assert "wake_word" in status
    assert "base" in status
    assert "listening" in status
