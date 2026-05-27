"""Tests for config loading — PYSETUP-01 / PYSETUP-04."""
import pytest


def test_load_config_returns_defaults(tmp_home, monkeypatch):
    """load_config() returns JarvisConfig with default values when no config file exists."""
    from jarvis_desktop.config import load_config
    monkeypatch.setenv("TTS_PROVIDER", "")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "")
    monkeypatch.setenv("MURF_API_KEY", "")
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


def test_tts_config_fields(tmp_home, monkeypatch):
    """JarvisConfig has all Phase 75 TTS fields with correct defaults. PYTTS-01/04 + D-05/D-08/D-10."""
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("ELEVENLABS_API_KEY", "")
    monkeypatch.setenv("MURF_API_KEY", "")
    monkeypatch.setenv("TTS_PROVIDER", "")
    config = load_config()
    assert config.kokoro_voice == "pf_dora", f"Expected 'pf_dora', got {config.kokoro_voice!r}"
    assert config.local_only is False, f"Expected False, got {config.local_only!r}"
    assert config.elevenlabs_api_key == "", f"Expected '', got {config.elevenlabs_api_key!r}"
    assert config.murf_api_key == "", f"Expected '', got {config.murf_api_key!r}"
    assert config.tts_provider == "kokoro"


# ---------------------------------------------------------------------------
# Phase 78: CONF-01/02/03 — atomic save_config() tests
# ---------------------------------------------------------------------------

def test_save_config_atomic(tmp_home, jarvis_config_dir):
    """save_config() writes valid JSON atomically; no .tmp files remain. CONF-01."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import JarvisConfig, save_config

    config = JarvisConfig(whisper_model="base")
    save_config(config)

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    assert config_file.exists(), "config.json must exist after save_config()"

    # Must be valid JSON (atomic write guarantees this)
    data = json.loads(config_file.read_text(encoding="utf-8"))
    assert data["whisper_model"] == "base"

    # No temporary files must remain
    tmp_files = list((Path(tmp_home) / ".jarvis").glob("*.tmp"))
    assert tmp_files == [], f"No .tmp files should remain, found: {tmp_files}"


def test_save_config_thread_safe(tmp_home, jarvis_config_dir):
    """Concurrent save_config() calls from 10 threads produce valid JSON. CONF-01."""
    import json
    import threading
    from pathlib import Path
    from jarvis_desktop.config import JarvisConfig, save_config

    valid_models = [f"model_{i}" for i in range(10)]
    errors = []

    def writer(model_name):
        try:
            save_config(JarvisConfig(whisper_model=model_name))
        except Exception as exc:
            errors.append(str(exc))

    threads = [threading.Thread(target=writer, args=(m,)) for m in valid_models]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"save_config() raised exceptions: {errors}"

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    assert config_file.exists()
    data = json.loads(config_file.read_text(encoding="utf-8"))  # Must not raise JSONDecodeError
    assert data.get("whisper_model") in valid_models


def test_whisper_model_locked_default(tmp_home):
    """JarvisConfig.whisper_model_locked defaults to False. WGPU-02 dependency."""
    from jarvis_desktop.config import JarvisConfig, load_config
    import json
    from pathlib import Path

    # Schema default
    assert JarvisConfig().whisper_model_locked is False

    # load_config() also returns False
    config = load_config()
    assert config.whisper_model_locked is False

    # Written config.json contains the field
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    data = json.loads(config_file.read_text(encoding="utf-8"))
    assert "whisper_model_locked" in data
    assert data["whisper_model_locked"] is False


def test_whisper_model_locked_persists(tmp_home, jarvis_config_dir):
    """whisper_model_locked=True in config.json is loaded correctly. WGPU-02 dependency."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({
        "whisper_model": "base",
        "whisper_model_locked": True,
    }), encoding="utf-8")

    config = load_config()
    assert config.whisper_model_locked is True
    assert config.whisper_model == "base"


# ---------------------------------------------------------------------------
# Phase 82: D-05 — agentic_step_progress field tests
# ---------------------------------------------------------------------------

def test_agentic_step_progress_default(tmp_home):
    """agentic_step_progress defaults to False (D-05, Phase 82)."""
    from jarvis_desktop.config import load_config
    config = load_config()
    assert config.agentic_step_progress is False


def test_agentic_step_progress_from_config_json(tmp_home, jarvis_config_dir):
    """agentic_step_progress=True is loaded from ~/.jarvis/config.json."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"agentic_step_progress": True}), encoding="utf-8")
    config = load_config()
    assert config.agentic_step_progress is True


def test_agentic_step_progress_forward_compat(tmp_home, jarvis_config_dir):
    """Old config.json without agentic_step_progress loads with default False."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"whisper_model": "base"}), encoding="utf-8")
    config = load_config()
    assert config.agentic_step_progress is False


# ---------------------------------------------------------------------------
# Env var fallback for TTS secrets and provider (Step 2 + Step 4)
# ---------------------------------------------------------------------------

def test_elevenlabs_api_key_from_env(tmp_home, monkeypatch):
    """load_config() fills elevenlabs_api_key from ELEVENLABS_API_KEY env when config.json is empty."""
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("ELEVENLABS_API_KEY", "sk_from_env")
    config = load_config()
    assert config.elevenlabs_api_key == "sk_from_env"


def test_murf_api_key_from_env(tmp_home, monkeypatch):
    """load_config() fills murf_api_key from MURF_API_KEY env when config.json is empty."""
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("MURF_API_KEY", "murf_from_env")
    config = load_config()
    assert config.murf_api_key == "murf_from_env"


def test_tts_provider_from_env(tmp_home, monkeypatch):
    """load_config() reads TTS_PROVIDER from env when no config.json exists."""
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    config = load_config()
    assert config.tts_provider == "elevenlabs"


def test_tts_provider_config_json_wins_over_env(tmp_home, jarvis_config_dir, monkeypatch):
    """config.json tts_provider overrides TTS_PROVIDER env var (user preference wins)."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"tts_provider": "murf"}), encoding="utf-8")

    config = load_config()
    assert config.tts_provider == "murf"


def test_elevenlabs_key_config_json_wins_over_env(tmp_home, jarvis_config_dir, monkeypatch):
    """config.json non-empty elevenlabs_api_key overrides env var."""
    import json
    from pathlib import Path
    from jarvis_desktop.config import load_config

    monkeypatch.setenv("ELEVENLABS_API_KEY", "sk_from_env")
    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    config_file.write_text(json.dumps({"elevenlabs_api_key": "sk_from_file"}), encoding="utf-8")

    config = load_config()
    assert config.elevenlabs_api_key == "sk_from_file"
