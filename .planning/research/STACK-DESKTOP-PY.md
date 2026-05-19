# Technology Stack: Python Desktop Client (apps/desktop-py/)

**Project:** JARVIS v3.2 — Python thin client  
**Researched:** May 17, 2026  
**Scope:** Terminal-first voice+text client connecting to existing TypeScript backend/gateway  
**Verification:** CLAUDE.md versions confirmed current via PyPI; no re-research of backend-ts decisions

## Executive Summary

apps/desktop-py/ is a **Python thin client** — no LLM, no agent framework, no memory infrastructure. All AI reasoning stays in backend-ts (port 8001). This client's job: 
- Terminal chat (POST `/api/chat` to gateway)
- Local STT: faster-whisper (offline)
- Local TTS: kokoro (offline) + ElevenLabs/Murf (cloud fallback)
- Voice modes: PTT, always-listening, wake-word (openwakeword)
- Minimal UI: status indicator + config screen (Whisper model + TTS provider)

**Key architectural decision:** No LangChain. No ChromaDB. No SQLite memory layer. Client is 100% stateless except for user config (model selection, API keys, voice mode). All state and memory lives in backend-ts, accessed via HTTP.

---

## Recommended Stack

### Core Dependencies (Runtime)

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| **Python** | 3.12 | Runtime | Required by faster-whisper, kokoro, and all voice pipeline. 3.12 preferred over 3.10 for performance and better error messages. Minimum 3.10 acceptable but not recommended. |
| **httpx** | 0.28.1 | HTTP client (sync + async) | Calls gateway `/api/chat` POST, SSE streaming GET. Native async/await support. Used by openai SDK internally. Drop-in replacement for requests with async bonus. |
| **pydantic** | 2.13.4 | Config validation, data models | Type-safe settings (LM Studio URL, Whisper model, API keys). Use `pydantic-settings` (separate package) for `.env` integration. JARVIS config pattern established in backend. |
| **pydantic-settings** | 2.6.x | `.env` file loading | Reads API_KEY, ELEVENLABS_API_KEY, MURF_API_KEY, WHISPER_MODEL from `.env`. Auto-reload on file change for hot-reload support. |

### Voice Pipeline (STT / Audio Capture / Wake Word)

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| **faster-whisper** | 1.2.1 | Speech-to-Text (offline) | 4x faster than openai/whisper via CTranslate2 backend. Supports int8 quantization for CPU-only machines. Models auto-select by VRAM (large/base/tiny). Audio never leaves device. |
| **sounddevice** | 0.5.5 | Microphone capture | NumPy arrays directly → compatible with faster-whisper input. Prebuilt wheels all platforms (no PortAudio build pain like PyAudio). Actively maintained (Jan 2026 release). |
| **openwakeword** | 0.6.0 | Wake word detection ("Hey JARVIS") | 100% offline, no API key. ONNX runtime backend (cross-platform). Includes Silero VAD to filter false positives. Reuses pattern from backend-ts. |
| **onnxruntime** | 1.18.0+ | Runtime for openwakeword models | Required by openwakeword. Auto-installed as transitive dependency. |

### Voice Pipeline (TTS)

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| **kokoro** | 0.9.4+ | Text-to-Speech (offline, default) | 82M-parameter neural TTS, 350MB model size, Apache-licensed. Human-quality speech in 54 voices. Runs fully offline after model download. No API key. Fallback strategy: try kokoro first, degrade to cloud if disabled or on error. |
| **elevenlabs** | 2.45.0 | Cloud TTS fallback (optional) | Official Python SDK for ElevenLabs. Higher quality pt-BR voices than kokoro. Requires API key (env var `ELEVENLABS_API_KEY`). Used only if kokoro unavailable or explicitly selected. |
| **murf** | 2.3.0 | Cloud TTS fallback (optional) | Official Python SDK for Murf. Alternative cloud provider with native pt-BR support. Requires API key (env var `MURF_API_KEY`). Same fallback pattern as ElevenLabs — configured in settings UI. |

### Supporting Libraries

| Package | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **python-dotenv** | 1.0.1 | `.env` file loader (simple mode) | Fallback if pydantic-settings unavailable. Recommended: use pydantic-settings instead for type-safe config. |
| **loguru** | 0.7.2 | Structured logging | Replaces stdlib logging. Zero-config, colored output, file rotation. Terminal logging with context (state, LLM response time). |
| **rich** | 13.7.0 | Terminal UI rendering | Format status output (listening/thinking/speaking). Progress bars for model downloads. Chat history display. |
| **typer** | 0.12.0 | CLI framework (optional) | If building complex CLI with subcommands (config, status, chat, voice-mode). Lightweight alternative to Click. Optional — vanilla argparse works too. |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **pytest** | 8.0.0+ | Unit testing |
| **pytest-asyncio** | 0.23.0+ | Async test support (httpx async calls, voice pipeline) |
| **black** | 24.1.1 | Code formatter |
| **mypy** | 1.8.0+ | Static type checking |
| **ruff** | 0.3.0+ | Fast linter |

---

## Installation & Setup

### Root Workspace (pnpm)

The existing `.pnpm-workspace.yaml` already lists `apps/**` as a workspace. Python subproject needs **separate** dependency management:

```yaml
# pnpm-workspace.yaml (NO CHANGES NEEDED)
packages:
  - 'apps/**'
  - 'packages/**'
```

pnpm will ignore `apps/desktop-py/` because it has no `package.json`. Python workspace uses native tooling.

### apps/desktop-py/ Structure

```
apps/desktop-py/
├── pyproject.toml          # uv workspace config + dependencies
├── uv.lock                 # lockfile (commit to git)
├── .venv/                  # virtual environment (git-ignored)
├── src/
│   ├── jarvis/
│   │   ├── __init__.py
│   │   ├── config.py       # Settings via pydantic-settings
│   │   ├── client.py       # HTTPClient wrapper (httpx)
│   │   ├── stt.py          # STT pipeline (faster-whisper + sounddevice)
│   │   ├── tts.py          # TTS orchestration (kokoro + fallbacks)
│   │   ├── voice_mode.py   # VoiceCaptureStrategy (PTT/wake-word/always-listening)
│   │   ├── ui.py           # Terminal UI (rich + typer)
│   │   └── main.py         # Entry point
│   └── tests/
│       ├── test_config.py
│       ├── test_stt.py
│       └── test_tts.py
└── README.md
```

### pyproject.toml Template

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "jarvis-desktop-py"
version = "3.2.0"
description = "Python thin client for JARVIS assistant"
requires-python = ">=3.12"
license = { text = "MIT" }
authors = [{ name = "biel.lil", email = "josegabriel@expertintegrado.com.br" }]

# Runtime dependencies
dependencies = [
    "httpx>=0.28.0",
    "pydantic>=2.13.0",
    "pydantic-settings>=2.6.0",
    "faster-whisper>=1.2.1",
    "sounddevice>=0.5.5",
    "openwakeword>=0.6.0",
    "onnxruntime>=1.18.0",
    "kokoro>=0.9.4",
    "elevenlabs>=2.45.0",
    "murf>=2.3.0",
    "loguru>=0.7.2",
    "rich>=13.7.0",
    "typer>=0.12.0",
]

# Optional: Platform-specific audio dependencies
# sounddevice handles PortAudio on all platforms via prebuilt wheels
# No platform-specific deps needed unlike legacy PyAudio setup

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "black>=24.1.0",
    "mypy>=1.8.0",
    "ruff>=0.3.0",
]

[project.scripts]
jarvis = "jarvis.main:main"

[tool.uv]
# Single venv shared across workspace
workspace = false  # Not part of parent uv workspace (if one exists)

[tool.uv.sources]
# If JARVIS backend APIs change, can pin local packages here
# Currently: all external packages from PyPI

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true

[tool.black]
line-length = 100
target-version = ["py312"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

### Initialize Project

```bash
# Navigate to project root (where pnpm-workspace.yaml is)
cd jarvis

# Create Python project structure
mkdir -p apps/desktop-py/src/jarvis/tests
cd apps/desktop-py

# Option A: uv (recommended for speed and workspaces)
uv init --python 3.12

# Option B: pip + venv (compatible but manual)
python3.12 -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install dependencies (uv)
uv sync  # Installs everything in uv.lock

# Install dependencies (pip)
pip install -r requirements.txt  # After exporting from pyproject.toml
```

### Bootstrap Script (Optional)

Create `.scripts/bootstrap-py.sh` (Linux/macOS) or `.scripts/bootstrap-py.ps1` (Windows) to handle platform-specific setup:

```bash
#!/bin/bash
# Bootstrap Python desktop client

set -e

cd apps/desktop-py

# Install system dependencies (platform-specific)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux: libportaudio2 for sounddevice
    sudo apt-get install -y libportaudio2
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: portaudio via Homebrew
    brew install portaudio
fi

# Create venv and install
uv sync

# Run minimal validation
uv run -m pytest tests/ -v
```

---

## Monorepo Integration Notes

### Why Separate Tooling?

**pnpm** is designed for **Node.js/npm packages**. Adding Python packages to pnpm creates friction:
- pnpm can't resolve Python dependencies
- `pnpm install` won't install Python packages
- Mixed CI/CD scripts (npm for TS, pip/uv for Python)

**Solution:** apps/desktop-py/ uses **uv** (Python's native package manager) independently. Both coexist:
- Root `pnpm-workspace.yaml` ignores `apps/desktop-py/` (no package.json = pnpm skips it)
- `apps/desktop-py/pyproject.toml` manages Python dependencies via uv
- CI/CD: `pnpm install` (TypeScript projects), then `cd apps/desktop-py && uv sync` (Python client)

### Shared Context Between TS and Python Clients

**Backend-ts doesn't change.** Both desktop clients (Electron + Python) consume the same gateway API:

| Endpoint | Used By | Notes |
|----------|---------|-------|
| `POST /api/chat` | Both | Text request, full response. No changes. |
| `GET /api/chat/stream` | Both | SSE streaming, token-by-token. No changes. |
| `GET /api/health` | Both | Liveness check. No changes. |

Python client doesn't need to know about Electron internals (IPC, native modules, etc.). Clean separation.

### Environment Variables

Both clients read same `.env` pattern (backend-ts sets standard):

```bash
# .env (root level)
LM_STUDIO_URL=http://localhost:1234/v1
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
MURF_API_KEY=...
```

Python client loads via pydantic-settings:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    lm_studio_url: str = "http://localhost:1234/v1"
    elevenlabs_api_key: str | None = None
    murf_api_key: str | None = None
    whisper_model: str = "base"
    
    class Config:
        env_file = ".env"
        extra = "ignore"
```

---

## What NOT to Include

### ❌ Do NOT Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **LangChain Python 1.x** | Backend-ts handles LLM. Client is stateless thin layer. LangChain adds 50MB+ overhead. | httpx for HTTP calls only |
| **LangGraph** | No agent reasoning in client. Backend-ts orchestrates everything. | Direct HTTP POST/GET calls |
| **ChromaDB** | Memory stays in backend-ts SQLite + ChromaDB. Client doesn't cache. | None — query backend instead |
| **SQLite (sqlite3)** | No local conversation history. Stateless design. | None — backend persists history |
| **PyAudio** | Requires PortAudio headers on Linux (build pain). sounddevice prebuilt wheels work everywhere. | sounddevice (already chosen) |
| **openai/whisper** | 4x slower than faster-whisper (PyTorch vs CTranslate2). | faster-whisper (already chosen) |
| **pyttsx3** | Robotic voice quality (wraps OS SAPI/espeak). | kokoro (already chosen) |
| **RealtimeSTT** | Higher-level wrapper that adds complexity we don't need. Use faster-whisper directly with sounddevice. | faster-whisper + sounddevice |
| **Poetry** | Not integrated with pnpm workspace. uv has cleaner monorepo support. | uv (recommended) |
| **Pipenv** | Unmaintained (last update 2021). Slow dependency resolution. | uv (modern, 10-100x faster) |
| **Hardcoded base_url** | Breaks when user changes LM Studio port/host. | Read from pydantic-settings + .env |
| **Client-side TTS choice logic** | Should be config-driven, not code. | Settings UI (separate phase) |
| **Async everywhere** | Not needed for synchronous CLI. Add async only where necessary (streaming SSE, background VAD loop). | Mix sync/async pragmatically |

### ⚠️ Handle Carefully

| Feature | Status | Note |
|---------|--------|------|
| MCP (Model Context Protocol) | Backend-ts only | Python client doesn't expose/consume MCP. Backend-ts is the MCP server/client. |
| Vision / Screen Analysis | Backend-ts only | Desktop client doesn't capture or analyze screen. "Analyze screen" tool lives in backend-ts Electron integration. |
| File Operations | Backend-ts only | Client doesn't execute PC control tasks. Backend receives LLM-generated payloads from Electron, executes them. Python client calls backend's `/api/chat`, which may include file tool results. |
| Local Model Downloads | Expected | faster-whisper and kokoro auto-download models on first use (~500MB+ total). Cache in `~/.cache` or `~/Library/Caches`. Warn user in UI. |

---

## Version Compatibility Matrix

| Package | Python | Notes |
|---------|--------|-------|
| **faster-whisper 1.2.1** | >=3.9 | ctranslate2 auto-installed. GPU optional (CUDA/CPU fallback). |
| **sounddevice 0.5.5** | >=3.6 | Prebuilt wheels all platforms. |
| **openwakeword 0.6.0** | >=3.7 | onnxruntime optional but required for production (TFLite unsupported on most platforms). |
| **kokoro 0.9.4+** | >=3.9 | torch >=2.0 auto-installed. espeak-ng required on Linux only (for phoneme fallback). |
| **elevenlabs 2.45.0** | >=3.8, <4.0 | Async support built-in. |
| **murf 2.3.0** | >=3.8, <4.0 | Async support built-in. |
| **pydantic 2.13.4** | >=3.8 | Latest 2.x branch. Stable until Pydantic v3 (2027+). |
| **httpx 0.28.1** | >=3.8 | Supports both sync and async. |

---

## Cross-Platform Dependencies

### Linux

```bash
# System packages
sudo apt-get install -y libportaudio2  # For sounddevice
apt-get install -y espeak-ng           # For kokoro phoneme fallback

# Then uv sync
uv sync
```

### macOS

```bash
# System packages
brew install portaudio  # For sounddevice

# Then uv sync
uv sync
```

### Windows

```powershell
# No system package manager needed
# uv sync handles everything via prebuilt wheels
uv sync
```

---

## Package Manager: uv vs pip+Poetry

### Why uv?

| Criterion | uv | pip + Poetry | pip only |
|-----------|----|-----------|----|
| **Speed** | 10-100x faster | 5-10x faster | Slowest |
| **Monorepo support** | Native workspaces, clean integration | Separate workspace spec | No workspace support |
| **Lockfile format** | Standard cross-platform (uv.lock) | poetry.lock (text) | requirements.txt (fragile) |
| **Python version management** | Built-in (uv python install) | Via pyenv/asdf | Via pyenv/asdf |
| **Reproducibility** | Excellent — single command `uv sync` | Good — `poetry install` | Poor — no lock guarantee |
| **CI/CD simplicity** | Single tool replaces python + pip + venv | Multiple tools | Multiple tools |

**Recommendation:** Use **uv** as primary. Poetry is fine as alternative if team familiar; pip is acceptable only for simple projects.

---

## Sources

### Core Verification (May 2026)

- [faster-whisper PyPI](https://pypi.org/project/faster-whisper/) — version 1.2.1 confirmed current
- [sounddevice PyPI](https://pypi.org/project/sounddevice/) — version 0.5.5 confirmed current  
- [openwakeword GitHub](https://github.com/dscripka/openWakeWord) — version 0.6.0 current stable
- [kokoro PyPI](https://pypi.org/project/kokoro/) — version 0.9.4+ confirmed stable
- [elevenlabs PyPI](https://pypi.org/project/elevenlabs/) — version 2.45.0 latest (April 27, 2026)
- [murf PyPI](https://pypi.org/project/murf/) — version 2.3.0 latest (March 5, 2026)
- [pydantic PyPI](https://pypi.org/project/pydantic/) — version 2.13.4 latest (May 6, 2026)
- [httpx PyPI](https://pypi.org/project/httpx/) — version 0.28.1 latest (2026)
- [uv Documentation](https://docs.astral.sh/uv/guides/projects/) — workspace and project management
- [Python and Typescript in a monorepo](https://medium.com/@julien.barbay/python-and-typescript-in-a-monorepo-c862a3bacddb) — polyglot monorepo patterns
- [pnpm Workspaces](https://pnpm.io/workspaces) — Node.js-specific workspace docs

### Architecture References (from CLAUDE.md)

- [SYSTRAN/faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper) — 4x speedup via CTranslate2
- [PyPI langchain 1.2.14](https://pypi.org/project/langchain/) — decision to NOT use in client
- [Modal.com Whisper comparison](https://modal.com/blog/choosing-whisper-variants) — STT benchmarks

---

## Summary for Roadmap

**Stack decision:** Terminal-first Python client, httpx + pydantic-settings for config/HTTP, faster-whisper + sounddevice for STT, kokoro + elevenlabs/murf for TTS, openwakeword for wake word. No LangChain, no memory layer. Uses uv for dependency management separate from pnpm workspace.

**Phase 1 dependency:** pyproject.toml setup, venv, core HTTP client + config validation.  
**Phase 2 dependency:** STT pipeline (faster-whisper + sounddevice wired).  
**Phase 3 dependency:** TTS + fallback orchestration (kokoro primary, cloud fallback).  
**Phase 4+ dependencies:** UI, voice modes, settings persistence (not blocking stack verification).

**No blockers identified.** All libraries current as of May 2026. Versions stable with no major deprecations on horizon.
