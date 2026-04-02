"""Tests for LLM-01: Multi-provider LLM factory.

These tests verify that create_llm() returns the correct BaseChatModel subclass
for each provider, and that provider switching via config works correctly.
"""

import pytest
from unittest.mock import patch

from jarvis.config import Settings
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic


def make_settings(**kwargs) -> Settings:
    """Create a Settings instance bypassing validation (for testing)."""
    return Settings.model_construct(**kwargs)


def test_create_llm_lmstudio() -> None:
    """Factory returns ChatOpenAI configured for LM Studio when provider=lmstudio."""
    from jarvis.llm.factory import create_llm

    settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="test-model",
        llm_model="",
    )

    with patch("jarvis.llm.factory.settings", settings):
        llm = create_llm()

    assert isinstance(llm, ChatOpenAI)
    assert "localhost:1234" in str(llm.openai_api_base)


def test_create_llm_openai() -> None:
    """Factory returns ChatOpenAI for OpenAI cloud when provider=openai."""
    from jarvis.llm.factory import create_llm

    settings = make_settings(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        openai_api_key="sk-test-key",
    )

    with patch("jarvis.llm.factory.settings", settings):
        llm = create_llm()

    assert isinstance(llm, ChatOpenAI)


def test_create_llm_anthropic() -> None:
    """Factory returns ChatAnthropic when provider=anthropic."""
    from jarvis.llm.factory import create_llm

    settings = make_settings(
        llm_provider="anthropic",
        llm_model="claude-3-5-haiku-20241022",
        anthropic_api_key="sk-ant-test",
    )

    with patch("jarvis.llm.factory.settings", settings):
        llm = create_llm()

    assert isinstance(llm, ChatAnthropic)


def test_provider_switch() -> None:
    """Changing LLM_PROVIDER env var causes create_llm() to return a different class."""
    from jarvis.llm.factory import create_llm

    lmstudio_settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="",
        llm_model="",
    )
    anthropic_settings = make_settings(
        llm_provider="anthropic",
        anthropic_api_key="sk-ant-test",
        llm_model="",
    )

    with patch("jarvis.llm.factory.settings", lmstudio_settings):
        lm_llm = create_llm()

    with patch("jarvis.llm.factory.settings", anthropic_settings):
        ant_llm = create_llm()

    # Both are BaseChatModel but different classes
    assert type(lm_llm) is not type(ant_llm)


def test_unknown_provider_raises() -> None:
    """Unknown provider value raises ValueError with descriptive message."""
    from jarvis.llm.factory import create_llm

    # Bypass pydantic validation to test factory error handling directly
    settings = make_settings(llm_provider="invalid")

    with patch("jarvis.llm.factory.settings", settings):
        with pytest.raises(ValueError, match="invalid"):
            create_llm()


def test_lmstudio_api_key_set() -> None:
    """LM Studio provider always sets api_key to 'lm-studio'."""
    from jarvis.llm.factory import create_llm

    settings = make_settings(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="",
        llm_model="",
    )

    with patch("jarvis.llm.factory.settings", settings):
        llm = create_llm()

    assert isinstance(llm, ChatOpenAI)
    # openai_api_key is a SecretStr — compare its value
    assert llm.openai_api_key.get_secret_value() == "lm-studio"


def test_streaming_enabled() -> None:
    """All providers return a model with streaming=True."""
    from jarvis.llm.factory import create_llm

    for provider, extra in [
        ("lmstudio", {"lm_studio_url": "http://localhost:1234/v1", "lm_studio_model": "", "llm_model": ""}),
        ("openai", {"llm_model": "gpt-4o-mini", "openai_api_key": "sk-test"}),
        ("anthropic", {"llm_model": "claude-3-5-haiku-20241022", "anthropic_api_key": "sk-ant-test"}),
    ]:
        s = make_settings(llm_provider=provider, **extra)
        with patch("jarvis.llm.factory.settings", s):
            llm = create_llm()
        assert llm.streaming is True, f"streaming not enabled for {provider}"
