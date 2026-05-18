"""Tests for config loading — PYSETUP-01 / PYSETUP-04."""
import pytest


def test_load_config_returns_defaults(tmp_home):
    """load_config() returns JarvisConfig with default values when no config file exists."""
    from jarvis_desktop.config import load_config
    config = load_config()
    assert config.gateway_url == "http://localhost:3000"
    assert config.whisper_model == "tiny"
    assert config.tts_provider == "kokoro"
    assert config.voice_mode == "ptt"


def test_load_config_creates_config_file(tmp_home, jarvis_config_dir):
    """load_config() auto-creates ~/.jarvis/config.json with defaults when file is missing."""
    from jarvis_desktop.config import load_config
    from pathlib import Path
    import json

    load_config()

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    assert config_file.exists(), "~/.jarvis/config.json should be created automatically"
    data = json.loads(config_file.read_text())
    assert data["gateway_url"] == "http://localhost:3000"
    assert data["whisper_model"] == "tiny"


def test_api_key_env_load(tmp_home, monkeypatch):
    """load_config() reads JARVIS_API_KEY env var and sets api_key field.

    D-06 load order: env var is loaded before config.json.
    PYCHAT-02 requirement.
    """
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("JARVIS_API_KEY", "sk-test-from-env")
    config = load_config()
    assert config.api_key == "sk-test-from-env"


def test_api_key_file_override(tmp_home, jarvis_config_dir, monkeypatch):
    """api_key from ~/.jarvis/config.json overrides JARVIS_API_KEY env var.

    D-06 load order: config.json applied after env vars — file wins for preference fields.
    PYCHAT-02 requirement.
    """
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("JARVIS_API_KEY", "sk-from-env")

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"api_key": "sk-from-file"}))

    config = load_config()
    assert config.api_key == "sk-from-file"


def test_load_config_ptt_key_default(tmp_home):
    """load_config() returns ptt_key='ctrl+shift+q' when no config file has the field.

    D-02 (Phase 74): default PTT hotkey.
    """
    from jarvis_desktop.config import load_config
    config = load_config()
    assert config.ptt_key == "ctrl+shift+q"


def test_load_config_ptt_key_from_file(tmp_home, jarvis_config_dir):
    """load_config() reads ptt_key from ~/.jarvis/config.json when present.

    D-02 (Phase 74): user-configurable PTT hotkey.
    """
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"ptt_key": "ctrl+alt+v"}))

    config = load_config()
    assert config.ptt_key == "ctrl+alt+v"
