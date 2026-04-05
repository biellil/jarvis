"""Tests for ChatSession.send_stream() — API-02 streaming path.

TDD RED phase: These tests define the expected behavior of send_stream().
They test send_stream() directly on ChatSession (not via HTTP endpoint).
The endpoint-level SSE tests are in test_chat.py.

Per D-02: send_stream() must yield tokens as async generator WITHOUT printing to stdout.
Per plan must_haves:
  - Yields tokens in order from LLM astream
  - Concatenation of yields == full response
  - NO stdout output (no print())
  - Propagates LLM exceptions
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_mock_llm(chunks: list[str] | None = None, error: Exception | None = None):
    """Build a mock LLM whose astream() yields the given text chunks.

    Args:
        chunks: List of token strings to yield (default: ["Ola", " mundo", "!"])
        error: If set, astream raises this exception instead.
    """
    mock_llm = MagicMock()

    if error is not None:
        async def failing_astream(messages):
            raise error
            yield  # Make it an async generator

        mock_llm.astream = failing_astream
    else:
        texts = chunks if chunks is not None else ["Ola", " mundo", "!"]

        async def fake_astream(messages):
            for text in texts:
                chunk = MagicMock()
                chunk.content = text
                yield chunk

        mock_llm.astream = fake_astream

    return mock_llm


def make_session(llm):
    """Build a minimal ChatSession with a mocked LLM and no DB/vectors.

    Patches _maybe_compress to be a no-op so we avoid hitting compression logic.
    """
    from jarvis.core.session import ChatSession

    session = ChatSession(llm=llm)
    # No DB, no vectors — simplest possible session for unit testing
    return session


@pytest.mark.anyio
async def test_send_stream_yields_tokens():
    """send_stream() yields tokens in the same order as LLM astream chunks."""
    mock_llm = make_mock_llm(["Ola", " mundo", "!"])
    session = make_session(mock_llm)

    tokens = [t async for t in session.send_stream("oi")]

    assert tokens == ["Ola", " mundo", "!"]


@pytest.mark.anyio
async def test_send_stream_concatenation():
    """Concatenating all yielded tokens produces the full response."""
    mock_llm = make_mock_llm(["Ola", " mundo", "!"])
    session = make_session(mock_llm)

    tokens = [t async for t in session.send_stream("oi")]

    assert "".join(tokens) == "Ola mundo!"


@pytest.mark.anyio
async def test_send_stream_no_print(capsys):
    """send_stream() does NOT print to stdout (unlike send() which uses print())."""
    mock_llm = make_mock_llm(["Ola", " mundo", "!"])
    session = make_session(mock_llm)

    tokens = [t async for t in session.send_stream("oi")]

    captured = capsys.readouterr()
    assert captured.out == "", (
        f"send_stream() must NOT print to stdout. Got: {captured.out!r}"
    )
    # Verify we actually got tokens (sanity check)
    assert len(tokens) > 0


@pytest.mark.anyio
async def test_send_stream_error_propagation():
    """If LLM astream raises an exception, send_stream() propagates it."""
    error = RuntimeError("LLM error simulated")
    mock_llm = make_mock_llm(error=error)
    session = make_session(mock_llm)

    with pytest.raises(RuntimeError, match="LLM error simulated"):
        async for _ in session.send_stream("oi"):
            pass


@pytest.mark.anyio
async def test_send_stream_empty_tokens_skipped():
    """send_stream() skips empty/falsy token chunks (same as send())."""
    mock_llm = make_mock_llm(["Ola", "", " mundo", "!"])
    session = make_session(mock_llm)

    tokens = [t async for t in session.send_stream("oi")]

    # Empty string chunk should be skipped
    assert "" not in tokens
    assert tokens == ["Ola", " mundo", "!"]
