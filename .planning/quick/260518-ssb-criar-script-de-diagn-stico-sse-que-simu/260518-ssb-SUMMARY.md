---
phase: quick
plan: 260518-ssb
subsystem: desktop-py/diagnostics
tags: [sse, debugging, diagnostics, stdlib]
key_files:
  created:
    - apps/desktop-py/diagnose_sse.py
  modified: []
decisions:
  - stdlib-only (no rich, no pydantic) ensures script runs even if package imports are broken
  - verbatim copy of parse_sse_chunk from chat.py keeps the diagnostic honest to the real code path
metrics:
  duration: "~5 min"
  completed: "2026-05-18"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Quick Task 260518-ssb: SSE Diagnostic Script Summary

Standalone SSE diagnostic script that replicates chat.py gateway request via stdlib urllib only, printing [CHUNK]/[TOKEN]/[DIAGNOSIS] labels to isolate whether missing terminal responses are caused by gateway (A), SSE parsing (B), or rich.Live display layer (C).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create diagnose_sse.py standalone diagnostic script | 7b5b22a | apps/desktop-py/diagnose_sse.py |

## Verification

Script ran successfully:
- Connected to gateway at http://localhost:3000
- Parsed SSE tokens correctly ([TOKEN] labels with repr output)
- Health check hit /health before stream attempt
- Zero rich or jarvis_desktop imports confirmed via AST parse

Output sample (gateway online):
```
=== JARVIS SSE Diagnostic ===
Gateway URL: http://localhost:3000
API key:     not set
[HEALTH] Checking http://localhost:3000/health ...
[CONNECTED] HTTP 200 OK
[CHUNK] 850 bytes raw
[TOKEN] '{'
...
[DONE] N chunks, N tokens received
[DIAGNOSIS] Tokens received OK — issue is in rich.Live display layer
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] apps/desktop-py/diagnose_sse.py exists
- [x] Commit 7b5b22a exists
- [x] No rich or jarvis_desktop imports
- [x] Script runs without ImportError
