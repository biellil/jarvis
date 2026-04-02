"""Shared test fixtures for the JARVIS test suite."""

import pytest

from jarvis.config import Settings


@pytest.fixture
def mock_settings() -> Settings:
    """Return a Settings instance with known test values, bypassing validation and .env."""
    return Settings.model_construct(
        llm_provider="lmstudio",
        llm_model="",
        lm_studio_url="http://localhost:1234/v1",
        lm_studio_model="test-model",
        openai_api_key="",
        anthropic_api_key="",
    )


@pytest.fixture
def mock_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set environment variables for LM Studio provider in tests."""
    monkeypatch.setenv("LLM_PROVIDER", "lmstudio")
    monkeypatch.setenv("LM_STUDIO_URL", "http://localhost:1234/v1")
    monkeypatch.setenv("LM_STUDIO_MODEL", "test-model")
