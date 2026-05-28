"""Tests for voice_cloning module — Phase 85.

Wave 0: xfail stubs matching RESEARCH.md Validation Architecture test map.
These become passing in Plan 02 (tts.py integration) and Plan 03 (clone_voice.py script).

Test map:
  test_extract_embedding_valid_wav          — extract_speaker_embedding with 5+ sec WAV
  test_extract_embedding_duration_warning   — validate_reference_audio rejects < 3s audio
  test_save_load_embedding                  — save + load torch tensor round-trip
  test_speak_cloned_voice_missing_fallback  — load_cloned_voice returns None if path missing
  test_kokoro_speak_with_cloned_embedding   — tts._kokoro_speak_with_embedding uses custom tensor (Plan 02)
  test_config_cloned_voice_path_persistence — cloned_voice_path persists across save_config/load_config
  test_clone_voice_script_e2e              — tools/clone_voice.py end-to-end (Plan 03, slow)
"""
import pytest


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 01")
def test_extract_embedding_valid_wav(mock_kokoclone_encoder, mock_reference_audio, tmp_path, monkeypatch):
    """extract_speaker_embedding() returns 512-dim torch.Tensor from valid WAV file."""
    import torch
    from jarvis_desktop.voice_cloning import extract_speaker_embedding
    from unittest.mock import MagicMock
    # Mock librosa.load to return dummy audio (avoids loading real file w/ full librosa)
    import sys, types
    mock_librosa = types.ModuleType("librosa")
    import numpy as np
    mock_librosa.load = MagicMock(return_value=(np.zeros(80000, dtype=np.float32), 16000))
    mock_librosa.get_duration = MagicMock(return_value=5.0)
    monkeypatch.setitem(sys.modules, "librosa", mock_librosa)

    embedding = extract_speaker_embedding(mock_reference_audio, device="cpu")

    assert isinstance(embedding, torch.Tensor)
    assert embedding.shape[0] == 512


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 01")
def test_extract_embedding_duration_warning(tmp_path, monkeypatch):
    """validate_reference_audio() returns False and prints warning for audio < 3s."""
    import sys, types
    from unittest.mock import MagicMock
    mock_librosa = types.ModuleType("librosa")
    mock_librosa.get_duration = MagicMock(return_value=1.5)  # 1.5s — below 3s threshold
    monkeypatch.setitem(sys.modules, "librosa", mock_librosa)

    from jarvis_desktop.voice_cloning import validate_reference_audio
    result = validate_reference_audio("dummy.wav", min_duration_sec=3.0)

    assert result is False


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 01")
def test_save_load_embedding(tmp_path, monkeypatch):
    """save_cloned_voice() persists tensor; load_cloned_voice() restores it exactly."""
    import torch
    import numpy as np
    # Redirect ~/.jarvis to tmp_path for isolation
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setenv("USERPROFILE", str(fake_home))

    from jarvis_desktop.voice_cloning import save_cloned_voice, load_cloned_voice
    from jarvis_desktop.config import JarvisConfig

    original = torch.from_numpy(np.random.rand(512).astype(np.float32))
    saved_path = save_cloned_voice(original, name="test_voice.pt")

    config = JarvisConfig(cloned_voice_path=saved_path)
    loaded = load_cloned_voice(config)

    assert loaded is not None
    assert torch.allclose(original, loaded)


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 01")
def test_speak_cloned_voice_missing_fallback():
    """load_cloned_voice() returns None when cloned_voice_path file does not exist (D-04)."""
    from jarvis_desktop.voice_cloning import load_cloned_voice
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(cloned_voice_path="/nonexistent/path/cloned_voice.pt")
    result = load_cloned_voice(config)

    assert result is None


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 02 (tts.py integration)")
def test_kokoro_speak_with_cloned_embedding(mock_kokoro_engine, mock_sounddevice_play, monkeypatch):
    """tts._kokoro_speak_with_embedding() plays audio using custom tensor voice. (Plan 02)"""
    import torch
    import numpy as np
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.config import JarvisConfig

    tts_module._engine = mock_kokoro_engine
    embedding = torch.from_numpy(np.zeros(512, dtype=np.float32))
    config = JarvisConfig()

    tts_module._kokoro_speak_with_embedding("Olá mundo", embedding, config)

    mock_kokoro_engine.assert_called_once()
    mock_sounddevice_play.play.assert_called_once()
    tts_module._engine = None


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 02 (config integration)")
def test_config_cloned_voice_path_persistence(tmp_path, monkeypatch):
    """cloned_voice_path field persists across save_config() / load_config() cycle."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setenv("USERPROFILE", str(fake_home))
    monkeypatch.setenv("GATEWAY_URL", "http://localhost:3000")

    from jarvis_desktop.config import JarvisConfig, save_config, load_config

    config = JarvisConfig(cloned_voice_path="/some/path/cloned_voice.pt")
    save_config(config)
    loaded = load_config()

    assert loaded.cloned_voice_path == "/some/path/cloned_voice.pt"


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — implement in Plan 03 (clone_voice.py script)")
def test_clone_voice_script_e2e(mock_kokoclone_encoder, tmp_path, monkeypatch):
    """tools/clone_voice.py end-to-end: reference audio -> saved .pt profile. (Plan 03, slow)"""
    import sys, types
    from unittest.mock import MagicMock
    import numpy as np

    # Mock librosa and redirect ~/.jarvis
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setenv("USERPROFILE", str(fake_home))

    mock_librosa = types.ModuleType("librosa")
    mock_librosa.load = MagicMock(return_value=(np.zeros(80000, dtype=np.float32), 16000))
    mock_librosa.get_duration = MagicMock(return_value=5.0)
    monkeypatch.setitem(sys.modules, "librosa", mock_librosa)

    # Create dummy reference file
    ref_wav = tmp_path / "ref.wav"
    ref_wav.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")  # Minimal WAV header placeholder

    from jarvis_desktop.voice_cloning import extract_speaker_embedding, save_cloned_voice

    embedding = extract_speaker_embedding(str(ref_wav), device="cpu")
    saved = save_cloned_voice(embedding)

    from pathlib import Path
    assert Path(saved).exists()
    assert saved.endswith(".pt")
