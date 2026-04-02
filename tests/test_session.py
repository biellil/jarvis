"""Tests for CONV-01: Conversational session with message history.

These tests verify that ChatSession correctly accumulates message history,
starts with a SystemMessage, and pairs HumanMessage/AIMessage on each turn.
"""

import asyncio
import pytest
from unittest.mock import MagicMock


def make_mock_llm(response: str = "Hello!"):
    """Create a mock LLM that yields a single AIMessage chunk via astream."""
    from langchain_core.messages import AIMessage

    async def fake_astream(messages):
        yield AIMessage(content=response)

    mock_llm = MagicMock()
    mock_llm.astream = fake_astream
    return mock_llm


def test_send_message() -> None:
    """session.send() appends HumanMessage and AIMessage to the conversation history."""
    from langchain_core.messages import AIMessage, HumanMessage
    from jarvis.core.session import ChatSession

    mock_llm = make_mock_llm("Hello!")
    session = ChatSession(llm=mock_llm)

    asyncio.run(session.send("Hi JARVIS"))

    human_msgs = [m for m in session.history if isinstance(m, HumanMessage)]
    ai_msgs = [m for m in session.history if isinstance(m, AIMessage)]

    assert len(human_msgs) == 1
    assert len(ai_msgs) == 1
    assert human_msgs[0].content == "Hi JARVIS"
    # Total: SystemMessage + HumanMessage + AIMessage = 3
    assert len(session.history) == 3


def test_history_accumulates() -> None:
    """Multiple sends grow history correctly — each turn adds 2 messages."""
    from langchain_core.messages import AIMessage, HumanMessage
    from jarvis.core.session import ChatSession

    mock_llm = make_mock_llm("Response")
    session = ChatSession(llm=mock_llm)

    async def run_two_sends():
        await session.send("Message 1")
        await session.send("Message 2")

    asyncio.run(run_two_sends())

    human_msgs = [m for m in session.history if isinstance(m, HumanMessage)]
    ai_msgs = [m for m in session.history if isinstance(m, AIMessage)]

    assert len(human_msgs) == 2
    assert len(ai_msgs) == 2
    # Total: SystemMessage + 2*(HumanMessage + AIMessage) = 5
    assert len(session.history) == 5


def test_system_prompt_present() -> None:
    """History starts with a SystemMessage containing the assistant persona."""
    from langchain_core.messages import SystemMessage
    from jarvis.core.session import ChatSession

    mock_llm = MagicMock()
    session = ChatSession(llm=mock_llm)

    assert len(session.history) >= 1
    assert isinstance(session.history[0], SystemMessage)
    assert "JARVIS" in session.history[0].content
    assert len(session.history[0].content) > 0
