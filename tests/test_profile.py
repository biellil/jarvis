"""Tests for MEM-03: User profile extraction module.

These tests verify that:
- is_explicit_profile_command detects Portuguese and English trigger phrases
- extract_profile_facts uses LLM to extract key/value pairs from user messages
- Code fence stripping handles ```json wrapped responses
- All error paths return empty dict and log warning, never raise
"""

import pytest
from unittest.mock import AsyncMock
from langchain_core.messages import AIMessage


# ---------------------------------------------------------------------------
# is_explicit_profile_command tests
# ---------------------------------------------------------------------------


def test_explicit_lembra_que() -> None:
    """'lembra que eu uso vim' returns True."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("lembra que eu uso vim") is True


def test_explicit_lembre_que() -> None:
    """'lembre que prefiro dark mode' returns True."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("lembre que prefiro dark mode") is True


def test_explicit_minha_preferencia() -> None:
    """'minha preferencia e Python' returns True."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("minha preferencia e Python") is True


def test_explicit_eu_prefiro() -> None:
    """'eu prefiro cafe' returns True."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("eu prefiro cafe") is True


def test_explicit_meu_nome() -> None:
    """'meu nome e Gabriel' returns True."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("meu nome e Gabriel") is True


def test_explicit_remember_that_english() -> None:
    """'remember that I use Linux' returns True."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("remember that I use Linux") is True


def test_not_explicit_weather_question() -> None:
    """'qual a previsao do tempo?' returns False."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("qual a previsao do tempo?") is False


def test_not_explicit_general_question() -> None:
    """'como funciona um motor?' returns False."""
    from jarvis.memory.profile import is_explicit_profile_command

    assert is_explicit_profile_command("como funciona um motor?") is False


# ---------------------------------------------------------------------------
# extract_profile_facts tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_profile_facts_returns_dict() -> None:
    """extract_profile_facts with mock LLM returning JSON returns parsed dict."""
    from jarvis.memory.profile import extract_profile_facts

    mock_llm = AsyncMock()
    mock_llm.ainvoke.return_value = AIMessage(content='{"editor": "vim"}')

    result = await extract_profile_facts(mock_llm, "eu uso vim para editar código")
    assert result == {"editor": "vim"}


@pytest.mark.asyncio
async def test_extract_profile_facts_empty_json() -> None:
    """extract_profile_facts with mock LLM returning '{}' returns empty dict."""
    from jarvis.memory.profile import extract_profile_facts

    mock_llm = AsyncMock()
    mock_llm.ainvoke.return_value = AIMessage(content="{}")

    result = await extract_profile_facts(mock_llm, "bom dia, tudo bem?")
    assert result == {}


@pytest.mark.asyncio
async def test_extract_profile_facts_code_fence_stripping() -> None:
    """extract_profile_facts strips ```json code fences from LLM response."""
    from jarvis.memory.profile import extract_profile_facts

    mock_llm = AsyncMock()
    mock_llm.ainvoke.return_value = AIMessage(content='```json\n{"k": "v"}\n```')

    result = await extract_profile_facts(mock_llm, "test message")
    assert result == {"k": "v"}


@pytest.mark.asyncio
async def test_extract_profile_facts_llm_exception_returns_empty() -> None:
    """extract_profile_facts returns {} when LLM raises Exception."""
    from jarvis.memory.profile import extract_profile_facts

    mock_llm = AsyncMock()
    mock_llm.ainvoke.side_effect = Exception("LLM unavailable")

    result = await extract_profile_facts(mock_llm, "test message")
    assert result == {}
