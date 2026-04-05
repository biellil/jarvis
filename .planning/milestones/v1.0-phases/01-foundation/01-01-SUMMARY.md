---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [python, pyproject, pydantic-settings, pytest, langchain, langgraph]

# Dependency graph
requires: []
provides:
  - Installable Python package (pip install -e . works)
  - pydantic-settings Settings singleton importable from jarvis.config
  - pyproject.toml with exact version pins and ARCH-03 lower bounds
  - .env.example template with all config keys (D-06 through D-09)
  - Directory structure: src/jarvis/{core,llm,platform} + tests/
  - 17 pytest test stubs for all Phase 1 requirements (xfail, exit 0)
affects: [01-02, 01-03, 01-04]

# Tech tracking
tech-stack:
  added:
    - langchain==1.2.14
    - langgraph==1.1.4
    - langchain-openai==1.1.12
    - langchain-anthropic==1.4.0
    - langchain-core>=1.2.22 (ARCH-03 pin)
    - langgraph-checkpoint-sqlite>=3.0.1 (ARCH-03 pin)
    - pydantic==2.12.5
    - pydantic-settings==2.13.1
    - python-dotenv==1.2.2
    - rich==14.3.3
    - loguru==0.7.3
    - httpx==0.28.1
    - pytest==9.0.2
    - pytest-asyncio==1.3.0
  patterns:
    - pydantic-settings BaseSettings singleton for all config (never os.environ directly)
    - src-layout with setuptools packages.find where=["src"]
    - pytest xfail stubs for TDD-style future implementation

key-files:
  created:
    - pyproject.toml
    - .env.example
    - .gitignore
    - src/jarvis/__init__.py
    - src/jarvis/__main__.py
    - src/jarvis/config.py
    - src/jarvis/core/__init__.py
    - src/jarvis/llm/__init__.py
    - src/jarvis/platform/__init__.py
    - tests/__init__.py
    - tests/conftest.py
    - tests/test_llm_factory.py
    - tests/test_capabilities.py
    - tests/test_session.py
    - tests/test_startup.py
    - tests/test_platform.py
  modified: []

key-decisions:
  - "Used setuptools.build_meta (not setuptools.backends.legacy:build) — older setuptools on system requires canonical backend"
  - "pip install with --break-system-packages and --ignore-installed needed on Debian-managed Python to bypass typing_extensions conflict"

patterns-established:
  - "Pattern: Import `from jarvis.config import settings` everywhere — never read os.environ directly"
  - "Pattern: Use Settings.model_construct() in tests to bypass validation and .env loading"
  - "Pattern: pytest.mark.xfail with reason pointing to implementing plan number for all unimplemented stubs"

requirements-completed:
  - ARCH-03

# Metrics
duration: 8min
completed: 2026-04-02
---

# Phase 1 Plan 1: Project Scaffold and Config Layer Summary

**Installable jarvis package with pydantic-settings config layer, ARCH-03 version pins, and 17 xfail test stubs covering all Phase 1 requirements**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-02T18:31:14Z
- **Completed:** 2026-04-02T18:39:15Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Python package installable via `pip install -e .[dev]` with all LangChain/LangGraph dependencies
- `Settings` singleton importable from `jarvis.config` with LLM_PROVIDER, LM_STUDIO_URL, and API key fields
- 17 pytest stubs collected for LLM-01, LLM-02, CONV-01, ARCH-01, ARCH-03, ARCH-04 — all xfail, suite exits 0
- ARCH-03 security pins enforced as lower bounds: `langchain-core>=1.2.22`, `langgraph-checkpoint-sqlite>=3.0.1`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project scaffold, pyproject.toml, and install dependencies** - `425cc11` (build)
2. **Task 2: Create Settings config class and test stubs for all Phase 1 requirements** - `007ca25` (test)

**Plan metadata:** (to be added after SUMMARY commit)

## Files Created/Modified

- `pyproject.toml` - Project packaging, dependencies, entry points, pytest config
- `.env.example` - Config template with all env vars (LLM_PROVIDER, LM_STUDIO_URL, API keys)
- `.gitignore` - Excludes .env, __pycache__, dist/, .pytest_cache/
- `src/jarvis/__init__.py` - Package version `__version__ = "0.1.0"`
- `src/jarvis/__main__.py` - Entry point placeholder (main() -> pass)
- `src/jarvis/config.py` - pydantic-settings BaseSettings singleton
- `src/jarvis/core/__init__.py` - Empty sub-package init
- `src/jarvis/llm/__init__.py` - Empty sub-package init
- `src/jarvis/platform/__init__.py` - Empty sub-package init
- `tests/__init__.py` - Empty test package init
- `tests/conftest.py` - mock_settings and mock_env fixtures
- `tests/test_llm_factory.py` - 5 xfail stubs for LLM-01
- `tests/test_capabilities.py` - 4 xfail stubs for LLM-02
- `tests/test_session.py` - 3 xfail stubs for CONV-01
- `tests/test_startup.py` - 3 xfail stubs for ARCH-03/ARCH-04
- `tests/test_platform.py` - 2 xfail stubs for ARCH-01

## Decisions Made

- **Build backend:** Used `setuptools.build_meta` instead of `setuptools.backends.legacy:build` — the newer API form requires setuptools>=68.3 which was not available on the system Python (Debian-managed). The canonical `build_meta` works with all setuptools>=40.
- **Pip flags:** Installation required `--break-system-packages --ignore-installed` due to Debian-managed Python 3.12 having a system `typing_extensions` with no RECORD file. This is acceptable on a development machine.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed build-backend in pyproject.toml**
- **Found during:** Task 1 (pip install)
- **Issue:** `setuptools.backends.legacy:build` raised `ModuleNotFoundError: No module named 'setuptools.backends'` — this API requires setuptools>=68.3 but only setuptools 68.0 was available
- **Fix:** Changed to `setuptools.build_meta` (canonical backend, compatible with all modern setuptools)
- **Files modified:** pyproject.toml
- **Verification:** pip install succeeded after fix
- **Committed in:** 425cc11 (Task 1 commit)

**2. [Rule 3 - Blocking] Installed pip via apt before project install**
- **Found during:** Task 1 (attempting pip install)
- **Issue:** Neither `pip` nor `pip3` were on PATH; python3 had no `ensurepip` module
- **Fix:** Ran `apt-get install -y python3-pip` to bootstrap pip, then used `python3 -m pip`
- **Files modified:** None (system package install)
- **Verification:** `python3 -m pip --version` returned pip 24.0
- **Committed in:** N/A (no repo files changed)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary to complete installation. No scope creep.

## Issues Encountered

- Debian-managed Python 3.12 required `--break-system-packages` and `--ignore-installed` flags for pip install due to system typing_extensions conflict. This is expected behavior on Debian/Ubuntu for development use outside a virtualenv.

## User Setup Required

None — no external service configuration required. API keys remain empty until user configures their preferred LLM provider.

## Next Phase Readiness

- Plan 01-02 (LLM factory) can now import `from jarvis.config import settings` and start implementing `jarvis.llm.factory`
- Plan 01-03 (session loop) and 01-04 (startup/platform) both have their test stubs ready
- All test stubs contain the full expected implementation contract — removing `xfail` after implementation should make them pass without changes to test logic

## Self-Check: PASSED

- All 16 created files verified to exist on disk
- Commits 425cc11 and 007ca25 verified in git log
- `python3 -c "from jarvis.config import settings"` exits 0
- `python3 -m pytest tests/ -x -q` exits 0 (17 xfailed)

---
*Phase: 01-foundation*
*Completed: 2026-04-02*
