"""Tests for config persistence — PYSETUP-04.

Wave 0: These are stubs. Implementation in Plan 03 (config.py).
Tests are marked xfail until config.py exists.
"""
import json
import pytest
from pathlib import Path


@pytest.mark.xfail(reason="Wave 0 stub — config.py not yet implemented (Plan 03)")
def test_config_persists_custom_values(tmp_home, jarvis_config_dir):
    """Config values written to ~/.jarvis/config.json survive a second load_config() call."""
    from jarvis_desktop.config import load_config

    # Write custom config
    config_file = jarvis_config_dir / "config.json"
    config_file.write_text(json.dumps({
        "gateway_url": "http://localhost:3000",
        "whisper_model": "base",
        "tts_provider": "elevenlabs",
        "voice_mode": "ptt",
    }))

    # Load should pick up custom values
    config = load_config()
    assert config.whisper_model == "base"
    assert config.tts_provider == "elevenlabs"


@pytest.mark.xfail(reason="Wave 0 stub — config.py not yet implemented (Plan 03)")
def test_config_missing_fields_get_defaults(tmp_home, jarvis_config_dir):
    """Partial config.json — missing fields use defaults, not errors."""
    from jarvis_desktop.config import load_config

    config_file = jarvis_config_dir / "config.json"
    config_file.write_text(json.dumps({"whisper_model": "small"}))

    config = load_config()
    assert config.whisper_model == "small"
    assert config.gateway_url == "http://localhost:3000"  # default
    assert config.tts_provider == "kokoro"  # default
    assert config.voice_mode == "ptt"  # default


@pytest.mark.xfail(reason="Wave 0 stub — config.py not yet implemented (Plan 03)")
def test_health_check_offline_returns_dict(tmp_home):
    """check_health() on unreachable URL returns dict with gateway=unreachable (no crash)."""
    from jarvis_desktop.health import check_health
    result = check_health("http://localhost:19999")  # Nothing listening here
    assert isinstance(result, dict)
    assert result["gateway"] == "unreachable"
