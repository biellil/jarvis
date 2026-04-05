# Phase 1: Foundation - Research

**Researched:** 2026-04-02
**Domain:** Python CLI application, multi-LLM abstraction, pydantic config, LangChain/LangGraph agent loop
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interface CLI**
- D-01: Prompt de entrada estilizado com Rich — cor e formatação no prompt do usuário.
- D-02: Respostas do JARVIS em streaming token a token via `print(token, end='', flush=True)` — sem Rich no output de resposta (compatibilidade máxima com todos providers).
- D-03: Rich usado **apenas** no prompt de entrada e em mensagens de sistema (banner, status, erros) — nunca no stream de tokens.
- D-04: Saída da sessão por `Ctrl+C` ou digitando `exit` / `quit`.
- D-05: Sem suporte a input multi-linha na Fase 1 — linha única por mensagem.

**Config de Providers**
- D-06: Formato `.env` + `python-dotenv`. Arquivo `.env` para segredos/config, `.env.example` commitado no repo como template.
- D-07: Provider selecionado via `LLM_PROVIDER=lmstudio|openai|anthropic` e modelo via `LLM_MODEL=nome-do-modelo` no `.env`.
- D-08: API keys no `.env`: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. `.env` no `.gitignore`.
- D-09: LM Studio configurável via `LM_STUDIO_URL` (default `http://localhost:1234/v1`) e `LM_STUDIO_MODEL`.

**Estrutura de Projeto**
- D-10: Layout `src/jarvis/` com sub-pacotes conforme estrutura definida.
- D-11: Entry point via `python -m jarvis`. Instalável como `jarvis` command via `pyproject.toml`.
- D-12: Abstração multi-LLM em `src/jarvis/llm/` com `factory.py`, `providers.py`, `capabilities.py`.
- D-13: Código OS-específico em `src/jarvis/platform/` com `base.py`, `linux.py`, `windows.py`, `macos.py`. Nunca `if sys.platform` espalhado pelo código principal.

**Comportamento de Startup**
- D-14: Banner ASCII simples + bloco de status mostrando provider ativo, modelo, capabilities detectadas.
- D-15: Erros de startup: mensagem clara em português com ação corretiva + `exit(1)`. Sem stack traces para o usuário.
- D-16: Detecção de capabilities via `/v1/models` + heurística por nome do modelo. Sem probe real (sem chamada de teste ao LLM no startup).

### Claude's Discretion
- Implementação interna da `LLMFactory` (padrão strategy, factory method, etc.)
- Formato exato do banner ASCII
- Estrutura interna de `ChatSession` / loop principal
- Handling de reconexão automática ao LM Studio
- Logging interno (loguru vs stdlib logging)

### Deferred Ideas (OUT OF SCOPE)
Nenhuma ideia fora de escopo surgiu durante a discussão.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | Usuário pode conversar com o JARVIS via texto no terminal (CLI loop) | Rich prompt + streaming astream pattern documented |
| LLM-01 | Usuário pode configurar qual LLM usar (LM Studio local, Claude, OpenAI) via arquivo de config | pydantic-settings BaseSettings + .env pattern documented; LLMFactory pattern documented |
| LLM-02 | JARVIS detecta automaticamente as capabilities do modelo ativo (tool calling, vision, context window) | /v1/models endpoint + name-heuristic pattern documented |
| ARCH-01 | JARVIS roda em Linux, Windows e macOS — código OS-específico isolado em módulo de plataforma | Platform module pattern with ABC documented |
| ARCH-03 | Dependências críticas de segurança pinadas: langchain-core>=1.2.22, langgraph-checkpoint-sqlite>=3.0.1 | Both verified: langchain-core 1.2.24, langgraph-checkpoint-sqlite 3.0.3 (both satisfy pins) |
| ARCH-04 | JARVIS valida versões e capabilities na inicialização e falha com mensagem clara se algo estiver errado | importlib.metadata version check + httpx LM Studio reachability pattern documented |
</phase_requirements>

---

## Summary

Phase 1 is a greenfield Python project that establishes the complete foundation: project packaging, config layer, multi-LLM factory, streaming conversation loop, startup validation, and a cross-platform module skeleton. All of these are well-understood patterns with mature libraries — no experimental territory.

The critical architectural decision already made in CONTEXT.md is using `pydantic-settings` (`BaseSettings`) for typed configuration management, `langchain-openai` for both LM Studio and OpenAI cloud (same import path, swap via `base_url`), and `langchain-anthropic` for Claude. Streaming is done at the chat model level (`llm.astream()`) rather than through a LangGraph agent graph — this is the correct approach for Phase 1 since there are no tools yet. The distinction matters: LangGraph `create_react_agent` + `astream(stream_mode="messages")` has known issues with token-by-token streaming when tools are present, but direct `ChatModel.astream()` works cleanly for Phase 1's pure-chat loop.

The ARCH-03 version pins (`langchain-core>=1.2.22`, `langgraph-checkpoint-sqlite>=3.0.1`) are already satisfied by current PyPI releases (1.2.24 and 3.0.3 respectively). Python 3.12.3 is confirmed available on the target machine, which meets the 3.10+ minimum and is the preferred version per CLAUDE.md.

**Primary recommendation:** Build the conversation loop around direct `ChatModel.astream()` (not LangGraph graph streaming) for Phase 1. Wire `LLMFactory` as a simple factory function returning a `BaseChatModel`. Use `pydantic-settings` with `SettingsConfigDict(env_file=".env")` for all config. Use `importlib.metadata` for version validation at startup.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.12.3 | Runtime | Available on machine; 3.10+ required by langchain 1.x; 3.12 preferred per CLAUDE.md |
| langchain | 1.2.14 | Agent framework, tool abstraction | Stable 1.0 API; required by D-12 factory pattern |
| langgraph | 1.1.4 | Stateful agent runtime for future phases | Install now to avoid version conflicts when Phase 2 adds memory nodes |
| langchain-openai | 1.1.12 | ChatOpenAI for LM Studio + OpenAI cloud | Same class, swap via `base_url` — the exact pattern CLAUDE.md mandates |
| langchain-anthropic | 1.4.0 | ChatAnthropic for Claude | Same abstraction layer; langchain-anthropic 1.x matches langchain 1.x |
| langchain-core | 1.2.24 | Base classes, BaseChatModel, streaming | Satisfies ARCH-03 pin (>=1.2.22); pulled as dependency |
| pydantic | 2.12.5 | Data validation, Settings base | LangChain 1.x requires Pydantic v2; CLAUDE.md mandates it |
| pydantic-settings | 2.13.1 | BaseSettings with .env file support | pydantic v2 split Settings into separate package; required for D-06/D-07 |
| python-dotenv | 1.2.2 | .env file loading | pydantic-settings uses it internally; also useful standalone |
| rich | 14.3.3 | Terminal UI — prompt, banner, errors | D-01/D-03: Rich for prompt and system messages only |
| loguru | 0.7.3 | Structured logging | CLAUDE.md recommends over stdlib logging |
| httpx | 0.28.1 | HTTP client for LM Studio reachability check | Used by openai SDK internally; direct use for startup ping |

### Supporting (Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| langgraph-checkpoint-sqlite | 3.0.3 | SQLite checkpointer for conversation state | Install now to satisfy ARCH-03 pin; Phase 2 activates it |
| pytest | 9.0.2 | Test framework | All unit tests |
| pytest-asyncio | 1.3.0 | Async test support | LangGraph nodes and astream are async |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pydantic-settings | raw os.environ | pydantic-settings adds type validation, defaults, and .env loading in one place |
| loguru | stdlib logging | loguru zero-config, colored output, file rotation; stdlib requires boilerplate setup |
| direct `ChatModel.astream()` | LangGraph `create_react_agent` + graph streaming | React agent streaming has known issues with tools in 1.1.x; direct astream is simpler and correct for Phase 1 (no tools) |

**Installation:**
```bash
pip install langchain==1.2.14 langgraph==1.1.4 langchain-openai==1.1.12 langchain-anthropic==1.4.0 \
    langchain-core==1.2.24 langgraph-checkpoint-sqlite==3.0.3 \
    pydantic==2.12.5 pydantic-settings==2.13.1 python-dotenv==1.2.2 \
    rich==14.3.3 loguru==0.7.3 httpx==0.28.1 \
    pytest==9.0.2 pytest-asyncio==1.3.0
```

**Version verification (confirmed 2026-04-02 against PyPI):**
- langchain: 1.2.14
- langgraph: 1.1.4
- langchain-openai: 1.1.12
- langchain-anthropic: 1.4.0
- langchain-core: 1.2.24 (satisfies ARCH-03 pin >=1.2.22)
- langgraph-checkpoint-sqlite: 3.0.3 (satisfies ARCH-03 pin >=3.0.1)
- pydantic: 2.12.5
- pydantic-settings: 2.13.1
- python-dotenv: 1.2.2
- rich: 14.3.3
- loguru: 0.7.3
- httpx: 0.28.1
- pytest: 9.0.2
- pytest-asyncio: 1.3.0

---

## Architecture Patterns

### Recommended Project Structure

```
src/
  jarvis/
    __init__.py
    __main__.py          # python -m jarvis entry point
    config.py            # pydantic BaseSettings — single source of truth
    core/
      __init__.py
      session.py         # ChatSession: conversation loop, history, streaming
    llm/
      __init__.py
      factory.py         # create_llm() -> BaseChatModel
      providers.py       # LMStudioProvider, OpenAIProvider, AnthropicProvider
      capabilities.py    # CapabilityDetector, ModelCapabilities dataclass
    platform/
      __init__.py        # get_platform() factory
      base.py            # AbstractPlatform ABC
      linux.py           # LinuxPlatform(AbstractPlatform)
      windows.py         # WindowsPlatform(AbstractPlatform)
      macos.py           # MacOSPlatform(AbstractPlatform)
tests/
  __init__.py
  test_config.py
  test_llm_factory.py
  test_capabilities.py
  test_session.py
.env.example
.env               # gitignored
pyproject.toml
```

### Pattern 1: pydantic-settings BaseSettings

**What:** Single `Settings` class reads all configuration from `.env` with type validation.
**When to use:** Always — all config (keys, URLs, provider selection) goes through this class.

```python
# src/jarvis/config.py
# Source: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Provider selection
    llm_provider: str = Field(default="lmstudio", pattern="^(lmstudio|openai|anthropic)$")
    llm_model: str = Field(default="")

    # LM Studio
    lm_studio_url: str = Field(default="http://localhost:1234/v1")
    lm_studio_model: str = Field(default="")

    # Cloud providers
    openai_api_key: str = Field(default="")
    anthropic_api_key: str = Field(default="")


# Singleton — import this everywhere
settings = Settings()
```

### Pattern 2: LLMFactory — Multi-Provider Abstraction

**What:** `create_llm()` returns a `BaseChatModel` configured for the active provider. Caller never references provider-specific classes.
**When to use:** Everywhere JARVIS needs an LLM — import `create_llm`, call it once per session.

```python
# src/jarvis/llm/factory.py
# Source: CLAUDE.md LM Studio Integration Pattern section
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from jarvis.config import settings


def create_llm() -> BaseChatModel:
    provider = settings.llm_provider

    if provider == "lmstudio":
        return ChatOpenAI(
            base_url=settings.lm_studio_url,
            api_key="lm-studio",   # LM Studio ignores the key but requires a value
            model=settings.lm_studio_model or settings.llm_model,
            streaming=True,
        )
    elif provider == "openai":
        return ChatOpenAI(
            api_key=settings.openai_api_key,
            model=settings.llm_model or "gpt-4o-mini",
            streaming=True,
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            api_key=settings.anthropic_api_key,
            model=settings.llm_model or "claude-3-5-haiku-20241022",
            streaming=True,
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")
```

### Pattern 3: Streaming Conversation Loop

**What:** Token-by-token streaming using `llm.astream()` on a `BaseChatModel`. This is the correct approach for Phase 1 (no tools), bypassing LangGraph graph streaming entirely.
**When to use:** Main conversation loop in `ChatSession`.

```python
# src/jarvis/core/session.py
import asyncio
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

SYSTEM_PROMPT = "You are JARVIS, a helpful personal assistant."


class ChatSession:
    def __init__(self, llm):
        self.llm = llm
        self.history: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]

    async def send(self, user_input: str) -> None:
        self.history.append(HumanMessage(content=user_input))
        full_response = ""
        async for chunk in self.llm.astream(self.history):
            token = chunk.content
            if token:
                print(token, end="", flush=True)
                full_response += token
        print()  # newline after stream
        self.history.append(AIMessage(content=full_response))
```

### Pattern 4: Capability Detection (LLM-02, D-16)

**What:** Detect tool calling, vision, and context window from `/v1/models` + name heuristics. No test call to the LLM.
**When to use:** At startup, before the banner is displayed.

```python
# src/jarvis/llm/capabilities.py
import httpx
from dataclasses import dataclass

VISION_KEYWORDS = ["vision", "vl", "llava", "clip", "pixtral", "qwen2-vl", "minicpm-v"]
TOOL_KEYWORDS = ["instruct", "function", "tool", "chat", "qwen", "llama-3", "mistral", "deepseek"]
CONTEXT_SIZES = {"128k": 131072, "32k": 32768, "16k": 16384, "8k": 8192}


@dataclass
class ModelCapabilities:
    tool_calling: bool
    vision: bool
    context_window: int | None
    model_id: str


def detect_capabilities(base_url: str, model_id: str) -> ModelCapabilities:
    """Heuristic detection — no LLM call made."""
    name_lower = model_id.lower()
    vision = any(kw in name_lower for kw in VISION_KEYWORDS)
    tools = any(kw in name_lower for kw in TOOL_KEYWORDS)
    ctx = None
    for key, size in CONTEXT_SIZES.items():
        if key in name_lower:
            ctx = size
            break
    return ModelCapabilities(
        tool_calling=tools,
        vision=vision,
        context_window=ctx,
        model_id=model_id,
    )
```

### Pattern 5: Startup Validation (ARCH-04, D-15)

**What:** Check package versions against minimums and check LLM reachability before entering the conversation loop. Exit with clear message on failure.
**When to use:** `__main__.py` before `ChatSession` is created.

```python
# src/jarvis/core/startup.py
import sys
import importlib.metadata
import httpx
from packaging.version import Version


VERSION_PINS = {
    "langchain-core": "1.2.22",
    "langgraph-checkpoint-sqlite": "3.0.1",
}


def validate_versions() -> None:
    for package, minimum in VERSION_PINS.items():
        try:
            installed = importlib.metadata.version(package)
            if Version(installed) < Version(minimum):
                print(
                    f"ERRO: {package} {installed} instalado, mas >={minimum} é necessário. "
                    f"Execute: pip install '{package}>={minimum}'"
                )
                sys.exit(1)
        except importlib.metadata.PackageNotFoundError:
            print(
                f"ERRO: Pacote '{package}' não encontrado. Execute: pip install '{package}>={minimum}'"
            )
            sys.exit(1)


def validate_lm_studio_reachable(url: str) -> None:
    try:
        with httpx.Client(timeout=3.0) as client:
            client.get(f"{url}/models")
    except (httpx.ConnectError, httpx.TimeoutException):
        print(
            f"ERRO: LM Studio não acessível em {url}. "
            "Verifique se está rodando e se LM_STUDIO_URL está correto."
        )
        sys.exit(1)
```

### Pattern 6: Platform Abstraction (ARCH-01, D-13)

**What:** ABC in `base.py` with concrete implementations per OS. The `get_platform()` factory selects based on `sys.platform`.
**When to use:** Any code that needs OS-specific behavior imports `get_platform()` — never `sys.platform` in core modules.

```python
# src/jarvis/platform/base.py
from abc import ABC, abstractmethod


class AbstractPlatform(ABC):
    """Common interface for all OS-specific operations."""

    @abstractmethod
    def get_os_name(self) -> str: ...


# src/jarvis/platform/__init__.py
import sys
from .base import AbstractPlatform


def get_platform() -> AbstractPlatform:
    if sys.platform.startswith("linux"):
        from .linux import LinuxPlatform
        return LinuxPlatform()
    elif sys.platform == "win32":
        from .windows import WindowsPlatform
        return WindowsPlatform()
    elif sys.platform == "darwin":
        from .macos import MacOSPlatform
        return MacOSPlatform()
    else:
        raise RuntimeError(f"Unsupported platform: {sys.platform}")
```

### Pattern 7: pyproject.toml with src layout

**What:** Standard packaging setup with `[project.scripts]` entry point and pytest importlib mode for src layout.
**When to use:** Root `pyproject.toml`.

```toml
# pyproject.toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "jarvis"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "langchain==1.2.14",
    "langgraph==1.1.4",
    "langchain-openai==1.1.12",
    "langchain-anthropic==1.4.0",
    "langchain-core>=1.2.22",
    "langgraph-checkpoint-sqlite>=3.0.1",
    "pydantic==2.12.5",
    "pydantic-settings==2.13.1",
    "python-dotenv==1.2.2",
    "rich==14.3.3",
    "loguru==0.7.3",
    "httpx==0.28.1",
    "packaging",
]

[project.scripts]
jarvis = "jarvis.__main__:main"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
addopts = ["--import-mode=importlib"]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### Anti-Patterns to Avoid

- **`AgentExecutor` or `initialize_agent()`:** Deprecated in LangChain 1.0 and removed. Use `create_react_agent` + LangGraph runtime when tools are needed (Phase 4+). For Phase 1 (no tools), use direct `ChatModel.astream()`.
- **`if sys.platform` in core modules:** All OS checks must live exclusively in `src/jarvis/platform/`. Core modules call `get_platform()`.
- **Hardcoded `base_url="http://localhost:1234/v1"`:** Must always read from `settings.lm_studio_url`. Any hardcoded URL will break when the user changes port.
- **`from langchain_community import ChatOpenAI`:** Import from `langchain_openai` and `langchain_anthropic` directly. Community wrappers have slower update cycles and inconsistent interfaces.
- **LangGraph graph streaming with `stream_mode="messages"` for Phase 1:** There are known issues with token-by-token streaming when tools are present in LangGraph 1.1.x. Phase 1 has no tools — use `llm.astream()` directly and keep graph streaming for later phases.
- **`pydantic.BaseSettings` (pydantic v1 path):** In pydantic v2, `BaseSettings` was moved to `pydantic-settings` package. Import from `pydantic_settings`, not `pydantic`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .env file parsing | Custom file reader | `pydantic-settings` with `SettingsConfigDict(env_file=".env")` | Type validation, defaults, env var override built in |
| Package version checking | `subprocess pip show` parsing | `importlib.metadata.version()` from stdlib | Zero-dependency, accurate, fast |
| HTTP connectivity check | Raw socket connection | `httpx.Client` with timeout | Handles SSL, redirects, timeouts cleanly |
| Platform detection branching | `if sys.platform` everywhere | `get_platform()` factory returning `AbstractPlatform` | Single decision point, testable |
| Token streaming loop | Manual SSE parser | `BaseChatModel.astream()` from langchain-core | Handles chunking, reconnect, provider differences |

**Key insight:** In the Python LangChain ecosystem, nearly every glue problem at this layer is already solved. The value is in the integration design (factory pattern, config layer), not in reimplementing what langchain-core, pydantic-settings, and httpx already do.

---

## Common Pitfalls

### Pitfall 1: pydantic-settings is a Separate Package in Pydantic v2

**What goes wrong:** `from pydantic import BaseSettings` raises `ImportError` because BaseSettings was moved to `pydantic-settings` in pydantic v2.
**Why it happens:** pydantic v1 had `BaseSettings` in the main package. v2 split it out.
**How to avoid:** Always `from pydantic_settings import BaseSettings, SettingsConfigDict`. Install `pydantic-settings` explicitly.
**Warning signs:** `ImportError: cannot import name 'BaseSettings' from 'pydantic'`

### Pitfall 2: LangGraph Graph Streaming vs. Chat Model Streaming

**What goes wrong:** Using `agent.astream(stream_mode="messages")` with an empty-tools `create_react_agent` works in testing but breaks when tools are added in Phase 4 — tokens batch up and arrive all at once.
**Why it happens:** LangGraph 1.1.x `create_react_agent` uses `model.invoke()` internally when tools are present, suppressing streaming. This is a known issue tracked in langchain-ai/langgraph#5249.
**How to avoid:** For Phase 1 (no tools), use `llm.astream(messages)` directly on the `BaseChatModel`. Design `ChatSession` so the streaming path can be swapped to LangGraph graph streaming in a later phase without changing the public interface.
**Warning signs:** All tokens arrive at end of response; no intermediate prints during LLM generation.

### Pitfall 3: LM Studio `api_key` Must Be Non-Empty

**What goes wrong:** `ChatOpenAI(base_url=..., model=...)` without `api_key` raises an authentication error or validation error — the OpenAI client requires a non-empty api_key value even for local endpoints.
**Why it happens:** The OpenAI SDK validates that `api_key` is set; LM Studio ignores it but the SDK does not.
**How to avoid:** Always pass `api_key="lm-studio"` (or any non-empty string) when targeting LM Studio.
**Warning signs:** `AuthenticationError` or `openai.AuthenticationError: No API key provided` against a local LM Studio endpoint.

### Pitfall 4: `asyncio_mode = "auto"` Required for pytest-asyncio 1.x

**What goes wrong:** Async tests fail with `RuntimeError: no running event loop` or are silently skipped.
**Why it happens:** pytest-asyncio 1.x changed the default mode. Without `asyncio_mode = "auto"` in pytest config, async tests require explicit `@pytest.mark.asyncio` on every function.
**How to avoid:** Add `asyncio_mode = "auto"` under `[tool.pytest.ini_options]` in `pyproject.toml`.
**Warning signs:** Tests pass when marked with `@pytest.mark.asyncio` individually but not without it; unexpected passes (0 assertions run).

### Pitfall 5: ARCH-03 Version Pins Must Be `>=` Constraints, Not `==`

**What goes wrong:** Pinning `langchain-core==1.2.22` exactly blocks patch upgrades that fix security issues — the requirement says `>=1.2.22`.
**Why it happens:** Misreading the ARCH-03 requirement as an exact pin.
**How to avoid:** Use `langchain-core>=1.2.22` and `langgraph-checkpoint-sqlite>=3.0.1` as lower-bound constraints in `pyproject.toml`.
**Warning signs:** pip dependency resolver fails when other packages require a newer patch of `langchain-core`.

### Pitfall 6: Streaming Requires `streaming=True` on the ChatModel

**What goes wrong:** `llm.astream()` returns the full response in one chunk instead of incrementally — all tokens arrive at once.
**Why it happens:** Some providers default `streaming=False` and buffer the response server-side.
**How to avoid:** Always pass `streaming=True` when constructing `ChatOpenAI` or `ChatAnthropic` in the factory.
**Warning signs:** The `async for chunk in llm.astream(...)` loop iterates exactly once.

---

## Code Examples

### Complete `.env.example`
```dotenv
# Provider: lmstudio | openai | anthropic
LLM_PROVIDER=lmstudio
LLM_MODEL=

# LM Studio (used when LLM_PROVIDER=lmstudio)
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=

# OpenAI (used when LLM_PROVIDER=openai)
OPENAI_API_KEY=

# Anthropic / Claude (used when LLM_PROVIDER=anthropic)
ANTHROPIC_API_KEY=
```

### `__main__.py` Entry Point
```python
# src/jarvis/__main__.py
import asyncio
import sys
from rich.console import Console
from rich.prompt import Prompt
from jarvis.config import settings
from jarvis.llm.factory import create_llm
from jarvis.llm.capabilities import detect_capabilities
from jarvis.core.startup import validate_versions, validate_lm_studio_reachable
from jarvis.core.session import ChatSession

console = Console()


async def main_async() -> None:
    validate_versions()

    if settings.llm_provider == "lmstudio":
        validate_lm_studio_reachable(settings.lm_studio_url)

    llm = create_llm()

    model_id = settings.lm_studio_model or settings.llm_model
    if model_id and settings.llm_provider == "lmstudio":
        caps = detect_capabilities(settings.lm_studio_url, model_id)
        console.print(f"[bold cyan]JARVIS[/bold cyan] | provider: {settings.llm_provider} | model: {model_id}")
        console.print(f"  tool calling: {'yes' if caps.tool_calling else 'no'} | vision: {'yes' if caps.vision else 'no'} | context: {caps.context_window or 'unknown'}")
    else:
        console.print(f"[bold cyan]JARVIS[/bold cyan] | provider: {settings.llm_provider} | model: {settings.llm_model}")

    session = ChatSession(llm)

    while True:
        try:
            user_input = Prompt.ask("[bold green]Você[/bold green]")
        except KeyboardInterrupt:
            console.print("\n[dim]Encerrando...[/dim]")
            break

        if user_input.lower() in ("exit", "quit"):
            break

        console.print("[bold cyan]JARVIS:[/bold cyan] ", end="")
        await session.send(user_input)


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
```

### LM Studio `/v1/models` Query (for capability detection)
```python
# Used inside detect_capabilities or a startup probe
import httpx

def get_lm_studio_models(base_url: str) -> list[str]:
    """Returns list of model IDs currently loaded in LM Studio."""
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{base_url}/models")
            resp.raise_for_status()
            data = resp.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception:
        return []
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `initialize_agent()` + `AgentExecutor` | `create_react_agent` + LangGraph runtime | LangChain 1.0 (2024) | Old API removed — must use new pattern |
| `from pydantic import BaseSettings` | `from pydantic_settings import BaseSettings` | Pydantic v2 (2023) | Separate install required |
| `langchain-community` for LLM calls | `langchain-openai`, `langchain-anthropic` | LangChain 0.2+ | Provider-specific packages have faster release cycles |
| `streaming=True` flag on ChatModel | Default `streaming=True` in modern integrations | langchain-openai 0.3+ | Still safer to set explicitly |

**Deprecated/outdated:**
- `AgentExecutor`: Removed in LangChain 1.0. Do not use.
- `initialize_agent()`: Removed in LangChain 1.0. Do not use.
- `pydantic.BaseSettings`: Moved to `pydantic-settings`. Importing from `pydantic` raises ImportError in v2.
- `RealtimeSTT` for Phase 1: Not needed. Phase 1 is text-only.

---

## Open Questions

1. **LangGraph vs. direct astream for future tool integration**
   - What we know: Phase 1 uses `llm.astream()` directly; Phase 4 adds tools and will need LangGraph agent
   - What's unclear: At what point in `ChatSession` do we switch to the graph-based loop? The issue (langgraph#5249) about streaming with tools may be resolved by Phase 4.
   - Recommendation: Design `ChatSession.send()` to be swappable — abstract the streaming call so Phase 4 can substitute graph streaming without changing the CLI loop.

2. **LM Studio `/v1/models` endpoint availability**
   - What we know: LM Studio exposes OpenAI-compatible endpoints; `/v1/models` is documented as available
   - What's unclear: Older versions of LM Studio may not return the full model metadata (context window size); the heuristic-by-name approach (D-16) is the safe fallback
   - Recommendation: Treat `/v1/models` as "best effort" — fall back to name heuristic if endpoint returns empty or errors.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | Runtime | Yes | 3.12.3 | — |
| pip | Package install | Yes | (system pip3 present) | — |
| langchain | CONV-01, LLM-01 | No (not installed) | — | Install via pip |
| langgraph | LLM-01, ARCH-03 | No (not installed) | — | Install via pip |
| langchain-openai | LLM-01 | No (not installed) | — | Install via pip |
| langchain-anthropic | LLM-01 | No (not installed) | — | Install via pip |
| rich | D-01, D-03 | No (not installed) | — | Install via pip |
| pydantic-settings | D-06, D-07 | No (not installed) | — | Install via pip |
| loguru | Internal logging | No (not installed) | — | Install via pip |
| httpx | ARCH-04 startup check | No (not installed) | — | Install via pip |
| PyPI network access | Package install | Yes | — | — |

**Missing dependencies with no fallback:**
- All Python packages listed above require `pip install`. The machine has Python 3.12.3 and network access to PyPI. A Wave 0 task must create `pyproject.toml` and install dependencies before any implementation tasks run.

**Missing dependencies with fallback:**
- None — all required packages are available via PyPI.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` `[tool.pytest.ini_options]` — Wave 0 creates this |
| Quick run command | `pytest tests/ -x -q` |
| Full suite command | `pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | CLI loop accepts input and returns response | integration | `pytest tests/test_session.py -x` | Wave 0 |
| LLM-01 | `create_llm()` returns correct provider class per config | unit | `pytest tests/test_llm_factory.py -x` | Wave 0 |
| LLM-01 | Switching `LLM_PROVIDER` returns different class without code change | unit | `pytest tests/test_llm_factory.py::test_provider_switch -x` | Wave 0 |
| LLM-02 | Capability detection returns correct fields from model name | unit | `pytest tests/test_capabilities.py -x` | Wave 0 |
| LLM-02 | Vision model name sets vision=True | unit | `pytest tests/test_capabilities.py::test_vision_detection -x` | Wave 0 |
| ARCH-01 | `get_platform()` returns correct class for current OS | unit | `pytest tests/test_platform.py -x` | Wave 0 |
| ARCH-03 | Installed langchain-core and langgraph-checkpoint-sqlite meet minimum versions | unit | `pytest tests/test_startup.py::test_version_pins -x` | Wave 0 |
| ARCH-04 | Startup validation exits with code 1 + clear message on bad LM Studio URL | unit | `pytest tests/test_startup.py::test_lm_studio_unreachable -x` | Wave 0 |
| ARCH-04 | Startup validation exits with code 1 + clear message on missing package | unit | `pytest tests/test_startup.py::test_missing_package -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/ -x -q`
- **Per wave merge:** `pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `pyproject.toml` — project packaging, entry point, pytest config
- [ ] `tests/__init__.py` — test package
- [ ] `tests/test_llm_factory.py` — covers LLM-01
- [ ] `tests/test_capabilities.py` — covers LLM-02
- [ ] `tests/test_session.py` — covers CONV-01
- [ ] `tests/test_startup.py` — covers ARCH-03, ARCH-04
- [ ] `tests/test_platform.py` — covers ARCH-01
- [ ] Framework install: `pip install pytest==9.0.2 pytest-asyncio==1.3.0`

---

## Project Constraints (from CLAUDE.md)

The following directives from `CLAUDE.md` are binding for this phase:

| Directive | Impact on Phase 1 |
|-----------|------------------|
| Stack: Python 3.10+ with LangChain/LangGraph | All code targets Python 3.10+; match/case allowed |
| Multi-LLM: all LLM calls through abstraction layer | `LLMFactory` is mandatory; no direct provider import in `core/` |
| Multiplataforma: OS-specific code isolated in platform module | D-13 enforced; `if sys.platform` only in `platform/__init__.py` |
| Privacidade: conversation never goes to cloud without explicit config | Default provider is `lmstudio`; cloud requires explicit `LLM_PROVIDER` env var |
| Sem UI obrigatória: JARVIS deve funcionar 100% em terminal | Terminal CLI is the primary interface; Rich is for formatting only |
| NEVER use `AgentExecutor` or `initialize_agent()` | Not used in Phase 1; documented in anti-patterns |
| NEVER use `pydantic.BaseSettings` (use `pydantic_settings`) | Settings class imports from `pydantic_settings` |
| NEVER hardcode `base_url` | `settings.lm_studio_url` used everywhere |
| Use `langchain-openai` and `langchain-anthropic` (not community) | Factory imports from specific provider packages |
| Use `loguru` for logging | `loguru` in dependencies; replace any `logging.getLogger` |
| Use `rich` for terminal UI | Rich for prompt and system messages (D-01, D-03) |
| Commit format: Conventional Commits with emojis | All commits follow `<emoji> <type>[scope]: <desc>` format |
| GSD workflow enforcement | File changes go through GSD commands |

---

## Sources

### Primary (HIGH confidence)

- PyPI direct queries (2026-04-02) — all package versions verified against live registry
- CLAUDE.md — stack decisions, version pins, what NOT to use
- `.planning/phases/01-foundation/01-CONTEXT.md` — locked implementation decisions D-01 through D-16
- `importlib.metadata` (Python stdlib docs) — version checking approach
- [pydantic-settings official docs](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) — BaseSettings configuration patterns

### Secondary (MEDIUM confidence)

- [LangChain ChatOpenAI integration docs](https://docs.langchain.com/oss/python/integrations/chat/openai) — base_url for LM Studio, streaming=True
- [LangChain streaming docs](https://docs.langchain.com/oss/python/langchain/streaming) — stream modes, astream usage
- [Python Packaging User Guide — pyproject.toml](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/) — src layout, console_scripts
- [pytest good practices](https://docs.pytest.org/en/stable/explanation/goodpractices.html) — importlib mode for src layout

### Tertiary (LOW confidence — needs validation)

- [LangGraph issue #5249](https://github.com/langchain-ai/langgraph/issues/5249) — streaming issue with tools in create_react_agent. Reported behavior, not official docs. May be resolved in LangGraph 1.1.x — verify before Phase 4.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against PyPI on 2026-04-02
- Architecture: HIGH — patterns directly from CLAUDE.md and official docs
- Pitfalls: MEDIUM — most verified; streaming issue (Pitfall 2) from GitHub issue tracker
- Test map: HIGH — requirement IDs from REQUIREMENTS.md, test patterns from pytest docs

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable ecosystem; pydantic-settings and langchain patch versions may increment)
