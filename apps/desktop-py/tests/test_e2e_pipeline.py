"""Teste E2E do pipeline PTT → STT → LLM(mock) → TTS (POL-04, D-13..D-18).

Marker @pytest.mark.e2e — rodar isolado com `pytest -m e2e`.
Unit suite ignora com `pytest -m "not e2e"`.

Pré-requisito: Plan 02 Task 2c expõe `voice_modes.run_ptt_once` com injeção de
audio_provider / http_call / tts_play, eliminando threading + pynput + sd.InputStream.
"""
from __future__ import annotations

import numpy as np
import pytest


@pytest.mark.e2e
def test_ptt_full_pipeline_with_mocked_llm(
    tmp_home,
    e2e_audio_wav,
    monkeypatch,
):
    """Pipeline PTT determinístico: STT real (Whisper tiny) + LLM mockado + TTS spy.

    Asserções (D-18):
      1. STT transcreveu (string não-vazia, pelo menos 1 palavra ≥ 2 chars)
      2. http_call recebeu headers corretos (Content-Type=application/json
         e x-jarvis-speaker AUSENTE quando speaker_recognition_enabled=False)
      3. SSE/LLM response acumulada e propagada
      4. tts_play recebeu o texto da response
      5. UI state sequence: listening → transcribing → thinking → speaking (→ idle)
    """
    from jarvis_desktop import voice_modes
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import stt as _stt

    # Estado: config sem speaker recognition (asserção D-18.2 valida ausência do header).
    config = JarvisConfig(
        whisper_model="tiny",
        tts_provider="kokoro",
        speaker_recognition_enabled=False,
    )

    # init_stt é pré-requisito de transcribe() — equivalente ao path real do main.
    _stt.init_stt(config)

    # --- Spies ---
    http_calls: list[tuple[str, dict]] = []
    tts_calls: list[str] = []
    ui_states: list[str] = []

    # UI state spy — patch direto em jarvis_desktop.ui.set_state (existe, validado)
    monkeypatch.setattr(
        "jarvis_desktop.ui.set_state",
        lambda s: ui_states.append(s),
        raising=True,
    )

    # Mock http_call retornando resposta determinística "olá humano".
    def fake_http(message: str, headers: dict) -> str:
        http_calls.append((message, dict(headers)))
        return "olá humano"

    # Mock tts_play coletando o texto recebido.
    def fake_tts(text: str) -> None:
        tts_calls.append(text)

    # --- Execução ---
    result = voice_modes.run_ptt_once(
        config,
        audio_provider=lambda: e2e_audio_wav,
        http_call=fake_http,
        tts_play=fake_tts,
    )

    # --- Asserções (D-18) ---

    # 1. STT transcreveu — string não-vazia com pelo menos 1 palavra ≥ 2 chars
    transcript = result["transcript"]
    assert isinstance(transcript, str) and transcript.strip(), (
        f"STT deve retornar string não-vazia, recebeu: {transcript!r}"
    )
    assert any(len(w) >= 2 for w in transcript.split()), (
        f"STT deve produzir pelo menos uma palavra ≥ 2 chars, recebeu: {transcript!r}"
    )

    # 2. http_call disparado com headers corretos
    assert len(http_calls) == 1, f"Esperava 1 chamada http, recebeu {len(http_calls)}"
    sent_message, sent_headers = http_calls[0]
    assert sent_headers.get("Content-Type") == "application/json", (
        f"Content-Type esperado application/json, got {sent_headers.get('Content-Type')!r}"
    )
    # D-18.2: speaker_recognition_enabled=False → header x-jarvis-speaker NÃO presente
    assert "x-jarvis-speaker" not in sent_headers, (
        f"x-jarvis-speaker NÃO deve estar presente quando speaker_recognition_enabled=False, "
        f"headers recebidos: {sent_headers!r}"
    )

    # 3. SSE/LLM response acumulada e propagada
    assert result["response"] == "olá humano", (
        f"Response deve ser propagada, recebeu: {result['response']!r}"
    )

    # 4. TTS recebeu o texto completo
    assert tts_calls == ["olá humano"], (
        f"TTS deve receber exatamente a response, recebeu: {tts_calls!r}"
    )

    # 5. UI state sequence: listening → transcribing → thinking → speaking → idle
    expected_order = ["listening", "transcribing", "thinking", "speaking", "idle"]
    # Asserção de ordem: cada estado esperado aparece e mantém ordem relativa
    positions = []
    for state in expected_order:
        assert state in ui_states, (
            f"Estado {state!r} ausente em ui_states={ui_states!r}"
        )
        positions.append(ui_states.index(state))
    assert positions == sorted(positions), (
        f"Ordem dos estados quebrada: {ui_states!r}"
    )
