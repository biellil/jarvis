# Phase 72: Python Infrastructure Setup - Research

**Researched:** 2026-05-18  
**Domain:** Python package scaffolding, dependency management, config persistence  
**Confidence:** HIGH

## Summary

Phase 72 scaffolds `apps/desktop-py/` as a standalone Python package using uv for dependency management and provides the foundational infrastructure for the Python desktop client. The phase establishes a working entry point that validates gateway connectivity, persists user preferences to `~/.jarvis/config.json`, and integrates seamlessly with the monorepo's pnpm workspace.

The infrastructure is lightweight—no LangChain, no voice features, no UI. It's a thin HTTP client designed to be extended by Phases 73-77 (chat, STT, TTS, voice modes, UI).

**Primary recommendation:** Use uv's src layout template with pyproject.toml pinning Python 3.12. Load both `.env` (gateway URL) and `~/.jarvis/config.json` (user preferences) at startup. Entry point: `uv run python -m jarvis_desktop` (avoids needing [project.scripts] configuration for now). Health check via `GET http://localhost:3000/api/health` with graceful offline handling.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use **src layout** — `apps/desktop-py/src/jarvis_desktop/`
- **D-02:** Python package name: **`jarvis_desktop`** (consistent with `@jarvis/*` workspace)
- **D-03:** Entry point via `__main__.py` in `src/jarvis_desktop/__main__.py`
- **D-04:** `apps/desktop-py/` has its own **`package.json`** with `{"scripts": {"dev": "uv run python -m jarvis_desktop"}}`
- **D-05:** Root `package.json` adds: `"dev:desktop-py": "pnpm --filter @jarvis/desktop-py dev"`
- **D-06:** Package name in `package.json` must be **`@jarvis/desktop-py`** (workspace pattern)
- **D-07:** Config schema **complete with defaults** defined in Phase 72 — downstream phases read, don't redefine
- **D-08:** Config fields and defaults:
  ```json
  {
    "gateway_url": "http://localhost:3000",
    "whisper_model": "tiny",
    "tts_provider": "kokoro",
    "voice_mode": "ptt"
  }
  ```
- **D-09:** Config persists in `~/.jarvis/config.json` — created automatically if missing
- **D-10:** Entry point behavior: load config, health check GET /api/health, display status, await Ctrl+C (no crash if offline)
- **D-11:** Graceful offline handling — report status and continue running
- **D-12:** `requires-python = ">=3.12"` in pyproject.toml
- **D-13:** `.gitignore` updated with `venv/` if not present (`.pytest_cache/`, `__pycache__/` already there)
- **D-14:** `.env` and `.env.example` get `GATEWAY_URL=http://localhost:3000`

### Claude's Discretion

- Internal module structure beyond entry point (`config.py`, `health.py` within `jarvis_desktop/`)
- Config save/load mechanism (json stdlib vs pydantic-settings)
- Terminal output formatting (print vs rich)

### Deferred Ideas (OUT OF SCOPE)

None — discussion remained within phase scope.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PYSETUP-01 | User can run `uv sync` in `apps/desktop-py/` to install all Python dependencies without system-level configuration | uv handles venv creation automatically; lockfile-first approach avoids system-level setup |
| PYSETUP-02 | User can start the Python desktop client via `pnpm dev:desktop-py` from project root | pnpm workspace filter + package.json dev script routing `uv run python -m jarvis_desktop` |
| PYSETUP-03 | `.gitignore` and `.env` updated with Python-specific entries (`GATEWAY_URL`, `venv/`, `.pytest_cache/`) | Python entry point reads `GATEWAY_URL` via `python-dotenv`; existing ignores already have `__pycache__/`, `.pytest_cache/`, `.venv/` but missing `venv/` |
| PYSETUP-04 | User preferences (Whisper model, TTS provider, voice mode) persist across sessions in `~/.jarvis/config.json` | Pydantic BaseSettings with JsonConfigSettingsSource or json stdlib; auto-create `~/.jarvis/` if missing |

---

## Standard Stack

### Core Infrastructure

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.12+ | Runtime | Per CLAUDE.md — minimum 3.10 (match/case), 3.12 preferred (faster, better errors). uv supports version pinning via `.python-version`. |
| uv | latest | Dependency manager, venv creation, lockfile generation | Extremely fast (Rust-based), production-ready (Feb 2024+), default choice in 2025+. lockfile-first prevents dependency drift. |
| httpx | 0.28.x | HTTP client (used by openai SDK for LM Studio, also direct use) | Async-capable; integrates with openai 2.30.0. For health check, can use stdlib `urllib` instead if minimal deps preferred. |
| python-dotenv | 1.x | Load `.env` at startup | Standard pattern for GATEWAY_URL, LM_STUDIO_URL, API keys. Phase 72 only needs GATEWAY_URL; later phases extend. |
| pydantic | 2.x | Settings validation, config schema (required by CLAUDE.md for LangChain compat) | Per CLAUDE.md: LangChain 1.x requires Pydantic v2. Use BaseSettings for typed config. |

### Terminal Output (Optional for Phase 72)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rich | 13.x | Terminal UI (status line, colored output) | CLAUDE.md recommended. Phase 77 (Minimal UI) uses it; Phase 72 entry point can use simple print or defer rich to Phase 77. |

### Testing (Optional for Phase 72)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | 8.x | Unit testing | Phase 72 validation can test config loading, health check logic. |

### Installation

**Phase 72 minimal dependencies (locked in pyproject.toml):**

```toml
[project]
name = "jarvis_desktop"
version = "0.1.0"
description = "JARVIS Python desktop client"
requires-python = ">=3.12"
dependencies = [
    "python-dotenv>=1.0.0",
    "pydantic>=2.7.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
]
```

**Later phases add to dependencies:**
- Phase 73: requests or httpx (gateway chat calls)
- Phase 74: faster-whisper, sounddevice (STT)
- Phase 75: kokoro, soundfile (TTS)
- Phase 76: openwakeword (wake word)
- Phase 77: rich (terminal UI)

**Installation command (after pyproject.toml is created):**

```bash
cd apps/desktop-py
uv sync  # Creates .venv/ (or venv/), installs dependencies
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop-py/
├── pyproject.toml          # PEP 517/518 compliant, src layout
├── .python-version         # Python 3.12
├── package.json            # @jarvis/desktop-py, {"dev": "uv run python -m jarvis_desktop"}
├── README.md               # Setup instructions
├── .gitignore              # Includes venv/, __pycache__/, .pytest_cache/
├── uv.lock                 # Lockfile (auto-generated by uv sync)
├── src/
│   └── jarvis_desktop/
│       ├── __init__.py     # Package marker, optional __version__
│       ├── __main__.py     # Entry point (phase 72)
│       ├── config.py       # Config loading (phase 72)
│       ├── health.py       # Health check client (phase 72)
│       ├── chat.py         # Terminal chat (phase 73)
│       ├── stt.py          # Speech-to-text (phase 74)
│       ├── tts.py          # Text-to-speech (phase 75)
│       ├── voice_modes.py  # Voice mode state machine (phase 76)
│       └── ui.py           # Terminal UI (phase 77)
└── tests/
    ├── conftest.py         # Shared pytest fixtures
    ├── test_config.py      # Config loading tests
    └── test_health.py      # Health check tests
```

### Pattern 1: Entry Point via `__main__.py`

**What:** Python module executed when running `uv run python -m jarvis_desktop`. The `__main__.py` file is the entry point; it imports and orchestrates config loading, health check, and startup logic.

**When to use:** For CLI applications with a single entrypoint. Alternative `[project.scripts]` in pyproject.toml is deferred until a formal command-line interface is needed (Phase 77+).

**Example (src/jarvis_desktop/__main__.py):**

```python
# Source: https://docs.astral.sh/uv/guides/scripts/
import sys
from jarvis_desktop.config import load_config
from jarvis_desktop.health import check_health

def main():
    print("JARVIS Desktop Client — Python")
    config = load_config()
    print(f"Config loaded: {config.dict()}")
    
    health = check_health(config.gateway_url)
    if health["gateway"] == "ok":
        print("Gateway: ✔ online")
    else:
        print(f"Gateway: ✖ offline ({health['backend']})")
    
    print("\nClient running. Press Ctrl+C to exit.")
    try:
        while True:
            pass  # Placeholder — Phase 73 adds chat loop
    except KeyboardInterrupt:
        print("\nShutdown.")
        sys.exit(0)

if __name__ == "__main__":
    main()
```

### Pattern 2: Config Loading with Pydantic BaseSettings

**What:** Config schema defined once (Phase 72) with defaults. Subsequent phases read, never redefine. Sources: environment (.env), JSON file (~/.jarvis/config.json), defaults.

**When to use:** To validate and expose typed configuration. Allows downstream code to import a singleton config object.

**Example (src/jarvis_desktop/config.py):**

```python
# Source: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
import json

class JarvisConfig(BaseSettings):
    """JARVIS desktop client configuration schema (Phase 72+)."""
    
    gateway_url: str = Field(default="http://localhost:3000")
    whisper_model: str = Field(default="tiny")
    tts_provider: str = Field(default="kokoro")
    voice_mode: str = Field(default="ptt")
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

def load_config() -> JarvisConfig:
    """Load config from .env, then ~/.jarvis/config.json (override), then defaults."""
    config = JarvisConfig()
    
    # Load .env first (GATEWAY_URL, etc.)
    config_file = Path.home() / ".jarvis" / "config.json"
    if config_file.exists():
        with open(config_file) as f:
            user_config = json.load(f)
            # Update from user config
            for key, value in user_config.items():
                if hasattr(config, key):
                    setattr(config, key, value)
    else:
        # Create ~/.jarvis/ and write defaults
        config_file.parent.mkdir(parents=True, exist_ok=True)
        with open(config_file, "w") as f:
            json.dump(config.dict(), f, indent=2)
    
    return config
```

### Pattern 3: Health Check Client

**What:** Minimal HTTP wrapper that calls `GET /api/health` on the gateway and reports status.

**When to use:** Startup validation — user sees immediately if the gateway is reachable. Non-blocking on offline.

**Example (src/jarvis_desktop/health.py):**

```python
# Source: Gateway health endpoint (apps/gateway/src/routes/health.ts)
import json
from urllib.request import urlopen
from urllib.error import URLError

def check_health(gateway_url: str) -> dict:
    """Check gateway health. Returns {"gateway": "ok"|"unreachable", "backend": "ok"|"not_ready"|"unreachable"}."""
    try:
        url = f"{gateway_url}/api/health"
        response = urlopen(url, timeout=3)
        data = json.loads(response.read())
        return data
    except (URLError, Exception):
        return {"gateway": "unreachable", "backend": "unreachable"}
```

### Anti-Patterns to Avoid

- **Hardcoded GATEWAY_URL:** Always read from `.env` or config. Never `base_url = "http://localhost:3000"` in code.
- **Redefining config schema in downstream phases:** Phase 72 defines it once; Phases 73-77 only add new fields if needed, never redefine existing ones.
- **Using `pip` directly:** Always use `uv`. uv manages venv, lockfile, and multi-platform consistency.
- **Flat layout instead of src layout:** Flat layout (`apps/desktop-py/jarvis_desktop/`) causes import issues in tests and packaging. Use src layout per D-01.
- **Entry point via [project.scripts] in Phase 72:** Deferred until formal CLI (Phase 77+). Use `__main__.py` now.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Virtual environment management | Custom bash scripts for .venv creation | `uv sync` | uv handles venv, lockfile, platform detection automatically. Avoids "works on my machine" problems. |
| Config file format | Custom TOML/YAML parser | json stdlib + Pydantic BaseSettings | JSON is built-in, Pydantic validates and provides typed access. Avoids parsing bugs and security issues. |
| HTTP calls to gateway | Implement socket-level HTTP | urllib stdlib or httpx | urllib is built-in and sufficient for health check. httpx if async needed (Phase 73+). Don't roll your own. |
| Environment variable loading | Manual os.environ access | python-dotenv | Handles `.env` parsing, missing files, type coercion. Avoids missed quotes, inline comments, special characters. |
| Config persistence | Custom file I/O | Pydantic BaseSettings with json.dump/load | Pydantic validates schema; json.dump handles serialization. Avoids partial writes, schema drift. |

**Key insight:** Dependency management, config parsing, and HTTP communication are deceptively complex (symlink handling, atomic writes, timeouts, retry logic). Use battle-tested libraries.

---

## Common Pitfalls

### Pitfall 1: `.env` not loaded because relative path is wrong

**What goes wrong:** Phase 72 code runs from project root `pnpm dev:desktop-py`, but `.env` is relative to `apps/desktop-py/`. Entry point fails silently or loads wrong GATEWAY_URL.

**Why it happens:** Working directory varies depending on how pnpm invokes the script. Relative paths are fragile.

**How to avoid:** Use `python-dotenv(dotenv_path=...)` with an absolute path constructed from `__file__` or `Path.cwd()`. Better: use environment variable set by pnpm before invoking Python. Or: pnpm cd's to `apps/desktop-py/` before running `uv run`.

**Warning signs:** GATEWAY_URL not found in logs; health check connects to 127.0.0.1:3000 by default instead of configured URL.

### Pitfall 2: Config schema evolves, breaking downstream phases

**What goes wrong:** Phase 73 adds a new config field (e.g., `chat_history_file`). But Phase 72's config loading already wrote defaults to ~/.jarvis/config.json. Phase 73 reads old schema, fails on missing field.

**Why it happens:** Config schema defined in multiple places (Phase 72 defaults, Phase 73 code, user's ~/.jarvis/config.json).

**How to avoid:** (Per D-07) Phase 72 defines complete schema with defaults. Phase 73-77 only *extend* (add new fields), never redefine existing ones. Code reads config, merges with new defaults, writes back.

**Warning signs:** Config mismatch errors after upgrading; downstream phase silently ignores a config field because Phase 72 didn't know about it.

### Pitfall 3: `uv sync` fails because Python 3.12 not installed

**What goes wrong:** User runs `uv sync` on a system with only Python 3.10. uv sees `requires-python = ">=3.12"` and fails.

**Why it happens:** uv requires the specified Python version to be available (or install it via `uv python install`). Not all users have 3.12 pre-installed.

**How to avoid:** Document in README: if `uv sync` fails, run `uv python install` first, or install Python 3.12 system-wide. Alternatively, soften requires-python to ">=3.10" but note that 3.12 is recommended (per CLAUDE.md).

**Warning signs:** "Python 3.12 not found" error from uv; user can't complete PYSETUP-01.

### Pitfall 4: Forgot to add `.env` to .gitignore

**What goes wrong:** Developer commits `.env` with GATEWAY_URL and API keys. Secret leaks to GitHub.

**Why it happens:** Easy mistake during setup. `.env.example` is committed; `.env` should not be.

**How to avoid:** Verify `.gitignore` has `.env` before merging Phase 72 PR. Add `.env.example` instead.

**Warning signs:** Pre-commit hook or CI rejects `.env` commit; developer complains "but it only has localhost URLs".

### Pitfall 5: Windows venv activation not working with pnpm

**What goes wrong:** `pnpm dev:desktop-py` on Windows tries to activate venv but PowerShell execution policy blocks the activation script.

**Why it happens:** pnpm on Windows may inherit parent shell's policies. uv creates venv but pnpm's shell context blocks activation.

**How to avoid:** Use `uv run python -m jarvis_desktop` directly (which uv handles internally) instead of manually activating venv. This is per D-04 — pnpm calls `uv run`, not shell scripts.

**Warning signs:** "cannot be loaded because running scripts is disabled on this system" error; works on Linux/macOS but fails on Windows.

---

## Code Examples

Verified patterns from official sources and CONTEXT.md:

### Config Loading (Pydantic + JSON)

```python
# Source: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
from pathlib import Path
from pydantic import BaseModel, Field
import json
import os

class JarvisConfig(BaseModel):
    gateway_url: str = "http://localhost:3000"
    whisper_model: str = "tiny"
    tts_provider: str = "kokoro"
    voice_mode: str = "ptt"

def load_config() -> JarvisConfig:
    # First: environment variables (GATEWAY_URL, etc.)
    from dotenv import load_dotenv
    load_dotenv("../../.env")  # Root .env
    
    gateway_url = os.getenv("GATEWAY_URL", "http://localhost:3000")
    
    # Second: user config file
    config_file = Path.home() / ".jarvis" / "config.json"
    if config_file.exists():
        with open(config_file) as f:
            user_data = json.load(f)
            config = JarvisConfig(**user_data)
    else:
        config = JarvisConfig(gateway_url=gateway_url)
        config_file.parent.mkdir(parents=True, exist_ok=True)
        with open(config_file, "w") as f:
            json.dump(config.model_dump(), f, indent=2)
    
    return config
```

### Health Check (Stdlib HTTP)

```python
# Source: apps/gateway/src/routes/health.ts pattern
import urllib.request
import json

def check_health(gateway_url: str) -> dict:
    try:
        with urllib.request.urlopen(f"{gateway_url}/api/health", timeout=3) as response:
            return json.loads(response.read())
    except Exception:
        return {"gateway": "unreachable", "backend": "unreachable"}
```

### Entry Point (`__main__.py`)

```python
# Source: https://docs.astral.sh/uv/guides/scripts/
import sys
import signal

def main():
    from jarvis_desktop.config import load_config
    from jarvis_desktop.health import check_health
    
    print("JARVIS Desktop Client — Python 3.12")
    config = load_config()
    print(f"[Config] Gateway: {config.gateway_url}")
    
    health = check_health(config.gateway_url)
    status = "✔ online" if health["gateway"] == "ok" else f"✖ offline ({health['backend']})"
    print(f"[Health] Gateway: {status}")
    
    print("\nPress Ctrl+C to exit.")
    
    def handle_sigint(sig, frame):
        print("\nShutdown.")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, handle_sigint)
    
    try:
        while True:
            # Placeholder — Phase 73 adds chat loop
            pass
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | uv, pyproject.toml | ✗ (user-install needed) | — | Python 3.10+ works; 3.12 recommended (CLAUDE.md) |
| uv | pyproject.toml, uv sync | ✗ (user-install needed) | latest | pip, poetry (slower, different lock format) |
| pip (stdlib distutils) | pyproject.toml build (fallback) | ✓ | stdlib | — |
| urllib (stdlib) | Health check HTTP | ✓ | stdlib | — |
| json (stdlib) | Config file I/O | ✓ | stdlib | — |
| signal, sys (stdlib) | Entry point Ctrl+C | ✓ | stdlib | — |

**Missing dependencies with no fallback:**
- Python 3.12: User must install before `uv sync`. Document in README.

**Missing dependencies with fallback:**
- uv: If unavailable, user can install via `pip install uv` or package manager. Phase 72 assumes uv is installed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x |
| Config file | `pyproject.toml` [tool.pytest.ini_options] (optional — pytest auto-discovers tests/) |
| Quick run command | `pytest tests/test_config.py -v` |
| Full suite command | `pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PYSETUP-01 | `uv sync` creates venv, installs dependencies | integration | Manual (requires system Python 3.12) | ❌ Wave 0 — no test framework setup yet |
| PYSETUP-02 | `pnpm dev:desktop-py` invokes `uv run python -m jarvis_desktop` | integration | Manual (requires pnpm, gateway running) | ❌ Wave 0 |
| PYSETUP-03 | `.gitignore` has `venv/`, `.env` not tracked, `.env.example` has `GATEWAY_URL` | smoke | `grep venv .gitignore` + `git check-ignore .env` | ✅ Manual verification |
| PYSETUP-04 | `~/.jarvis/config.json` created with schema, config loaded on startup | unit | `tests/test_config.py::test_load_config` | ❌ Wave 0 — fixture setup needed |

### Sampling Rate

- **Per task commit:** `pytest tests/test_config.py tests/test_health.py -v` (config + health tests only)
- **Per wave merge:** `pytest tests/ -v` (full suite)
- **Phase gate:** Manual verification — run `pnpm dev:desktop-py`, confirm "Gateway: ✔ online" or "Gateway: ✖ offline", check `~/.jarvis/config.json` exists

### Wave 0 Gaps

- [ ] `tests/conftest.py` — Shared pytest fixtures (mock config file, mock gateway)
- [ ] `tests/test_config.py` — Config loading, defaults, persistence (REQ PYSETUP-04)
- [ ] `tests/test_health.py` — Health check HTTP, offline graceful handling (REQ PYSETUP-02)
- [ ] pytest setup in pyproject.toml: `[tool.pytest.ini_options] testpaths = ["tests"]`
- [ ] Install dev deps: `uv sync --group dev` (pytest added to [project.optional-dependencies])

**Note:** Phase 72 focus is infrastructure setup (D-04-D-14). Testing is secondary (smoke test via manual run). Full test suite deferred to Phase 73+ when chat functionality adds complexity.

---

## Sources

### Primary (HIGH confidence)

- [uv official docs](https://docs.astral.sh/uv/) — Project initialization, dependency management, lockfile, version pinning (verified 2026-05-18)
- [uv creating projects guide](https://docs.astral.sh/uv/concepts/projects/init/) — src layout template, pyproject.toml structure (verified 2026-05-18)
- [Pydantic settings docs](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) — BaseSettings, JSON config source, environment variable loading (verified 2026-05-18)
- CLAUDE.md — Technology Stack section — Python version, pydantic, python-dotenv, rich (project-defined, locked decision)
- CONTEXT.md (Phase 72) — All decisions D-01 to D-14, requirements PYSETUP-01 to PYSETUP-04 (user-locked)
- apps/gateway/src/routes/health.ts — Health endpoint contract (200 OK with {gateway: ok, backend: status}, 503 if backend unreachable)

### Secondary (MEDIUM confidence)

- [Real Python uv guide](https://realpython.com/python-uv/) — uv workflow, venv, lockfile best practices (verified 2026-05-18)
- [uv initialization guide (pydevtools)](https://pydevtools.com/handbook/explanation/understanding-uv-init-project-types/) — Project types, flags (verified 2026-05-18)
- GitHub — astral-sh/uv — Known issue with `uv run __main__.py` and import paths; workaround: use `-m` flag (verified 2026-05-18)

### Tertiary (LOW confidence — for reference only)

- DataCamp uv tutorial — General usage, not authoritative (educational, not official)

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — uv, pydantic, python-dotenv are stable, widely-used, officially documented
- **Architecture patterns:** HIGH — src layout, __main__.py, BaseSettings are standard Python patterns with PEP documentation
- **Common pitfalls:** MEDIUM — Based on general Python/packaging knowledge; some pitfalls inferred from similar projects
- **Environment availability:** MEDIUM — Assumes typical developer environment; exact tool versions may vary by OS

**Research date:** 2026-05-18  
**Valid until:** 2026-06-18 (one month — Python ecosystem stable, uv actively maintained but frequent minor updates)

**Known gaps:**
- Windows-specific PowerShell venv activation behavior not exhaustively tested
- Multi-platform audio dependencies (sounddevice, espeak-ng) deferred to Phase 74+
- CI/CD integration (GitHub Actions) deferred to later phases

