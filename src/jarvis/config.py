"""JARVIS configuration — single source of truth for all settings.

Uses pydantic-settings BaseSettings to load from .env file with type validation.
Import `settings` singleton everywhere; never read os.environ directly.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Provider selection (per D-07)
    llm_provider: str = Field(default="lmstudio", pattern="^(lmstudio|openai|anthropic)$")
    llm_model: str = Field(default="")

    # LM Studio (per D-09)
    lm_studio_url: str = Field(default="http://localhost:1234/v1")
    lm_studio_model: str = Field(default="")

    # Cloud providers (per D-08)
    openai_api_key: str = Field(default="")
    anthropic_api_key: str = Field(default="")

    # Memory paths (per MEM-01, MEM-03)
    sqlite_path: str = Field(default="data/jarvis.db")
    chroma_path: str = Field(default="data/chroma")


# Singleton — import this everywhere
settings = Settings()
