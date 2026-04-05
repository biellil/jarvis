---
phase: 05-advanced-features
plan: "01"
subsystem: vision
tags: [vision, screenshot, ocr, fallback-chain, tool]
dependency_graph:
  requires: [jarvis.llm.capabilities, jarvis.config]
  provides: [jarvis.tools.vision.analyze_screen, jarvis.core.screen.ScreenAnalyzer]
  affects: [jarvis.tools.__init__, ChatSession (Plan 02)]
tech_stack:
  added: [pyautogui>=0.9.54, pillow>=10.0, pytesseract>=0.3.13]
  patterns: [lazy-import for optional deps, D-04 fallback chain, TDD RED/GREEN]
key_files:
  created:
    - src/jarvis/tools/vision.py
    - src/jarvis/core/screen.py
    - tests/test_vision.py
  modified:
    - pyproject.toml
decisions:
  - "pyautogui imported inside analyze_screen() body — avoids DISPLAY requirement at module import on headless Linux"
  - "analyze_screen @tool is synchronous — callers (ChatSession) MUST use asyncio.to_thread() per ARCH-02"
  - "pytesseract imported inside ScreenAnalyzer.resolve() try block — graceful ImportError handling when not installed"
  - "ScreenAnalyzer accepts optional settings param — enables clean testing without touching env vars"
  - "OCR lang='por+eng' — supports Portuguese (project language) and English"
metrics:
  duration_seconds: 301
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_changed: 4
---

# Phase 05 Plan 01: Vision Building Blocks Summary

Vision foundation for JARVIS: `analyze_screen` @tool captures screenshots as base64 PNG, and `ScreenAnalyzer` implements the D-04 fallback chain (native vision → OCR → cloud → error message).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add vision deps + analyze_screen @tool | c1cfc4e | pyproject.toml, src/jarvis/tools/vision.py, tests/test_vision.py |
| 2 | ScreenAnalyzer with D-04 fallback chain | 95fe126 | src/jarvis/core/screen.py |

## What Was Built

### analyze_screen @tool (`src/jarvis/tools/vision.py`)

LangChain `@tool` decorated function that:
- Imports `pyautogui` inside the function body (never at module level — avoids DISPLAY errors on headless Linux)
- Calls `pyautogui.screenshot()`, converts to PNG via `BytesIO`, encodes as base64
- Returns `{"action": "analyze_screen", "image_base64": "<base64_png>"}`
- Documented contract: callers MUST invoke via `asyncio.to_thread()` for ARCH-02 compliance

### ScreenAnalyzer (`src/jarvis/core/screen.py`)

D-04 fallback chain implementation:

1. **"image" path** — `caps.vision=True`: return `(image, image_b64, None)` — model handles images natively
2. **"ocr" path** — `caps.vision=False` + pytesseract installed + OCR returns text: `("ocr", None, extracted_text)`
3. **"cloud" path** — OCR unavailable or empty + API keys configured: `("cloud", image_b64, "anthropic"|"openai")`
4. **"error" path** — no vision path available: `("error", None, error_message_in_portuguese)`

Key design choices:
- `pytesseract` imported inside `try` block — graceful ImportError if not installed
- OCR uses `lang="por+eng"` for Portuguese + English support
- Accepts injectable `settings` param for clean testing

## Tests

12 tests in `tests/test_vision.py` — all passing:
- 6 tests for `analyze_screen` (dict structure, base64 validity, screenshot called once, no module-level pyautogui)
- 6 tests for `ScreenAnalyzer.resolve()` (all 4 strategy paths + empty OCR case)

Full regression: 224 tests pass, 0 failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pyautogui import fails on headless Linux without DISPLAY**
- **Found during:** Task 1 RED phase execution
- **Issue:** `patch("pyautogui.screenshot", ...)` in tests triggered pyautogui module import, which attempts to connect to X11 DISPLAY. Without DISPLAY env var, test collection crashes with `KeyError: 'DISPLAY'`
- **Fix:** Tests updated to use `patch.dict(sys.modules, {"pyautogui": mock_pyautogui})` pattern — injects mock before any import of the module. Also confirms that the production code's lazy import (inside function body) is the correct design.
- **Files modified:** tests/test_vision.py
- **Commit:** c1cfc4e (included in test file)

**2. [Rule 2 - Missing] OCR empty string falls through to cloud/error correctly**
- **Found during:** Task 2 implementation review
- **Issue:** Plan test description said "OCR empty => error" but with cloud keys configured, it should fall through to cloud. Test was renamed to reflect actual correct behavior: `test_screen_analyzer_ocr_empty_returns_error_or_cloud` (no keys = error, with keys = cloud)
- **Fix:** No code change needed — implementation was already correct; test name clarified.
- **Files modified:** tests/test_vision.py

## Known Stubs

None — all data flows are wired. Plan 02 will wire `analyze_screen` into ChatSession's tool-calling loop.

## Self-Check: PASSED

Files created/exist:
- src/jarvis/tools/vision.py: FOUND
- src/jarvis/core/screen.py: FOUND
- tests/test_vision.py: FOUND

Commits exist:
- c1cfc4e: FOUND (test + task 1 green)
- 95fe126: FOUND (task 2 ScreenAnalyzer)
