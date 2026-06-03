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


def test_stream_response_triggers_tts(tmp_home, capsys):
    """_stream_response() calls speak() with full accumulated response text after SSE stream. D-01, PYTTS-01."""
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop.chat import _stream_response

    config = JarvisConfig()
    fake_sse = b"data: Hello\ndata: , world\n\n"

    with unittest.mock.patch("urllib.request.urlopen") as mock_urlopen, \
         unittest.mock.patch("jarvis_desktop.chat.speak") as mock_speak:
        mock_response = unittest.mock.MagicMock()
        mock_response.__enter__ = unittest.mock.MagicMock(return_value=mock_response)
        mock_response.__exit__ = unittest.mock.MagicMock(return_value=False)
        # First read returns SSE data, second returns empty (EOF)
        mock_response.read.side_effect = [fake_sse, b""]
        mock_urlopen.return_value = mock_response

        _stream_response(config, "hello")

    # speak() should have been called with the full accumulated response
    mock_speak.assert_called_once()
    call_args = mock_speak.call_args[0]
    assert "Hello" in call_args[0], f"Expected 'Hello' in speak() arg, got: {call_args[0]!r}"
    assert ", world" in call_args[0] or "world" in call_args[0]


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
