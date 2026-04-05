---
phase: 05-advanced-features
plan: 02
subsystem: vision-pipeline
tags: [vision, hot-reload, multimodal, llm-routing, async, tool-calling]
dependency_graph:
  requires: [05-01, 04-03]
  provides: [vision-routing, hot-reload-llm, multimodal-send, screenshot-cli]
  affects: [session.py, factory.py, tools/__init__.py, __main__.py]
tech_stack:
  added: []
  patterns:
    - asyncio.to_thread for blocking tool invocation (ARCH-02)
    - ScreenAnalyzer fallback chain (image -> OCR -> cloud -> error)
    - pydantic-settings hot-reload via Settings() re-instantiation
    - Module-level imports for create_llm/Settings to enable clean mocking
key_files:
  created:
    - src/jarvis/core/screen.py
    - src/jarvis/tools/vision.py
    - tests/test_session_vision.py
  modified:
    - src/jarvis/core/session.py
    - src/jarvis/llm/factory.py
    - src/jarvis/tools/__init__.py
    - src/jarvis/__main__.py
decisions:
  - "Settings and create_llm imported at module level in session.py for testability — avoids local imports that break patch targets"
  - "Hot-reload uses Settings() re-instantiation (pydantic-settings reads .env on each new instance) — no manual os.environ polling needed"
  - "analyze_screen tool invoked via asyncio.to_thread in the tool loop — consistent with all tools for ARCH-02 compliance"
  - "Cloud LLM created temporarily only for vision cloud fallback — never replaces self.llm (LLM-03)"
metrics:
  duration: "~45 minutes"
  completed_date: "2026-04-05"
  tasks: 3
  files: 7
---

# Phase 5 Plan 02: Vision Pipeline Integration Summary

**One-liner:** Multimodal ChatSession with image= param, ScreenAnalyzer vision routing (image/OCR/cloud fallback), asyncio.to_thread tool invocation (ARCH-02), LLM hot-reload (LLM-04), and /screenshot CLI command.

## What Was Built

This plan wires the vision building blocks from Plan 01 into the conversation engine. Three requirements close here:

- **VISION-01**: ChatSession.send() accepts image=b64 and builds multimodal HumanMessage; analyze_screen tool results route through ScreenAnalyzer (not ActionExecutor); /screenshot CLI command captures screen and sends to session.
- **LLM-03**: Intelligent routing — vision tasks go to vision-capable model (or OCR/cloud fallback); non-vision tasks always use the configured local model without any cloud LLM instantiation.
- **LLM-04**: Hot-reload — ChatSession detects .env model changes between send() calls and rebuilds LLM via create_llm(settings_override=fresh) without requiring restart.

### Architecture

```
user: /screenshot what is this?
  │
  ├─ __main__.py: asyncio.to_thread(pyautogui.screenshot) [ARCH-02]
  │   └─ session.send(query, image=b64)
  │       └─ HumanMessage(content=[{type:text}, {type:image_url}])
  │
  ├─ OR LLM calls analyze_screen tool
  │   └─ asyncio.to_thread(tool.invoke, args) [ARCH-02]
  │       └─ ScreenAnalyzer.resolve(image_b64, caps)
  │           ├─ strategy="image" → HumanMessage with image_url [local vision model]
  │           ├─ strategy="ocr"   → HumanMessage with OCR text [no image sent]
  │           ├─ strategy="cloud" → temporary cloud_llm for one ainvoke() call [LLM-03]
  │           └─ strategy="error" → HumanMessage with error message
  │
  └─ Hot-reload check on every send():
      Settings() → new_model != _current_model_id → create_llm(settings_override=fresh)
```

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend create_llm() with settings_override, add analyze_screen to ALL_TOOLS | c3de641 | factory.py, tools/__init__.py, tools/vision.py, core/screen.py |
| 2 | Extend ChatSession.send() with image=, vision routing, hot-reload, ARCH-02 | 12d9607 | core/session.py, tests/test_session_vision.py |
| 3 | Add /screenshot CLI command to __main__.py | ee75de6 | __main__.py |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing Plan 01 output files in this worktree**
- **Found during:** Task 1
- **Issue:** `src/jarvis/tools/vision.py` and `src/jarvis/core/screen.py` existed in the main repo but not in this parallel worktree (Plan 01 was executed in a different agent)
- **Fix:** Copied the files from the main repo into this worktree
- **Files modified:** src/jarvis/tools/vision.py, src/jarvis/core/screen.py
- **Commit:** c3de641

**2. [Rule 1 - Bug] test_ptt_tts.py expected exactly 4 TTS calls (now 5)**
- **Found during:** Task 3 full regression check
- **Issue:** test_ptt_tts.py hardcoded `tts_calls == 4`; adding /screenshot added a 5th `await tts.speak(response)` call
- **Fix:** Updated assertion from 4 to 5, updated comment to mention /screenshot path
- **Files modified:** tests/test_ptt_tts.py
- **Commit:** e657e09

**3. [Rule 1 - Bug] test_tools_pc_control.py expected ALL_TOOLS to have 9 elements**
- **Found during:** Task 3 full regression check
- **Issue:** `test_all_tools_has_nine_elements` hardcoded 9; adding analyze_screen made it 10
- **Fix:** Renamed test to `test_all_tools_has_ten_elements`, updated assertion and comment
- **Files modified:** tests/test_tools_pc_control.py
- **Commit:** e657e09

**4. [Rule 2 - Missing critical] Settings/create_llm imported at module level for testability**
- **Found during:** Task 2 implementation
- **Issue:** Plan specified local imports inside send() (`from jarvis.config import Settings`), which makes `patch("jarvis.core.session.Settings")` impossible since the name isn't in module namespace
- **Fix:** Moved both imports to module level in session.py; tests then use `patch("jarvis.core.session.Settings")` and `patch("jarvis.core.session.create_llm")` correctly
- **Files modified:** src/jarvis/core/session.py
- **Commit:** 12d9607

## Test Coverage

| Test | What It Verifies |
|------|-----------------|
| test_create_llm_no_args_backward_compatible | create_llm() without args uses global settings |
| test_create_llm_settings_override_used | create_llm(settings_override=...) uses override |
| test_all_tools_contains_analyze_screen | ALL_TOOLS has 10 tools including analyze_screen |
| test_send_with_image_builds_multimodal_message | image=b64 builds HumanMessage with image_url content list |
| test_analyze_screen_tool_routes_to_vision_not_executor | analyze_screen bypasses executor, routes to ScreenAnalyzer |
| test_ocr_fallback_injects_text | OCR strategy injects "Texto extraido da tela via OCR" |
| test_hot_reload_rebuilds_llm_on_model_change | LLM rebuilt when _current_model_id changes |
| test_hot_reload_no_rebuild_when_same_model | create_llm NOT called when model unchanged |
| test_non_vision_send_uses_local_model_only | Plain text send() never creates cloud LLM (LLM-03) |
| test_tool_invocation_uses_asyncio_to_thread | asyncio.to_thread called for tool invocation (ARCH-02) |

**Total: 222 tests, 0 failures (10 new + 212 existing)**

## Known Stubs

None — all vision routing paths are fully wired. The cloud fallback path (strategy="cloud") creates a real temporary LLM using the configured API key; it's only reached when: (1) model has no vision capability, (2) pytesseract OCR returns empty, (3) cloud API key is configured.

## Self-Check: PASSED

All created/modified files exist. All commits found:
- 66aa328: test(05-02): add failing tests (TDD RED)
- c3de641: feat(05-02): create_llm() settings_override + ALL_TOOLS + Plan 01 files
- 12d9607: feat(05-02): ChatSession.send() vision routing, hot-reload, ARCH-02
- ee75de6: feat(05-02): /screenshot CLI command
- e657e09: fix(05-02): update test counts for /screenshot addition
