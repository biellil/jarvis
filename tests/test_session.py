"""Test stubs for CONV-01: Conversational session with message history.

These tests verify that ChatSession correctly accumulates message history,
starts with a SystemMessage, and pairs HumanMessage/AIMessage on each turn.
"""

import pytest


@pytest.mark.xfail(reason="Not implemented yet — ChatSession not created (plan 01-03)")
def test_send_message() -> None:
    """session.send() appends HumanMessage and AIMessage to the conversation history."""
    from unittest.mock import AsyncMock, MagicMock

    from langchain_core.messages import AIMessage, HumanMessage

    from jarvis.core.session import ChatSession

    mock_llm = MagicMock()
    mock_llm.astream = AsyncMock(return_value=iter([AIMessage(content="Hello!")]))
    session = ChatSession(llm=mock_llm)

    import asyncio
    asyncio.get_event_loop().run_until_complete(session.send("Hi JARVIS"))

    human_msgs = [m for m in session.history if isinstance(m, HumanMessage)]
    ai_msgs = [m for m in session.history if isinstance(m, AIMessage)]

    assert len(human_msgs) == 1
    assert len(ai_msgs) == 1
    assert human_msgs[0].content == "Hi JARVIS"


@pytest.mark.xfail(reason="Not implemented yet — ChatSession not created (plan 01-03)")
def test_history_accumulates() -> None:
    """Multiple sends grow history correctly — each turn adds 2 messages."""
    from unittest.mock import AsyncMock, MagicMock

    from langchain_core.messages import AIMessage, HumanMessage

    from jarvis.core.session import ChatSession

    mock_llm = MagicMock()
    mock_llm.astream = AsyncMock(return_value=iter([AIMessage(content="Response")]))
    session = ChatSession(llm=mock_llm)

    import asyncio
    loop = asyncio.get_event_loop()
    loop.run_until_complete(session.send("Message 1"))
    loop.run_until_complete(session.send("Message 2"))

    human_msgs = [m for m in session.history if isinstance(m, HumanMessage)]
    ai_msgs = [m for m in session.history if isinstance(m, AIMessage)]

    assert len(human_msgs) == 2
    assert len(ai_msgs) == 2


@pytest.mark.xfail(reason="Not implemented yet — ChatSession not created (plan 01-03)")
def test_system_prompt_present() -> None:
    """History starts with a SystemMessage containing the assistant persona."""
    from unittest.mock import MagicMock

    from langchain_core.messages import SystemMessage

    from jarvis.core.session import ChatSession

    mock_llm = MagicMock()
    session = ChatSession(llm=mock_llm)

    assert len(session.history) >= 1
    assert isinstance(session.history[0], SystemMessage)
    assert len(session.history[0].content) > 0
