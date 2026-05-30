"""Tests for jarvis_desktop.speaker (Phase 89, SPK-01..SPK-06, SPK-10)."""
from __future__ import annotations

import numpy as np
import pytest


# -------------------------------------------------------------------------
# SPK-01: identify_speaker retorna dict
# -------------------------------------------------------------------------

def test_identify_speaker_returns_dict(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(speaker_recognition_enabled=True, speaker_threshold=0.75)
    audio = np.zeros(16000 * 3, dtype=np.float32)

    result = speaker.identify_speaker(audio, config)

    assert isinstance(result, dict)
    # candidate_name foi adicionado para hybrid injection (Plan 03) — aceita subset
    assert {"name", "confidence", "is_known", "candidate_name"} <= set(result.keys())
    # Sem perfis cadastrados → unknown
    assert result["name"] == "unknown"
    assert result["confidence"] == 0.0
    assert result["is_known"] is False


# -------------------------------------------------------------------------
# SPK-02: speaker acima do threshold
# -------------------------------------------------------------------------

def test_identify_speaker_above_threshold(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    # Embedding determinístico do perfil "Biel"
    biel_emb = np.random.RandomState(123).randn(256).astype(np.float32)
    biel_emb = biel_emb / np.linalg.norm(biel_emb)
    speaker.save_profile("Biel", biel_emb)

    # Mock retorna o MESMO embedding para a fala do turno
    mock_voice_encoder.embed_utterance.return_value = biel_emb

    config = JarvisConfig(speaker_recognition_enabled=True, speaker_threshold=0.75)
    result = speaker.identify_speaker(np.zeros(16000 * 3, dtype=np.float32), config)

    assert result["name"] == "Biel"
    assert result["is_known"] is True
    assert result["confidence"] >= 0.99


# -------------------------------------------------------------------------
# SPK-03: speaker abaixo do threshold
# -------------------------------------------------------------------------

def test_identify_speaker_below_threshold(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    # Perfil: vetor [1, 0, 0, ...]
    biel_emb = np.zeros(256, dtype=np.float32)
    biel_emb[0] = 1.0
    speaker.save_profile("Biel", biel_emb)

    # Turno: vetor ortogonal [0, 1, 0, ...] → cosine ≈ 0
    turn_emb = np.zeros(256, dtype=np.float32)
    turn_emb[1] = 1.0
    mock_voice_encoder.embed_utterance.return_value = turn_emb

    config = JarvisConfig(speaker_recognition_enabled=True, speaker_threshold=0.75)
    result = speaker.identify_speaker(np.zeros(16000 * 3, dtype=np.float32), config)

    assert result["name"] == "unknown"
    assert result["is_known"] is False
    assert result["confidence"] < 0.75


# -------------------------------------------------------------------------
# SPK-04: ProfileStore CRUD
# -------------------------------------------------------------------------

def test_profile_store_crud(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker

    emb = np.random.RandomState(7).randn(256).astype(np.float32)
    speaker.save_profile("alice", emb)

    profile_path = tmp_home / ".jarvis" / "speakers" / "alice.npy"
    assert profile_path.exists()

    loaded = speaker.load_profile("alice")
    assert np.allclose(loaded, emb)

    names = speaker.list_profiles()
    assert names == ["alice"]

    assert speaker.delete_profile("alice") is True
    assert not profile_path.exists()
    assert speaker.delete_profile("alice") is False


# -------------------------------------------------------------------------
# SPK-05: preprocess_wav + embed_utterance aceita NumPy 16kHz
# -------------------------------------------------------------------------

def test_embed_utterance_from_numpy(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(speaker_recognition_enabled=True, speaker_threshold=0.75)
    audio = np.zeros(16000 * 3, dtype=np.float32)

    # Não levanta exceção — passa NumPy direto sem conversão
    result = speaker.identify_speaker(audio, config)

    assert result is not None
    assert mock_voice_encoder.embed_utterance.call_count == 1


# -------------------------------------------------------------------------
# SPK-06: VoiceEncoder singleton
# -------------------------------------------------------------------------

def test_voice_encoder_singleton(tmp_home, mock_voice_encoder):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(speaker_recognition_enabled=True, speaker_threshold=0.75)
    audio = np.zeros(16000 * 3, dtype=np.float32)

    for _ in range(5):
        speaker.identify_speaker(audio, config)

    # VoiceEncoder instanciado UMA vez (singleton, threading.Lock)
    assert mock_voice_encoder._encoder_class.call_count == 1


# -------------------------------------------------------------------------
# SPK-10: Enrollment salva .npy com shape (256,)
# -------------------------------------------------------------------------

def test_enroll_saves_npy(tmp_home, mock_voice_encoder, monkeypatch):
    from jarvis_desktop import speaker
    from jarvis_desktop.config import JarvisConfig

    # Mock record_until_silence para retornar 4s de áudio (passa validação de duração ≥2s)
    fake_audio = np.zeros(16000 * 4, dtype=np.float32)
    monkeypatch.setattr("jarvis_desktop.stt.record_until_silence", lambda **kw: fake_audio)

    config = JarvisConfig(speaker_recognition_enabled=True, speaker_threshold=0.75)
    speaker.enroll_speaker("biel", config, n_utterances=5)

    profile_path = tmp_home / ".jarvis" / "speakers" / "biel.npy"
    assert profile_path.exists()

    loaded = np.load(str(profile_path))
    assert loaded.shape == (256,)
    assert loaded.dtype == np.float32

    # D-14: embed_speaker chamado UMA vez com 5 wavs (média interna)
    assert mock_voice_encoder.embed_speaker.call_count == 1
    called_wavs = mock_voice_encoder.embed_speaker.call_args[0][0]
    assert len(called_wavs) == 5
