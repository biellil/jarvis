"""Tests for /config menu integration — PYUI-02.

Wave 0 stubs: xfail until chat.py config menu implemented in Plan 77-02.
"""
import pytest
import unittest.mock


@pytest.mark.xfail(strict=False, reason="config menu not yet implemented — Wave 0 stub")
def test_config_command_detected(monkeypatch):
    """chat_loop() detects /config prefix and does NOT send to gateway.

    PYUI-02: /config is a local command (D-06).
    """
    from jarvis_desktop.chat import _handle_command
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig()
    mock_menu = unittest.mock.MagicMock()
    monkeypatch.setattr("jarvis_desktop.chat._show_config_menu", mock_menu, raising=False)

    # Patching voice_modes and ui imports used in _handle_command
    monkeypatch.setattr("jarvis_desktop.voice_modes.stop_mode", unittest.mock.MagicMock(), raising=False)
    monkeypatch.setattr("jarvis_desktop.voice_modes.start_mode", unittest.mock.MagicMock(), raising=False)

    _handle_command("/config", config)
    mock_menu.assert_called_once()


@pytest.mark.xfail(strict=False, reason="config menu not yet implemented — Wave 0 stub")
def test_whisper_model_switch(monkeypatch):
    """Config menu updates config.whisper_model and calls stt.reload_model().

    PYUI-02: Whisper model change applies immediately (D-11).
    """
    from jarvis_desktop.chat import _menu_whisper_model
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(whisper_model="tiny")
    mock_reload = unittest.mock.MagicMock()
    monkeypatch.setattr("jarvis_desktop.stt.reload_model", mock_reload, raising=False)
    monkeypatch.setattr("jarvis_desktop.config.save_config", unittest.mock.MagicMock(), raising=False)

    # Simulate user choosing option "2" (base model)
    monkeypatch.setattr("builtins.input", lambda _: "2")

    _menu_whisper_model(config)

    assert config.whisper_model == "base"
    mock_reload.assert_called_once_with("base")


@pytest.mark.xfail(strict=False, reason="config menu not yet implemented — Wave 0 stub")
def test_tts_provider_switch(monkeypatch):
    """Config menu updates config.tts_provider and calls tts.set_provider().

    PYUI-02: TTS provider change applies immediately (D-11).
    """
    from jarvis_desktop.chat import _menu_tts_provider
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(tts_provider="kokoro")
    mock_set_provider = unittest.mock.MagicMock()
    monkeypatch.setattr("jarvis_desktop.tts.set_provider", mock_set_provider, raising=False)
    monkeypatch.setattr("jarvis_desktop.config.save_config", unittest.mock.MagicMock(), raising=False)

    # Simulate user choosing option "2" (elevenlabs)
    monkeypatch.setattr("builtins.input", lambda _: "2")

    _menu_tts_provider(config)

    assert config.tts_provider == "elevenlabs"
    mock_set_provider.assert_called_once_with("elevenlabs", config)


@pytest.mark.xfail(strict=False, reason="config menu not yet implemented — Wave 0 stub")
def test_voice_mode_switch(monkeypatch):
    """Config menu calls voice_modes.switch_mode() with the selected mode.

    PYUI-02: Voice mode change applies immediately via switch_mode (D-11).
    """
    from jarvis_desktop.chat import _menu_voice_mode
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(voice_mode="ptt")
    mock_switch = unittest.mock.MagicMock()
    monkeypatch.setattr("jarvis_desktop.voice_modes.switch_mode", mock_switch, raising=False)
    monkeypatch.setattr("jarvis_desktop.config.save_config", unittest.mock.MagicMock(), raising=False)

    # Simulate user choosing option "2" (always_listening)
    monkeypatch.setattr("builtins.input", lambda _: "2")

    _menu_voice_mode(config)

    mock_switch.assert_called_once_with("always_listening", config)


@pytest.mark.xfail(strict=False, reason="config menu not yet implemented — Wave 0 stub")
def test_voice_modes_pause_resume(monkeypatch):
    """_handle_command('/config') pauses voice_modes before menu and resumes after.

    PYUI-02: Prevents voice capture of keyboard input during config (D-07).
    """
    from jarvis_desktop.chat import _handle_command
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig()
    stop_calls = []
    start_calls = []

    monkeypatch.setattr("jarvis_desktop.voice_modes.stop_mode",
                        lambda: stop_calls.append(True), raising=False)
    monkeypatch.setattr("jarvis_desktop.voice_modes.start_mode",
                        lambda mode, cfg: start_calls.append(mode), raising=False)
    monkeypatch.setattr("jarvis_desktop.chat._show_config_menu",
                        lambda cfg: None, raising=False)

    _handle_command("/config", config)

    assert len(stop_calls) == 1, "stop_mode() must be called once on menu entry"
    assert len(start_calls) == 1, "start_mode() must be called once on menu exit"
