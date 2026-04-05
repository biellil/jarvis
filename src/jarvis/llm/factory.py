"""LLM factory — single entry point for creating any supported LLM.

Usage:
    from jarvis.llm import create_llm
    llm = create_llm()  # Uses settings.llm_provider

The returned BaseChatModel is provider-agnostic — callers never import
ChatOpenAI or ChatAnthropic directly; they use the abstract interface.

Per CLAUDE.md constraints:
- Always import from langchain_openai / langchain_anthropic (NOT langchain_community)
- LM Studio always uses api_key="lm-studio" (Pitfall 3)
- All providers use streaming=True (Pitfall 6)
- base_url always read from settings, never hardcoded (D-09)
"""

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

from jarvis.config import settings


def create_llm(settings_override=None) -> BaseChatModel:
    """Create and return the configured LLM as a BaseChatModel.

    Reads llm_provider from settings to select the backend:
    - "lmstudio": ChatOpenAI pointed at local LM Studio server
    - "openai":   ChatOpenAI pointing at OpenAI cloud
    - "anthropic": ChatAnthropic pointing at Anthropic cloud

    Args:
        settings_override: Optional Settings instance to use instead of the
            module-level singleton. Used by ChatSession for hot-reload (LLM-04)
            when the model config changes between send() calls. Backward
            compatible: existing callers pass no args and get global singleton.

    Returns:
        BaseChatModel instance with streaming=True.

    Raises:
        ValueError: If settings.llm_provider is not a recognized value.
    """
    s = settings_override or settings

    provider = s.llm_provider

    if provider == "lmstudio":
        return ChatOpenAI(
            base_url=s.lm_studio_url,
            api_key="lm-studio",
            model=s.lm_studio_model or s.llm_model,
            streaming=True,
        )
    elif provider == "openai":
        return ChatOpenAI(
            api_key=s.openai_api_key,
            model=s.llm_model or "gpt-4o-mini",
            streaming=True,
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            api_key=s.anthropic_api_key,
            model=s.llm_model or "claude-3-5-haiku-20241022",
            streaming=True,
        )
    else:
        raise ValueError(f"Unknown provider: {provider!r}. Valid: lmstudio, openai, anthropic")
