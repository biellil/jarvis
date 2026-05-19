---
phase: 73-terminal-chat
plan: "01"
subsystem: config
tags: [tdd, config, api-key, test-stubs]
dependency_graph:
  requires: []
  provides: [api_key-field-in-config, wave-0-test-stubs]
  affects: [apps/desktop-py/src/jarvis_desktop/config.py, apps/desktop-py/tests/test_chat.py, apps/desktop-py/tests/test_config.py]
tech_stack:
  added: []
  patterns: [TDD RED-GREEN, xfail stubs for pre-implementation contracts]
key_files:
  created:
    - apps/desktop-py/tests/test_chat.py
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/tests/test_config.py
decisions:
  - "Used xfail(strict=False) for chat stubs so they appear as xfail in CI without blocking"
  - "api_key env load added to Step 2 of load_config() alongside GATEWAY_URL — consistent pattern"
  - "Existing model_fields merge logic handles api_key override from config.json automatically"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-05-18"
  tasks_completed: 2
  files_changed: 3
---

# Phase 73 Plan 01: Config api_key Extension + Wave 0 Test Stubs Summary

JarvisConfig extended with api_key field (D-05/D-06) and Wave 0 xfail test stubs created for the chat module before implementation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 test stubs — test_chat.py and extend test_config.py | 946010e | tests/test_chat.py (created), tests/test_config.py (appended) |
| 2 | Extend JarvisConfig with api_key field and JARVIS_API_KEY env load | a76a73a | src/jarvis_desktop/config.py |

## What Was Built

- **test_chat.py**: 4 xfail stubs (test_parse_sse_tokens, test_buffer_incomplete_sse_line, test_auth_header_conditional, test_gateway_offline_at_startup) — contracts for Plan 02 implementation
- **test_config.py**: 2 new api_key tests (test_api_key_env_load, test_api_key_file_override) — verified GREEN after Task 2
- **config.py**: `api_key: str = Field(default="")` added to JarvisConfig; `os.getenv("JARVIS_API_KEY", "")` loaded in load_config()

## Verification

Full test suite result: `7 passed, 4 xfailed` — all pass or xfail, zero failures.

```
tests/test_chat.py::test_parse_sse_tokens XFAIL
tests/test_chat.py::test_buffer_incomplete_sse_line XFAIL
tests/test_chat.py::test_auth_header_conditional XFAIL
tests/test_chat.py::test_gateway_offline_at_startup XFAIL
tests/test_config.py::test_load_config_returns_defaults PASSED
tests/test_config.py::test_load_config_creates_config_file PASSED
tests/test_config.py::test_api_key_env_load PASSED
tests/test_config.py::test_api_key_file_override PASSED
tests/test_config_persistence.py::test_config_persists_custom_values PASSED
tests/test_config_persistence.py::test_config_missing_fields_get_defaults PASSED
tests/test_config_persistence.py::test_health_check_offline_returns_dict PASSED
```

## Decisions Made

- Used `@pytest.mark.xfail(strict=False)` for chat stubs — they show as xfail in pytest output without blocking CI, and will become passing tests in Plan 02
- api_key env load placed in Step 2 of load_config() alongside GATEWAY_URL for consistency
- No changes to the config.json merge logic — `model_fields.keys()` already includes the new `api_key` field, so config.json override works automatically

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all stubs are intentional Wave 0 xfail contracts for Plan 02. The chat module is not yet implemented; stubs track the contract until implementation.

## Self-Check: PASSED

- `apps/desktop-py/tests/test_chat.py` — FOUND
- `apps/desktop-py/tests/test_config.py` — FOUND (modified)
- `apps/desktop-py/src/jarvis_desktop/config.py` — FOUND (modified)
- Commit 946010e — FOUND
- Commit a76a73a — FOUND
