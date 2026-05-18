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
