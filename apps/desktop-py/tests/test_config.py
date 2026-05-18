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
