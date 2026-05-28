"""Tests for train_wake_word.py — Phase 81 Custom Wake Word pt-BR.

Covers WAKE-01 through WAKE-05. Wave 0 xfail stubs created in Plan 81-01.
Implementation in Plan 81-02 turns the non-hardware stubs green.
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

from jarvis_desktop.config import JarvisConfig

# ---------------------------------------------------------------------------
# Module-level constant
# ---------------------------------------------------------------------------

SCRIPT_PATH = Path(__file__).parent.parent / "tools" / "train_wake_word.py"


# ---------------------------------------------------------------------------
# WAKE-01: Script metadata and invocation
# ---------------------------------------------------------------------------


def test_pep723_metadata():
    """WAKE-01: Script header must contain valid PEP 723 metadata with Python >=3.10."""
    assert SCRIPT_PATH.exists(), f"Script not found: {SCRIPT_PATH}"
    text = SCRIPT_PATH.read_text()
    assert "# /// script" in text
    assert 'requires-python = ">=3.10"' in text
    assert '"openwakeword==0.6.0"' in text
    assert '"scikit-learn>=1.3"' in text
    assert '"torch>=2.0"' in text
    assert '"sounddevice==0.5.5"' in text


def test_script_runs_with_help():
    """WAKE-01: --help flag must work without uv (no heavy imports at module level)."""
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--help"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, f"--help failed: {result.stderr}"
    assert (
        "ei jarvis" in result.stdout.lower()
        or "train" in result.stdout.lower()
        or "wake" in result.stdout.lower()
    )


def test_script_dry_run():
    """WAKE-01: --dry-run must exit 0 and print DRY-RUN marker."""
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--dry-run"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, f"--dry-run failed: {result.stderr}"
    assert "DRY-RUN" in result.stdout or "dry" in result.stdout.lower()


def test_model_save_path(tmp_home):
    """WAKE-03: Model save path must resolve to ~/.jarvis/models/wake_word_custom.pkl"""
    spec = importlib.util.spec_from_file_location("train_ww", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # The constant _CUSTOM_PKL must point to ~/.jarvis/models/wake_word_custom.pkl
    expected_suffix = Path(".jarvis") / "models" / "wake_word_custom.pkl"
    assert mod._CUSTOM_PKL.parts[-3:] == expected_suffix.parts, (
        f"Expected path ending in {expected_suffix}, got {mod._CUSTOM_PKL}"
    )

    # _MODELS_DIR parent must be ~/.jarvis/
    assert mod._MODELS_DIR.name == "models"
    assert mod._MODELS_DIR.parent.name == ".jarvis"


def test_colab_fallback_path(capsys):
    """D-01: _show_colab_fallback() must print Colab notebook URL."""
    spec = importlib.util.spec_from_file_location("train_ww", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    mod._show_colab_fallback()
    captured = capsys.readouterr()
    assert "colab" in captured.out.lower() or "notebook" in captured.out.lower()
    assert "~/.jarvis/models" in captured.out or ".jarvis/models" in captured.out


# ---------------------------------------------------------------------------
# WAKE-02: Recording UX (require real microphone — remain xfail)
# ---------------------------------------------------------------------------


@pytest.mark.xfail(
    reason="Requires microphone hardware and openwakeword training runtime",
    strict=True,
)
def test_recording_session_minimum_samples():
    """WAKE-02: Recording session must enforce minimum 20 samples before training."""
    raise NotImplementedError("Requires microphone hardware and openwakeword training runtime")


@pytest.mark.xfail(
    reason="Requires microphone hardware and openwakeword training runtime",
    strict=True,
)
def test_countdown_ux():
    """WAKE-02: Countdown '3...2...1...' must be printed during recording."""
    raise NotImplementedError("Requires microphone hardware and openwakeword training runtime")


@pytest.mark.xfail(
    reason="Requires microphone hardware and openwakeword training runtime",
    strict=True,
)
def test_rms_feedback_per_sample():
    """WAKE-02: RMS feedback must be shown after each recorded sample."""
    raise NotImplementedError("Requires microphone hardware and openwakeword training runtime")


@pytest.mark.xfail(
    reason="Requires microphone hardware and openwakeword training runtime",
    strict=True,
)
def test_ptt_flag():
    """WAKE-02: When --ptt flag is passed, recording waits for keypress instead of auto-recording."""
    raise NotImplementedError("Requires microphone hardware and openwakeword training runtime")


@pytest.mark.xfail(
    reason="Requires microphone hardware and openwakeword training runtime",
    strict=True,
)
def test_threshold_calibration(tmp_home, jarvis_config_dir):
    """WAKE-05: Auto-calibrated threshold is written to ~/.jarvis/config.json as wake_word_threshold."""
    raise NotImplementedError("Requires microphone hardware and openwakeword training runtime")
