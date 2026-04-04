# Technology Stack

**Project:** JARVIS — AI Personal Assistant
**Researched:** 2026-04-04
**Confidence note:** Web/docs tools restricted during research. Findings based on training data through August 2025. Versions marked LOW confidence should be verified against PyPI/npm before pinning.

---

## Recommended Stack

### AI / Orchestration Layer (Python)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| langchain-core | ^0.3 | Base abstractions: Runnables, Messages, PromptTemplates | Minimal footprint, stable API — all LangChain components depend on it |
| langchain | ^0.3 | Agent executor, chains, tool wrappers | Provides `AgentExecutor`, `create_tool_calling_agent`, standard tool interfaces |
| langgraph | ^0.2 | Stateful multi-step agent graphs | The right abstraction for JARVIS's tool-routing loop; replaces deprecated `initialize_agent` |
| langchain-openai | ^0.2 | OpenAI + LM Studio LLM provider | Single provider covers both OpenAI API and LM Studio (OpenAI-compatible endpoint) |
| langchain-community | ^0.3 | Community integrations (file tools, shell, etc.) | Contains `ShellTool`, `FilesystemTool`, screenshot utilities |

**Confidence:** MEDIUM — LangChain 0.3.x was the current stable series as of August 2025. Verify exact minor versions on PyPI before pinning.

### Python Service Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.11+ | Runtime for AI service | 3.11 has significant performance improvements over 3.10; LangChain supports 3.9+ but 3.11 is the sweet spot |
| FastAPI | ^0.115 | Internal HTTP service that Express calls | Async-native, automatic OpenAPI docs, Pydantic validation — better fit than Flask for streaming LLM responses |
| uvicorn | ^0.32 | ASGI server for FastAPI | Standard production ASGI server; use `uvicorn[standard]` for watchfiles reload in dev |
| Pydantic | v2 (^2.9) | Data validation and settings | FastAPI uses Pydantic v2; config/env management via `pydantic-settings` |
| pydantic-settings | ^2.6 | Environment variable config | `BaseSettings` pattern — reads `.env`, overrideable per-env, type-safe |

**Confidence:** HIGH for FastAPI/uvicorn pattern. MEDIUM for exact versions.

**Why FastAPI over Flask:** JARVIS needs Server-Sent Events (SSE) or streaming for real-time CLI output. FastAPI's `StreamingResponse` + async generators handle this natively. Flask requires workarounds.

### API Gateway Layer (Node.js)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 20 LTS | Runtime for Express gateway | 20 LTS is stable, supported until 2026-04-30; avoid 22 until it matures in production |
| Express | ^4.21 | HTTP gateway — routes client requests to Python service | Project decision: Express as the public-facing API; keeps Python service internal |
| axios | ^1.7 | Express → Python HTTP client | More ergonomic than `node-fetch` for typed responses; handles base URLs cleanly |
| zod | ^3.23 | Request validation in Express | Runtime type validation before forwarding to Python — catches bad input early |

**Confidence:** HIGH for Express 4.x pattern. Express 5 was in RC as of Aug 2025 — do NOT use for a new project yet.

### CLI Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| rich | ^13.9 | Terminal formatting (Python) | Colors, panels, markdown rendering, progress bars in terminal — dramatically better UX than plain print |
| prompt_toolkit | ^3.0 | Interactive CLI input (Python) | Multi-line input, history, completion — the right tool for a conversational REPL |
| typer | ^0.13 | CLI command parsing (Python) | Built on Click, Pydantic-friendly, generates --help automatically |

**Why Python CLI, not Node CLI:** The CLI calls the Python FastAPI service directly in development. Avoids Express roundtrip latency for local dev. In production the CLI can call Express or Python directly — keep it configurable via `JARVIS_API_URL`.

**Confidence:** HIGH — these are the de facto standard Python CLI libraries as of 2025.

### Memory Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SQLite (via sqlite3 stdlib) | stdlib | Structured long-term memory | Zero-dependency, local-first, sufficient for personal assistant scale |
| chromadb | ^0.5 | Vector store for semantic memory | Embedded mode (no server), Python-native, LangChain integration via `langchain-chroma` |
| langchain-chroma | ^0.1 | LangChain ↔ ChromaDB bridge | Official integration — `Chroma` vectorstore with standard `VectorStore` interface |

**Confidence:** MEDIUM — ChromaDB 0.5.x is the current series. `langchain-chroma` is the correct package name (split from `langchain-community` in 2024).

### PC Control Tools

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pytesseract | ^0.3.10 | OCR from screenshots | Standard Python Tesseract wrapper; requires `tesseract-ocr` system package |
| Pillow | ^11.0 | Image handling for screenshots | PIL fork, used by pytesseract and mss |
| mss | ^9.0 | Cross-platform screenshots | Faster than pyautogui for screen capture; pure Python |
| pyautogui | ^0.9.54 | Mouse/keyboard control (future) | Cross-platform; scoped OUT for v1 but include as optional dep now |
| subprocess (stdlib) | stdlib | Shell command execution | Use stdlib `subprocess.run` with `ShellTool` wrapper from langchain-community |
| psutil | ^6.0 | Process/app management | List running processes, open apps, system info |

**Confidence:** HIGH for pytesseract/Pillow/mss pattern. MEDIUM for exact versions.

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pytest | ^8.3 | Test runner | The standard; do NOT use unittest for new Python projects |
| pytest-asyncio | ^0.24 | Async test support | Required for FastAPI route tests and async LangChain chains |
| pytest-mock | ^3.14 | Mocking | `mocker` fixture is cleaner than `unittest.mock` |
| httpx | ^0.28 | FastAPI test client | `TestClient` in FastAPI uses httpx under the hood; also use `AsyncClient` for async tests |
| jest | ^29 | Node.js unit tests for Express | Standard; use with `--experimental-vm-modules` for ESM |
| supertest | ^7 | Express HTTP testing | Standard Express integration test library |

**Confidence:** HIGH — these are stable, widely-used testing tools.

### Development Tooling (Python)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| uv | ^0.5 | Python package manager + venv | Replaces pip+venv; dramatically faster, lockfile support (`uv.lock`), same pyproject.toml |
| ruff | ^0.8 | Linter + formatter | Replaces black + isort + flake8 in one tool; extremely fast |
| mypy | ^1.13 | Static type checking | Essential with Pydantic v2 and complex LangChain types |

**Confidence:** HIGH — `uv` crossed into mainstream adoption mid-2024, `ruff` is the de facto standard.

### Monorepo Structure (pnpm)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pnpm | ^9 | Node package manager + workspaces | Project constraint; faster than npm, strict hoisting, workspace protocol |
| pnpm workspaces | — | Monorepo management | `packages/gateway` (Express), `packages/cli-web` (future UI) |

**Note:** Python is NOT managed by pnpm. Use `uv` with `pyproject.toml` in `packages/ai-service/`. The monorepo root `package.json` has scripts that invoke `uv run` commands for Python tasks.

**Confidence:** HIGH — this is the standard hybrid monorepo pattern.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| AI Framework | LangChain/LangGraph | LlamaIndex | LlamaIndex is document-retrieval-first; LangChain has better tool/agent ecosystem for PC control |
| AI Framework | LangChain/LangGraph | AutoGen (Microsoft) | AutoGen is multi-agent chat-focused; more complex setup for single-agent personal assistant |
| AI Framework | LangChain/LangGraph | Semantic Kernel | C#/.NET primary target; Python SDK is secondary citizen |
| Python service | FastAPI | Flask | Flask lacks native async/streaming; worse fit for LLM streaming responses |
| Python service | FastAPI | Django | Way too heavy; JARVIS service is a simple internal API, not a web app |
| Vector DB | ChromaDB | Pinecone | Pinecone is cloud-only — violates local-first/privacy constraint |
| Vector DB | ChromaDB | Weaviate | Requires running a separate server process; ChromaDB embedded is zero-overhead |
| Vector DB | ChromaDB | FAISS | No persistence by default; ChromaDB has better LangChain integration with metadata filtering |
| Python tooling | uv | poetry | Poetry is slower and the ecosystem is moving to uv in 2025 |
| Python tooling | ruff | black + isort + flake8 | Three tools replaced by one; ruff is 10-100x faster |
| Screenshot/OCR | pytesseract + mss | pyautogui (screenshot) | pyautogui is slower for screenshots; mss is purpose-built for screen capture |
| Express version | Express 4 | Express 5 | Express 5 was in RC/beta as of Aug 2025 — not production-ready for new projects |
| LLM interface | langchain-openai | openai SDK directly | langchain-openai gives LangChain Runnable interface, tool calling, memory integration for free |

---

## LLM Configuration Pattern

JARVIS uses `langchain-openai` with environment-switched base URL:

```python
# config.py pattern
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    llm_provider: str = "openai"          # "openai" | "lmstudio"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    lmstudio_base_url: str = "http://localhost:1234/v1"
    lmstudio_model: str = "local-model"

    class Config:
        env_file = ".env"

# factory.py pattern
from langchain_openai import ChatOpenAI

def create_llm(settings: Settings) -> ChatOpenAI:
    if settings.llm_provider == "lmstudio":
        return ChatOpenAI(
            base_url=settings.lmstudio_base_url,
            api_key="lm-studio",          # LM Studio ignores the key
            model=settings.lmstudio_model,
        )
    return ChatOpenAI(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
    )
```

This works because LM Studio exposes an OpenAI-compatible REST API. One client, two backends.

**Confidence:** HIGH — this is the documented pattern for LM Studio + LangChain.

---

## Monorepo Directory Structure

```
jarvis/                          # repo root
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml          # defines packages/*
├── pyproject.toml               # root Python config (uv workspaces, optional)
├── .env                         # secrets (gitignored)
├── packages/
│   ├── gateway/                 # Express API gateway (Node.js)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       └── routes/
│   ├── ai-service/              # Python FastAPI + LangChain
│   │   ├── pyproject.toml
│   │   ├── uv.lock
│   │   └── src/jarvis/
│   │       ├── api/             # FastAPI routes
│   │       ├── agents/          # LangGraph agents
│   │       ├── tools/           # PC control tools
│   │       ├── memory/          # SQLite + ChromaDB
│   │       └── config.py
│   └── cli/                     # Python CLI (calls ai-service directly in dev)
│       ├── pyproject.toml
│       └── src/
└── tests/
    ├── python/                  # pytest
    └── node/                    # jest
```

**Note:** Current codebase has `src/jarvis/` at the root (not under `packages/`). Migration to this structure is a refactoring decision — can be done progressively.

---

## Installation

```bash
# Python service (in packages/ai-service/)
uv add langchain langchain-core langchain-openai langchain-community langgraph
uv add fastapi "uvicorn[standard]" pydantic-settings
uv add chromadb langchain-chroma
uv add pytesseract Pillow mss psutil rich prompt_toolkit typer
uv add --dev pytest pytest-asyncio pytest-mock httpx ruff mypy

# Node gateway (in packages/gateway/)
pnpm add express axios zod
pnpm add -D typescript @types/express @types/node jest supertest ts-node nodemon

# Workspace root
pnpm add -D concurrently  # run Python + Node together in dev
```

---

## Service Communication

```
CLI (Python) ──HTTP──▶ Express gateway (Node :3000)
                              │
                         HTTP (internal)
                              │
                              ▼
                     FastAPI service (Python :8000)
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
              LangGraph agent      Memory layer
              (OpenAI/LM Studio)   (SQLite + ChromaDB)
```

- CLI → Express: public API, auth/rate-limiting lives here in future
- Express → FastAPI: internal network only (127.0.0.1), no auth needed
- FastAPI → LangGraph: in-process function calls
- LangGraph → LLM: HTTPS to OpenAI API or HTTP to LM Studio on localhost

---

## Sources

- LangChain documentation (training data, August 2025): architecture patterns for tool-calling agents
- LangGraph concepts: stateful agent graphs, `StateGraph`, `CompiledGraph`
- LM Studio OpenAI-compatible API: documented pattern for `base_url` override
- FastAPI streaming: `StreamingResponse` with async generators for SSE
- ChromaDB embedded mode: `chromadb.Client()` vs `chromadb.PersistentClient(path=...)`
- pnpm workspaces: `pnpm-workspace.yaml` multi-package monorepo pattern
- uv documentation: pyproject.toml-based Python dependency management

**Overall confidence:** MEDIUM. Core architectural patterns are stable and well-validated. Specific version numbers for LangChain/LangGraph ecosystem should be verified on PyPI before pinning — this ecosystem releases frequently.
