---
phase: 72-python-infrastructure-setup
plan: 01
subsystem: infra
tags: [python, uv, pyproject, pytest, pydantic, hatchling, src-layout]

# Dependency graph
requires: []
provides:
  - "apps/desktop-py/ Python src-layout package installable via uv"
  - "pyproject.toml with jarvis_desktop package, Python >=3.12, hatchling build"
  - "uv.lock lockfile (Python 3.12.2, 14 packages resolved)"
  - "@jarvis/desktop-py workspace member with pnpm dev script"
  - "Wave 0 xfail test stubs for config and health (5 tests, all xfailed)"
  - "Shared pytest fixtures: tmp_home, jarvis_config_dir, default_config_dict"
affects: [73-terminal-chat, 74-stt, 75-tts, 76-voice-modes, 77-minimal-ui]

# Tech tracking
tech-stack:
  added:
    - "uv (dependency manager, lockfile generation)"
    - "hatchling (PEP 517 build backend)"
    - "python-dotenv>=1.0.0 (env loading)"
    - "pydantic>=2.7.0 (config schema, required by LangChain)"
    - "pytest>=8.0.0 + pytest-asyncio>=0.23.0 (dev deps)"
  patterns:
    - "src layout: apps/desktop-py/src/jarvis_desktop/"
    - "uv sync --extra dev for dev dependencies"
    - "pytest xfail stubs for Wave 0 (tests written before implementation)"
    - "tmp_home fixture pattern for config isolation in tests"

key-files:
  created:
    - "apps/desktop-py/pyproject.toml"
    - "apps/desktop-py/.python-version"
    - "apps/desktop-py/.gitignore"
    - "apps/desktop-py/package.json"
    - "apps/desktop-py/uv.lock"
    - "apps/desktop-py/src/jarvis_desktop/__init__.py"
    - "apps/desktop-py/tests/__init__.py"
    - "apps/desktop-py/tests/conftest.py"
    - "apps/desktop-py/tests/test_config.py"
    - "apps/desktop-py/tests/test_config_persistence.py"
  modified: []

key-decisions:
  - "hatchling as build backend (not setuptools) — modern, minimal, PEP 517 native"
  - "uv sync --extra dev installs pytest; no separate [tool.uv] group needed"
  - "pytest-asyncio 1.3.0 resolved (newer than 0.23.0 minimum — compatible)"
  - "Wave 0 stubs use xfail (not skip) so pytest counts them and they appear in CI output"

patterns-established:
  - "xfail pattern: stubs written in plan N, implemented in plan N+2, flip to green"
  - "tmp_home fixture: monkeypatches HOME and USERPROFILE for cross-platform config isolation"
  - "uv.lock is committed (not gitignored) — lockfile-first dependency management"

requirements-completed: [PYSETUP-01]

# Metrics
duration: 8min
completed: 2026-05-18
---

# Phase 72 Plan 01: Python Package Scaffold Summary

**uv-managed src-layout Python package `jarvis_desktop` with pyproject.toml, hatchling build, and 5 Wave 0 xfail pytest stubs that pytest discovers with zero errors**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-18T14:39:58Z
- **Completed:** 2026-05-18T14:48:00Z
- **Tasks:** 2 of 2
- **Files modified:** 10 created

## Accomplishments

- `apps/desktop-py/` is a valid Python src-layout package installable via `uv sync` — resolves 14 packages in <1s using Python 3.12.2
- `package.json` declares `@jarvis/desktop-py` with `"dev": "uv run python -m jarvis_desktop"` — workspace membership automatic via pnpm-workspace.yaml `apps/*`
- Wave 0 test scaffold in place: pytest discovers 5 xfail stubs (2 in test_config.py, 3 in test_config_persistence.py) with 0 errors, 0 failures — all xfailed as expected

## Task Commits

1. **Task 1: Create Python package scaffold with pyproject.toml and src layout** - `5b03563` (feat)
2. **Task 2: Create Wave 0 test stubs (conftest + test_config + test_config_persistence)** - `bdde75d` (test)

## Files Created/Modified

- `apps/desktop-py/pyproject.toml` — Package definition, hatchling build, pytest config, runtime + dev deps
- `apps/desktop-py/.python-version` — Pins Python 3.12
- `apps/desktop-py/.gitignore` — Python-specific ignores (venv/, __pycache__/, .pytest_cache/, dist/)
- `apps/desktop-py/package.json` — @jarvis/desktop-py with uv run dev script
- `apps/desktop-py/uv.lock` — Lockfile (14 packages, Python 3.12.2)
- `apps/desktop-py/src/jarvis_desktop/__init__.py` — Package marker with __version__
- `apps/desktop-py/tests/__init__.py` — Empty pytest discovery marker
- `apps/desktop-py/tests/conftest.py` — tmp_home, jarvis_config_dir, default_config_dict fixtures
- `apps/desktop-py/tests/test_config.py` — 2 xfail stubs for load_config defaults and auto-create
- `apps/desktop-py/tests/test_config_persistence.py` — 3 xfail stubs for persistence, partial config, health check

## Decisions Made

- **hatchling over setuptools:** hatchling is modern, minimal, and PEP 517 native. setuptools requires `find_packages` boilerplate; hatchling uses `packages = ["src/jarvis_desktop"]` directly.
- **xfail not skip for Wave 0 stubs:** xfail stubs appear in pytest output and CI counts them. skip would hide them. Plan 03 will flip these from xfail to green by implementing config.py and health.py.
- **uv.lock committed:** lockfile-first approach per RESEARCH.md — avoids dependency drift across machines.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - `uv sync` succeeded on first run using the Python 3.12.2 interpreter already present at `C:\Users\biel1\AppData\Local\Programs\Python\Python312\python.exe`.

## Known Stubs

The following Wave 0 stubs exist by design (xfail markers are intentional):

- `tests/test_config.py::test_load_config_returns_defaults` — awaits `jarvis_desktop/config.py` (Plan 03)
- `tests/test_config.py::test_load_config_creates_config_file` — awaits `jarvis_desktop/config.py` (Plan 03)
- `tests/test_config_persistence.py::test_config_persists_custom_values` — awaits `jarvis_desktop/config.py` (Plan 03)
- `tests/test_config_persistence.py::test_config_missing_fields_get_defaults` — awaits `jarvis_desktop/config.py` (Plan 03)
- `tests/test_config_persistence.py::test_health_check_offline_returns_dict` — awaits `jarvis_desktop/health.py` (Plan 03)

These stubs are intentional Wave 0 scaffolding. Plan 03 implements config.py and health.py to flip them green.

## Next Phase Readiness

- Package scaffold complete — Plan 02 (root scripts integration) and Plan 03 (config + entry point) can proceed
- `uv sync --extra dev` installs both runtime and test dependencies correctly
- pytest discovers tests and exits 0 — CI integration ready

---
*Phase: 72-python-infrastructure-setup*
*Completed: 2026-05-18*
