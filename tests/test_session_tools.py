"""Integration tests for ChatSession tool-calling loop (Phase 4, Plan 03).

Tests cover:
1. Backward compatibility — no tools behaves like Phase 2
2. Text-only with tools — normal response when LLM doesn't call tools
3. Full tool-call flow — invoke -> execute -> ToolMessage -> second LLM call
4. Second LLM call receives ToolMessage in history
5. Cancelled destructive tool — executor returns 'cancelled'
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessageChunk, ToolMessage, AIMessage, HumanMessage

from jarvis.core.session import ChatSession
from jarvis.tools import ALL_TOOLS
from jarvis.tools.apps import open_app
from jarvis.executor.base import ActionExecutor
from jarvis.memory.store import ToolLogger


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_text_chunk(content: str) -> AIMessageChunk:
    """Create an AIMessageChunk with plain text content (no tool calls)."""
    return AIMessageChunk(content=content)


def make_tool_call_chunk(tool_name: str, args: dict, call_id: str = "call_abc123") -> AIMessageChunk:
    """Create an AIMessageChunk that represents a complete tool call.

    LangChain accumulates chunks — we create a single chunk that already has
    tool_calls populated (simulating a fully-accumulated response).
    """
    chunk = AIMessageChunk(
        content="",
        tool_calls=[{"name": tool_name, "args": args, "id": call_id, "type": "tool_call"}],
    )
    return chunk


async def _aiter_chunks(chunks):
    """Async generator that yields from a list of chunks."""
    for chunk in chunks:
        yield chunk


# ---------------------------------------------------------------------------
# Test 1: Backward compatibility — no tools param
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_tools_backward_compatible():
    """ChatSession without tools streams normally — same behavior as Phase 2."""
    mock_llm = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm)
    text_chunks = [make_text_chunk("Ola"), make_text_chunk(" mundo")]
    mock_llm.astream = MagicMock(return_value=_aiter_chunks(text_chunks))

    session = ChatSession(mock_llm)  # No tools param

    with patch("builtins.print"):
        result = await session.send("oi")

    assert result == "Ola mundo"
    # History: SystemMessage + HumanMessage + AIMessage
    assert len(session.history) == 3
    assert isinstance(session.history[-1], AIMessage)
    assert session.history[-1].content == "Ola mundo"
    # bind_tools should NOT have been called (no tools)
    mock_llm.bind_tools.assert_not_called()


# ---------------------------------------------------------------------------
# Test 2: Text-only response with tools bound — no tool calls
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_text_only_with_tools_bound():
    """LLM with tools bound but returns plain text — no tool invocation path."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    text_chunks = [make_text_chunk("Isso "), make_text_chunk("e texto")]
    mock_llm_with_tools.astream = MagicMock(return_value=_aiter_chunks(text_chunks))

    mock_tool_logger = MagicMock(spec=ToolLogger)
    mock_executor = MagicMock(spec=ActionExecutor)
    mock_executor.execute = AsyncMock(return_value={"status": "success"})

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=mock_executor)

    with patch("builtins.print"):
        result = await session.send("me diga algo")

    assert result == "Isso e texto"
    # Executor should NOT have been called (no tool call in response)
    mock_executor.execute.assert_not_called()
    # History: SystemMessage + HumanMessage + AIMessage
    assert len(session.history) == 3
    assert isinstance(session.history[-1], AIMessage)
    assert session.history[-1].content == "Isso e texto"


# ---------------------------------------------------------------------------
# Test 3: Full tool-call flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tool_call_flow_executor_called():
    """LLM requests open_app tool — executor.execute is called and ToolMessage added."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    # First stream: tool call chunk (no text)
    tool_chunk = make_tool_call_chunk("open_app", {"app_name": "firefox"}, "call_001")
    # Second stream: final LLM response
    final_chunks = [make_text_chunk("Firefox "), make_text_chunk("aberto.")]

    call_count = 0

    async def mock_astream(messages):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # First call — return tool call
            async def _iter():
                yield tool_chunk
            return _iter()
        else:
            # Second call — return final text
            return _aiter_chunks(final_chunks)

    mock_llm_with_tools.astream = mock_astream

    mock_executor = MagicMock(spec=ActionExecutor)
    mock_executor.execute = AsyncMock(return_value={"status": "success", "pid": 1234})

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=mock_executor)

    with patch("builtins.print"):
        result = await session.send("abra o firefox")

    # Executor must have been called once for open_app
    mock_executor.execute.assert_called_once()
    call_args = mock_executor.execute.call_args
    assert call_args[0][0] == "open_app"  # tool_name
    assert "app_name" in call_args[0][2]  # params has app_name

    # Final response is the second LLM call text
    assert result == "Firefox aberto."


# ---------------------------------------------------------------------------
# Test 4: Second LLM call receives ToolMessage in history
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_second_llm_call_receives_tool_message():
    """After tool call, second LLM astream call has ToolMessage in its messages arg."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    tool_chunk = make_tool_call_chunk("open_app", {"app_name": "code"}, "call_002")
    final_chunks = [make_text_chunk("VS Code aberto.")]

    received_messages_second_call = []
    call_count = 0

    async def mock_astream(messages):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            async def _iter():
                yield tool_chunk
            return _iter()
        else:
            # Capture messages passed to second call
            received_messages_second_call.extend(messages)
            return _aiter_chunks(final_chunks)

    mock_llm_with_tools.astream = mock_astream

    mock_executor = MagicMock(spec=ActionExecutor)
    mock_executor.execute = AsyncMock(return_value={"status": "success"})

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=mock_executor)

    with patch("builtins.print"):
        await session.send("abra o vscode")

    # Second call must have received messages including a ToolMessage
    tool_messages = [m for m in received_messages_second_call if isinstance(m, ToolMessage)]
    assert len(tool_messages) == 1
    assert tool_messages[0].name == "open_app"
    assert tool_messages[0].tool_call_id == "call_002"


# ---------------------------------------------------------------------------
# Test 5: Cancelled tool — confirm_callback denies
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancelled_tool_returns_cancelled_status():
    """Destructive tool with denied confirmation returns 'cancelled' in ToolMessage."""
    mock_llm = MagicMock()
    mock_llm_with_tools = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)

    # delete_file is destructive — triggers confirmation
    tool_chunk = make_tool_call_chunk("delete_file", {"path": "/tmp/test.txt"}, "call_003")
    final_chunks = [make_text_chunk("Acao cancelada.")]

    call_count = 0

    async def mock_astream(messages):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            async def _iter():
                yield tool_chunk
            return _iter()
        else:
            return _aiter_chunks(final_chunks)

    mock_llm_with_tools.astream = mock_astream

    # Confirmation callback that always denies
    async def deny_callback(tool_name, params):
        return False

    mock_tool_logger = MagicMock(spec=ToolLogger)
    mock_tool_logger.log = MagicMock()

    executor = ActionExecutor(mock_tool_logger, confirm_callback=deny_callback)

    session = ChatSession(mock_llm, tools=ALL_TOOLS, executor=executor)

    with patch("builtins.print"):
        await session.send("delete /tmp/test.txt")

    # History should contain a ToolMessage with 'cancelled' status
    tool_messages = [m for m in session.history if isinstance(m, ToolMessage)]
    assert len(tool_messages) == 1
    tool_result = json.loads(tool_messages[0].content)
    assert tool_result["status"] == "cancelled"
