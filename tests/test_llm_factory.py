"""Test stubs for LLM-01: Multi-provider LLM factory.

These tests verify that create_llm() returns the correct BaseChatModel subclass
for each provider, and that provider switching via config works correctly.
"""

import pytest


@pytest.mark.xfail(reason="Not implemented yet — LLMFactory not created (plan 01-02)")
def test_create_llm_lmstudio() -> None:
    """Factory returns ChatOpenAI configured for LM Studio when provider=lmstudio."""
    from jarvis.llm.factory import create_llm
    from langchain_openai import ChatOpenAI

    from jarvis.config import Settings
    settings = Settings.model_construct(
        llm_provider="lmstudio",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="test-model",
    )

    llm = create_llm(settings=settings)

    assert isinstance(llm, ChatOpenAI)
    assert "localhost:1234" in str(llm.openai_api_base)


@pytest.mark.xfail(reason="Not implemented yet — LLMFactory not created (plan 01-02)")
def test_create_llm_openai() -> None:
    """Factory returns ChatOpenAI for OpenAI cloud when provider=openai."""
    from jarvis.llm.factory import create_llm
    from langchain_openai import ChatOpenAI

    from jarvis.config import Settings
    settings = Settings.model_construct(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        openai_api_key="sk-test-key",
    )

    llm = create_llm(settings=settings)

    assert isinstance(llm, ChatOpenAI)


@pytest.mark.xfail(reason="Not implemented yet — LLMFactory not created (plan 01-02)")
def test_create_llm_anthropic() -> None:
    """Factory returns ChatAnthropic when provider=anthropic."""
    from jarvis.llm.factory import create_llm
    from langchain_anthropic import ChatAnthropic

    from jarvis.config import Settings
    settings = Settings.model_construct(
        llm_provider="anthropic",
        llm_model="claude-3-5-haiku-20241022",
        anthropic_api_key="sk-ant-test",
    )

    llm = create_llm(settings=settings)

    assert isinstance(llm, ChatAnthropic)


@pytest.mark.xfail(reason="Not implemented yet — LLMFactory not created (plan 01-02)")
def test_provider_switch() -> None:
    """Changing LLM_PROVIDER env var causes create_llm() to return a different class."""
    from jarvis.llm.factory import create_llm
    from langchain_openai import ChatOpenAI
    from langchain_anthropic import ChatAnthropic

    from jarvis.config import Settings
    lmstudio_settings = Settings.model_construct(llm_provider="lmstudio", lm_studio_url="http://localhost:1234/v1")
    anthropic_settings = Settings.model_construct(llm_provider="anthropic", anthropic_api_key="sk-ant-test")

    lm_llm = create_llm(settings=lmstudio_settings)
    ant_llm = create_llm(settings=anthropic_settings)

    # Both are BaseChatModel but different classes
    assert type(lm_llm) is not type(ant_llm)


@pytest.mark.xfail(reason="Not implemented yet — LLMFactory not created (plan 01-02)")
def test_unknown_provider_raises() -> None:
    """Unknown provider value raises ValueError with descriptive message."""
    from jarvis.llm.factory import create_llm
    from jarvis.config import Settings

    # Bypass pydantic validation to test factory error handling directly
    settings = Settings.model_construct(llm_provider="unknown_provider")

    with pytest.raises(ValueError, match="Unknown provider"):
        create_llm(settings=settings)
