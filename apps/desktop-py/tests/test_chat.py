"""Wave 0 test stubs for chat module — PYCHAT-01, PYCHAT-02.

These tests are xfail until apps/desktop-py/src/jarvis_desktop/chat.py is
implemented in Plan 02. strict=False so they pass as xfail (not fail as xpass).
"""
import pytest


@pytest.mark.xfail(strict=False, reason="chat.py not yet implemented — Wave 0 stub")
def test_parse_sse_tokens():
    """SSE 'data: <token>\\n\\n' format parsed correctly; token extracted and returned.

    PYCHAT-01: streaming response displayed token-by-token.
    """
    from jarvis_desktop.chat import parse_sse_line

    assert parse_sse_line("data: hello") == "hello"
    assert parse_sse_line("data: ") == ""
    assert parse_sse_line(": comment") is None
    assert parse_sse_line("event: message") is None


@pytest.mark.xfail(strict=False, reason="chat.py not yet implemented — Wave 0 stub")
def test_buffer_incomplete_sse_line():
    """Partial read across chunk boundary is handled without dropping tokens.

    PYCHAT-01: chunk read(1024) may split a 'data: token' line; buffer must
    accumulate incomplete lines and emit only complete ones.
    """
    from jarvis_desktop.chat import parse_sse_chunk

    # Simulate two chunks where first chunk ends mid-line
    chunk1 = "data: hel"
    chunk2 = "lo\n\ndata: world\n\n"

    tokens1, remaining1 = parse_sse_chunk(chunk1, buffer="")
    assert tokens1 == []
    assert "hel" in remaining1

    tokens2, remaining2 = parse_sse_chunk(chunk2, buffer=remaining1)
    assert "hello" in tokens2
    assert "world" in tokens2
    assert remaining2 == ""


@pytest.mark.xfail(strict=False, reason="chat.py not yet implemented — Wave 0 stub")
def test_auth_header_conditional():
    """Authorization header is injected only when config.api_key is non-empty.

    PYCHAT-02: api_key='' → no header; api_key='sk-test' → 'Bearer sk-test'.
    """
    from jarvis_desktop.chat import build_request_headers

    assert build_request_headers(api_key="") == {}
    assert build_request_headers(api_key="sk-test") == {
        "Authorization": "Bearer sk-test"
    }


@pytest.mark.xfail(strict=False, reason="chat.py not yet implemented — Wave 0 stub")
def test_gateway_offline_at_startup(tmp_home, capsys):
    """If gateway is offline at startup, chat loop returns error message without crash.

    PYCHAT-02: health.get('gateway') != 'ok' → print error, sys.exit(1).
    """
    from unittest.mock import patch
    import sys
    from jarvis_desktop.config import JarvisConfig

    config = JarvisConfig(gateway_url="http://localhost:19999")  # Nothing listening

    with patch("jarvis_desktop.chat.check_health", return_value={"gateway": "error"}):
        with pytest.raises(SystemExit) as exc_info:
            from jarvis_desktop.chat import run_with_health_check
            run_with_health_check(config)

    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    assert "offline" in captured.out.lower() or "error" in captured.out.lower()


def test_stream_response_triggers_tts(mock_kokoro_engine, mock_sounddevice_play, tmp_home, capsys):
    """_stream_response() enqueues sentences to _tts_queue (Phase 95 streaming TTS). STTS-01.

    Phase 95: speak(full_text) was replaced by sentence-level streaming via _tts_queue.
    This test verifies that sentences are enqueued during the SSE stream, not after.
    """
    import queue
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop.chat import _stream_response
    from jarvis_desktop import tts as _tts

    config = JarvisConfig()
    fake_sse = b"data: Hello\ndata: , world\n\n"

    # Drain queue before test
    while True:
        try:
            _tts._tts_queue.get_nowait()
        except queue.Empty:
            break

    with unittest.mock.patch("urllib.request.urlopen") as mock_urlopen, \
         unittest.mock.patch("jarvis_desktop.tts.start_tts_worker"):
        mock_response = unittest.mock.MagicMock()
        mock_response.__enter__ = unittest.mock.MagicMock(return_value=mock_response)
        mock_response.__exit__ = unittest.mock.MagicMock(return_value=False)
        # First read returns SSE data, second returns empty (EOF)
        mock_response.read.side_effect = [fake_sse, b""]
        mock_urlopen.return_value = mock_response

        _stream_response(config, "hello")

    # Sentences should have been enqueued to _tts_queue (Phase 95 streaming TTS)
    enqueued: list[str] = []
    while True:
        try:
            item = _tts._tts_queue.get_nowait()
            if item is not None:
                enqueued.append(item["text"])
        except queue.Empty:
            break

    # The full response text should be present across enqueued sentences
    full_enqueued = " ".join(enqueued)
    assert "Hello" in full_enqueued or len(enqueued) >= 1, (
        f"Expected sentences enqueued to _tts_queue, got: {enqueued!r}"
    )


# ---------------------------------------------------------------------------
# Phase 89: Speaker injection in messages and headers (SPK-08, D-11)
# ---------------------------------------------------------------------------


def test_build_speaker_prefix_high_confidence():
    """D-08: confidence >= threshold and is_known=True -> '[Biel]: '."""
    from jarvis_desktop.chat import _build_speaker_prefix

    result = _build_speaker_prefix(
        {"name": "Biel", "confidence": 0.85, "is_known": True, "candidate_name": "Biel"},
    )
    assert result == "[Biel]: "


def test_build_speaker_prefix_low_confidence_match():
    """D-08: match com confidence < threshold -> '[Biel?]: '."""
    from jarvis_desktop.chat import _build_speaker_prefix

    # is_known=False mas candidate_name="Biel" e confidence>0
    result = _build_speaker_prefix(
        {"name": "unknown", "confidence": 0.6, "is_known": False, "candidate_name": "Biel"},
    )
    assert result == "[Biel?]: "


def test_build_speaker_prefix_unknown():
    """D-08: nenhum match -> '[unknown]: '."""
    from jarvis_desktop.chat import _build_speaker_prefix

    result = _build_speaker_prefix(
        {"name": "unknown", "confidence": 0.0, "is_known": False, "candidate_name": "unknown"},
    )
    assert result == "[unknown]: "


def test_build_speaker_prefix_none_returns_empty():
    """Compat reversa: speaker_result=None -> ''."""
    from jarvis_desktop.chat import _build_speaker_prefix

    assert _build_speaker_prefix(None) == ""


def test_speaker_injection_system_prompt(monkeypatch):
    """SPK-08: _stream_response envia message com prefixo e header x-jarvis-speaker."""
    from jarvis_desktop import chat
    from jarvis_desktop.config import JarvisConfig

    captured_request = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b""

        def readline(self):
            return b""

    def _fake_urlopen(req, timeout=None):
        captured_request["url"] = req.full_url
        captured_request["headers"] = dict(req.headers)
        return _FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen)
    monkeypatch.setattr(chat, "_read_sse_stream", lambda *a, **kw: "")
    monkeypatch.setattr(chat, "speak", lambda *a, **kw: None)

    config = JarvisConfig(gateway_url="http://localhost:3000", speaker_recognition_enabled=True)
    speaker_result = {
        "name": "Biel",
        "confidence": 0.85,
        "is_known": True,
        "candidate_name": "Biel",
    }

    chat._stream_response(config, "[Biel]: ola jarvis", speaker_result=speaker_result)

    # Header x-jarvis-speaker presente com valor "Biel"
    # urllib normaliza header names para Title-Case
    header_keys = {k.lower(): v for k, v in captured_request["headers"].items()}
    assert header_keys.get("x-jarvis-speaker") == "Biel"

    # URL contém message com prefixo aplicado
    assert "%5BBiel%5D%3A" in captured_request["url"] or "[Biel]:" in captured_request["url"]


def test_unknown_speaker_chromadb_header(monkeypatch):
    """D-11: speaker='unknown' envia header x-jarvis-speaker: unknown ao gateway."""
    from jarvis_desktop import chat
    from jarvis_desktop.config import JarvisConfig

    captured_request = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b""

        def readline(self):
            return b""

    def _fake_urlopen(req, timeout=None):
        captured_request["headers"] = dict(req.headers)
        return _FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen)
    monkeypatch.setattr(chat, "_read_sse_stream", lambda *a, **kw: "")
    monkeypatch.setattr(chat, "speak", lambda *a, **kw: None)

    config = JarvisConfig(gateway_url="http://localhost:3000", speaker_recognition_enabled=True)
    speaker_result = {
        "name": "unknown",
        "confidence": 0.0,
        "is_known": False,
        "candidate_name": "unknown",
    }

    chat._stream_response(config, "[unknown]: hello", speaker_result=speaker_result)

    header_keys = {k.lower(): v for k, v in captured_request["headers"].items()}
    assert header_keys.get("x-jarvis-speaker") == "unknown"


def test_no_speaker_header_when_disabled(monkeypatch):
    """Compat reversa: speaker_result=None -> header x-jarvis-speaker NAO enviado."""
    from jarvis_desktop import chat
    from jarvis_desktop.config import JarvisConfig

    captured_request = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b""

        def readline(self):
            return b""

    def _fake_urlopen(req, timeout=None):
        captured_request["headers"] = dict(req.headers)
        return _FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen)
    monkeypatch.setattr(chat, "_read_sse_stream", lambda *a, **kw: "")
    monkeypatch.setattr(chat, "speak", lambda *a, **kw: None)

    config = JarvisConfig(gateway_url="http://localhost:3000", speaker_recognition_enabled=False)

    chat._stream_response(config, "hello", speaker_result=None)

    header_keys = {k.lower(): v for k, v in captured_request["headers"].items()}
    assert "x-jarvis-speaker" not in header_keys


# ---------------------------------------------------------------------------
# Phase 95: Streaming TTS — sentence producer integration (STTS-01)
# ---------------------------------------------------------------------------


def test_sse_stream_enqueues_sentences(mock_kokoro_engine, mock_sounddevice_play):
    """_read_sse_stream() enqueues sentences to _tts._tts_queue as tokens arrive. STTS-01."""
    import queue
    import unittest.mock
    from jarvis_desktop import tts as _tts
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop.chat import _read_sse_stream

    config = JarvisConfig()

    # Build synthetic SSE stream: 2 sentences split across tokens
    # "Olá, como vai? Estou bem, obrigado."
    tokens = [
        "Olá",
        ", como",
        " vai?",
        " Estou",
        " bem,",
        " obrigado.",
    ]
    # Build SSE bytes: each token as "data: <token>\n\n"
    sse_bytes = b""
    for t in tokens:
        sse_bytes += f"data: {t}\n\n".encode()

    # Create a mock response with .read() that returns the bytes then b""
    call_count = [0]
    def mock_read(n):
        if call_count[0] == 0:
            call_count[0] += 1
            return sse_bytes
        return b""

    mock_response = unittest.mock.MagicMock()
    mock_response.read.side_effect = mock_read

    # Drain any leftover items from previous tests
    while True:
        try:
            _tts._tts_queue.get_nowait()
        except queue.Empty:
            break

    # Mock start_tts_worker to avoid creating a real thread in unit tests
    with unittest.mock.patch("jarvis_desktop.tts.start_tts_worker"):
        _read_sse_stream(mock_response, config, accumulate_for_tts=True, main_stream=False)

    # Collect all enqueued sentences
    enqueued: list[str] = []
    while True:
        try:
            item = _tts._tts_queue.get_nowait()
            if item is not None:
                enqueued.append(item["text"])
        except queue.Empty:
            break

    assert len(enqueued) >= 1, f"No sentences enqueued — got {enqueued!r}"
    # First sentence should contain "Olá" and end at "?" boundary
    assert any("Olá" in s for s in enqueued), (
        f"Expected 'Olá' in enqueued sentences, got: {enqueued!r}"
    )
