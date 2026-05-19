---
phase: 72-python-infrastructure-setup
plan: 02
subsystem: infra
tags: [python, pnpm, monorepo, gitignore, env]

requires:
  - phase: 72-01
    provides: apps/desktop-py/package.json with @jarvis/desktop-py name

provides:
  - Root package.json dev:desktop-py script wired to @jarvis/desktop-py
  - venv/ excluded from git alongside .venv/ so uv virtualenvs are never committed
  - GATEWAY_URL documented in .env.example for Python client developers

affects: [72-03, any phase that runs pnpm dev or adds Python tooling]

tech-stack:
  added: []
  patterns:
    - "pnpm --filter @jarvis/desktop-py dev pattern for running Python workspace app"

key-files:
  created: []
  modified:
    - package.json
    - .gitignore
    - .env.example

key-decisions:
  - "Added venv/ without dot alongside .venv/ — uv creates .venv/ by default but venv/ may also appear depending on config"
  - "GATEWAY_URL placed in Gateway section of .env.example matching GATEWAY_PORT=3000 value"

patterns-established:
  - "All workspace apps follow pnpm --filter @jarvis/<name> dev pattern for targeted dev scripts"

requirements-completed: [PYSETUP-02, PYSETUP-03]

duration: 5min
completed: 2026-05-18
---

# Phase 72 Plan 02: Monorepo Wiring Summary

**dev:desktop-py script wired in root package.json, venv/ added to .gitignore, and GATEWAY_URL documented in .env.example — pure config plumbing for Python client integration**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-18T14:30:00Z
- **Completed:** 2026-05-18T14:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Root workspace now has `dev:desktop-py` script so `pnpm dev:desktop-py` works once Plan 01 creates the app
- Both `.venv/` and `venv/` are excluded from git — uv-created Python virtualenvs cannot be accidentally committed
- `GATEWAY_URL=http://localhost:3000` documented in .env.example so Python client developers know the required variable

## Task Commits

1. **Task 1: Add dev:desktop-py script to root package.json** - `18358fd` (feat)
2. **Task 2: Update .gitignore with venv/ and add GATEWAY_URL to .env.example** - `375616c` (chore)

## Files Created/Modified

- `package.json` - Added `"dev:desktop-py": "pnpm --filter @jarvis/desktop-py dev"` after dev:desktop
- `.gitignore` - Added `venv/` after `.venv/` in Python virtualenv section
- `.env.example` - Added `GATEWAY_URL=http://localhost:3000` in Gateway section

## Decisions Made

- Placed `venv/` immediately after `.venv/` — co-located so the intent is clear (both cover virtualenv patterns)
- `GATEWAY_URL` value `http://localhost:3000` matches `GATEWAY_PORT=3000` in same file — consistent, no guessing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Once Plan 01 (72-01) creates `apps/desktop-py/package.json` with `@jarvis/desktop-py` name, `pnpm dev:desktop-py` will resolve and launch the Python client
- `.env.example` addition gives developers a clear signal to add `GATEWAY_URL` to their `.env`

---
*Phase: 72-python-infrastructure-setup*
*Completed: 2026-05-18*

## Self-Check: PASSED

- FOUND: `.planning/phases/72-python-infrastructure-setup/72-02-SUMMARY.md`
- FOUND: commit `18358fd` (feat: add dev:desktop-py script)
- FOUND: commit `375616c` (chore: add venv/ and GATEWAY_URL)
