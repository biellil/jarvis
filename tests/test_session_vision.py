"""Tests for Phase 5 Plan 02: vision routing, hot-reload, multimodal message, LLM-03.

Tests cover:
1. create_llm() backward-compatible (no args)
2. create_llm(settings_override=...) uses provided settings
3. ALL_TOOLS contains analyze_screen (10 tools total)
4. send(text, image=b64) builds multimodal HumanMessage
5. analyze_screen tool routes to vision (not executor)
6. OCR fallback injects text context
7. Hot-reload: LLM rebuilt when model changes
8. Hot-reload: LLM NOT rebuilt when model unchanged
9. Non-vision send() always uses local model (LLM-03)
10. Tool invocation uses asyncio.to_thread (ARCH-02)
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from langchain_core.messages import AIMessageChunk, ToolMessage, AIMessage, HumanMessage

from jarvis.config import Settings
from jarvis.core.session import ChatSession
from jarvis.tools import ALL_TOOLS


# ---------------------------------------------------------------------------
# Helpers (copied from test_session_tools.py)
# ---------------------------------------------------------------------------

def make_text_chunk(content: str) -> AIMessageChunk:
    """Create an AIMessageChunk with plain text content (no tool calls)."""
    return AIMessageChunk(content=content)


def make_tool_call_chunk(tool_name: str, args: dict, call_id: str = "call_abc123") -> AIMessageChunk:
    """Create an AIMessageChunk representing a complete tool call."""
    chunk = AIMessageChunk(
        content="",
        tool_calls=[{"name": tool_name, "args": args, "id": call_id, "type": "tool_call"}],
    )
    return chunk


class _AsyncIterChunks:
    """Async iterable wrapper for a list of chunks."""
    def __init__(self, chunks):
        self._chunks = chunks

    def __aiter__(self):
        return self._aiter()

    async def _aiter(self):
        for chunk in self._chunks:
            yield chunk


def aiter_chunks(chunks):
    """Return an async iterable for the given list of chunks."""
    return _AsyncIterChunks(chunks)


def make_settings(**kwargs) -> Settings:
    """Create a Settings instance bypassing pydantic validation."""
    return Settings.model_construct(**kwargs)


# ---------------------------------------------------------------------------
# Task 1 tests: create_llm() with settings_override
# ---------------------------------------------------------------------------

def test_create_llm_no_args_backward_compatible():
    """create_llm() with no args still works (backward compatible)."""
    from jarvis.llm.factory import create_llm
    from langchain_openai import ChatOpenAI

    settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="test-model",
        llm_model="",
    )

    with patch("jarvis.llm.factory.settings", settings):
        llm = create_llm()

    assert isinstance(llm, ChatOpenAI)


def test_create_llm_settings_override_used():
    """create_llm(settings_override=...) uses the provided settings, ignoring global."""
    from jarvis.llm.factory import create_llm
    from langchain_openai import ChatOpenAI
    from langchain_anthropic import ChatAnthropic

    # Global settings say lmstudio
    global_settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="",
        llm_model="",
    )

    # Override says anthropic
    override_settings = make_settings(
        llm_provider="anthropic",
        anthropic_api_key="sk-ant-test",
        llm_model="claude-3-5-haiku-20241022",
    )

    with patch("jarvis.llm.factory.settings", global_settings):
        llm = create_llm(settings_override=override_settings)

    # Should use the override (anthropic), not global (lmstudio)
    assert isinstance(llm, ChatAnthropic)


def test_all_tools_contains_analyze_screen():
    """ALL_TOOLS must contain analyze_screen (10 tools total)."""
    tool_names = [t.name for t in ALL_TOOLS]
    assert "analyze_screen" in tool_names, f"analyze_screen not in ALL_TOOLS: {tool_names}"
    assert len(ALL_TOOLS) == 10, f"Expected 10 tools, got {len(ALL_TOOLS)}: {tool_names}"


# ---------------------------------------------------------------------------
# Task 2 tests: ChatSession.send() vision routing, hot-reload
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_with_image_builds_multimodal_message():
    """send(text, image=b64) builds HumanMessage with image_url content list."""
    mock_llm = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm)

    captured_messages = []

    def mock_astream(messages):
        captured_messages.extend(messages)
        return aiter_chunks([make_text_chunk("Vejo a tela.")])

    mock_llm.astream = mock_astream

    session = ChatSession(mock_llm)

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = make_settings(
                llm_provider="lmstudio",
                lm_studio_url="http://localhost:1234/v1",
                lm_studio_model="test-model",
                llm_model="test-model",
            )
            result = await session.send("O que esta na tela?", image="abc123base64")

    # Find the HumanMessage in captured messages
    human_msgs = [m for m in captured_messages if isinstance(m, HumanMessage)]
    assert len(human_msgs) >= 1

    # The HumanMessage content should be a list (multimodal)
    last_human = human_msgs[-1]
    assert isinstance(last_human.content, list), (
        f"Expected content list for multimodal, got: {type(last_human.content)}"
    )
    # Must contain image_url entry
    types = [item.get("type") for item in last_human.content]
    assert "image_url" in types, f"No image_url in content types: {types}"
    # Must contain text entry
    assert "text" in types, f"No text in content types: {types}"


@pytest.mark.asyncio
async def test_analyze_screen_tool_routes_to_vision_not_executor():
    """analyze_screen tool call does NOT go to executor; image routes to vision."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    tool_chunk = make_tool_call_chunk("analyze_screen", {}, "call_vision_01")
    final_chunks = [make_text_chunk("A tela mostra o desktop.")]

    second_call_messages = []
    call_count = 0

    def mock_astream(messages):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return aiter_chunks([tool_chunk])
        else:
            second_call_messages.extend(messages)
            return aiter_chunks(final_chunks)

    mock_llm_with_tools.astream = mock_astream

    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(return_value={"status": "success"})

    # Mock the analyze_screen tool to return an image payload
    mock_analyze_screen_tool = MagicMock()
    mock_analyze_screen_tool.name = "analyze_screen"
    mock_analyze_screen_tool.invoke = MagicMock(
        return_value={"action": "analyze_screen", "image_base64": "abc123img"}
    )

    # Mock ScreenAnalyzer to return "image" strategy
    mock_caps = MagicMock()
    mock_caps.vision = True

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=mock_executor)

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = make_settings(
                llm_provider="lmstudio",
                lm_studio_url="http://localhost:1234/v1",
                lm_studio_model="vision-model",
                llm_model="vision-model",
            )
            with patch("jarvis.core.session.asyncio.to_thread") as mock_to_thread:
                # to_thread for tool invocation returns analyze_screen result
                mock_to_thread.return_value = asyncio.coroutine(
                    lambda: {"action": "analyze_screen", "image_base64": "abc123img"}
                )()

                with patch("jarvis.core.session.ScreenAnalyzer") as MockAnalyzer:
                    mock_analyzer_instance = MagicMock()
                    mock_analyzer_instance.resolve = MagicMock(
                        return_value=("image", "abc123img", None)
                    )
                    MockAnalyzer.return_value = mock_analyzer_instance

                    with patch("jarvis.llm.capabilities.detect_capabilities") as mock_detect:
                        mock_detect.return_value = mock_caps
                        result = await session.send("O que esta na tela?")

    # executor.execute should NOT have been called for analyze_screen
    mock_executor.execute.assert_not_called()

    # Second LLM call messages should contain a HumanMessage with image_url
    human_in_second = [m for m in second_call_messages if isinstance(m, HumanMessage)]
    has_image_url = any(
        isinstance(m.content, list) and
        any(item.get("type") == "image_url" for item in m.content)
        for m in human_in_second
    )
    assert has_image_url, (
        f"Expected image_url in second call HumanMessage. "
        f"Second call msgs: {[type(m).__name__ for m in second_call_messages]}"
    )


@pytest.mark.asyncio
async def test_ocr_fallback_injects_text():
    """When ScreenAnalyzer returns 'ocr' strategy, OCR text is injected as context."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    tool_chunk = make_tool_call_chunk("analyze_screen", {}, "call_ocr_01")
    final_chunks = [make_text_chunk("O texto na tela diz...")]

    second_call_messages = []
    call_count = 0

    def mock_astream(messages):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return aiter_chunks([tool_chunk])
        else:
            second_call_messages.extend(messages)
            return aiter_chunks(final_chunks)

    mock_llm_with_tools.astream = mock_astream

    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(return_value={"status": "success"})

    mock_caps = MagicMock()
    mock_caps.vision = False

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=mock_executor)

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = make_settings(
                llm_provider="lmstudio",
                lm_studio_url="http://localhost:1234/v1",
                lm_studio_model="text-model",
                llm_model="text-model",
            )
            with patch("jarvis.core.session.asyncio.to_thread") as mock_to_thread:
                mock_to_thread.return_value = asyncio.coroutine(
                    lambda: {"action": "analyze_screen", "image_base64": "someimg"}
                )()

                with patch("jarvis.core.session.ScreenAnalyzer") as MockAnalyzer:
                    mock_analyzer_instance = MagicMock()
                    mock_analyzer_instance.resolve = MagicMock(
                        return_value=("ocr", None, "Extracted text here")
                    )
                    MockAnalyzer.return_value = mock_analyzer_instance

                    with patch("jarvis.llm.capabilities.detect_capabilities") as mock_detect:
                        mock_detect.return_value = mock_caps
                        result = await session.send("O que diz na tela?")

    # Second LLM call should have a HumanMessage with "Texto extraido da tela via OCR"
    human_in_second = [m for m in second_call_messages if isinstance(m, HumanMessage)]
    ocr_text_found = any(
        isinstance(m.content, str) and "OCR" in m.content
        for m in human_in_second
    )
    assert ocr_text_found, (
        f"Expected OCR text in second call HumanMessage. "
        f"Human messages: {[m.content for m in human_in_second]}"
    )


@pytest.mark.asyncio
async def test_hot_reload_rebuilds_llm_on_model_change():
    """Hot-reload: when Settings() returns different model, LLM is rebuilt."""
    mock_llm = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm)
    mock_llm.astream = MagicMock(return_value=aiter_chunks([make_text_chunk("Ola")]))

    session = ChatSession(mock_llm)
    session._current_model_id = "old-model"

    fresh_settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="new-model",
        llm_model="new-model",
    )

    mock_new_llm = MagicMock()
    mock_new_llm.bind_tools = MagicMock(return_value=mock_new_llm)

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = fresh_settings
            with patch("jarvis.core.session.create_llm") as mock_create_llm:
                mock_create_llm.return_value = mock_new_llm
                result = await session.send("oi")

    # create_llm should have been called with settings_override=fresh_settings
    mock_create_llm.assert_called_once()
    call_kwargs = mock_create_llm.call_args
    assert "settings_override" in call_kwargs.kwargs or len(call_kwargs.args) >= 1


@pytest.mark.asyncio
async def test_hot_reload_no_rebuild_when_same_model():
    """Hot-reload: when model is unchanged, create_llm is NOT called again."""
    mock_llm = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm)
    mock_llm.astream = MagicMock(return_value=aiter_chunks([make_text_chunk("Ola")]))

    session = ChatSession(mock_llm)

    same_settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="same-model",
        llm_model="same-model",
    )

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = same_settings
            with patch("jarvis.core.session.create_llm") as mock_create_llm:
                # First send sets _current_model_id = "same-model"
                await session.send("primeira mensagem")
                first_call_count = mock_create_llm.call_count

                # Reset astream for second call
                mock_llm.astream = MagicMock(
                    return_value=aiter_chunks([make_text_chunk("Segunda")])
                )
                MockSettings.return_value = same_settings  # Still same model

                # Second send — model unchanged, should NOT call create_llm
                await session.send("segunda mensagem")
                second_call_count = mock_create_llm.call_count

    # After first send sets the model ID, subsequent sends with same model
    # should not trigger rebuild. first_call_count captures any calls during first send.
    assert second_call_count == first_call_count, (
        f"create_llm called again even though model didn't change. "
        f"Calls after first: {first_call_count}, after second: {second_call_count}"
    )


@pytest.mark.asyncio
async def test_non_vision_send_uses_local_model_only():
    """Non-vision send() does NOT trigger cloud model creation (LLM-03)."""
    mock_llm = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm)
    mock_llm.astream = MagicMock(return_value=aiter_chunks([make_text_chunk("Resposta")]))

    session = ChatSession(mock_llm)
    session._current_model_id = "local-model"  # Already initialized

    local_settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="local-model",
        llm_model="local-model",
    )

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = local_settings
            with patch("jarvis.core.session.create_llm") as mock_create_llm:
                # Plain text send — no image, no analyze_screen
                result = await session.send("ola como vai")

    # create_llm must NOT be called for hot-reload (same model)
    # and must NOT be called to create a cloud LLM for vision
    mock_create_llm.assert_not_called()
    assert result == "Resposta"


@pytest.mark.asyncio
async def test_tool_invocation_uses_asyncio_to_thread():
    """Tool invocation in the tool-call loop uses asyncio.to_thread (ARCH-02)."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    tool_chunk = make_tool_call_chunk("list_files", {"directory": "/tmp"}, "call_async_01")
    final_chunks = [make_text_chunk("Arquivos listados.")]

    call_count = 0

    def mock_astream(messages):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return aiter_chunks([tool_chunk])
        else:
            return aiter_chunks(final_chunks)

    mock_llm_with_tools.astream = mock_astream

    mock_executor = MagicMock()
    mock_executor.execute = AsyncMock(return_value={"status": "success", "files": []})

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=mock_executor)

    to_thread_called = []

    async def fake_to_thread(func, *args, **kwargs):
        to_thread_called.append(func)
        # Call the function synchronously for the test
        return func(*args, **kwargs)

    with patch("builtins.print"):
        with patch("jarvis.core.session.Settings") as MockSettings:
            MockSettings.return_value = make_settings(
                llm_provider="lmstudio",
                lm_studio_url="http://localhost:1234/v1",
                lm_studio_model="local-model",
                llm_model="local-model",
            )
            with patch("jarvis.core.session.asyncio.to_thread", side_effect=fake_to_thread):
                result = await session.send("lista os arquivos de /tmp")

    # asyncio.to_thread should have been called during tool invocation
    assert len(to_thread_called) > 0, "asyncio.to_thread was not called for tool invocation"
