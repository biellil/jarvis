---
phase: 56-always-listening-soak-test
plan: 02
subsystem: testing
tags: [soak-test, qa, http-polling, chart.js, html-report, memory-leak]

# Dependency graph
requires:
  - phase: 56-01
    provides: GET /internal/diagnostics endpoint with heapUsed/rss/eventLoopP99Ms/audioContextCount
provides:
  - apps/desktop/scripts/soak-test.ts — QA-01-compliant HTTP polling soak test with Chart.js HTML report
affects: [56-03, qa, always-listening, soak-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HTTP polling with AbortController timeout (10s) + 3-attempt retry with exponential backoff (2s/4s/6s)"
    - "Chart.js 4.4.0 via CDN for HTML report visualization"
    - "--duration CLI flag for quick smoke tests vs full 8h run"
    - "GATEWAY_URL env var for configurable endpoint targeting"

key-files:
  created: []
  modified:
    - apps/desktop/scripts/soak-test.ts

key-decisions:
  - "SAMPLE_INTERVAL_MS auto-selects: 10s when --duration < 2min, 30min otherwise — zero config for both smoke and full runs"
  - "testPassed flag set to false on any per-sample QA-01 violation (audioContextCount > 1 or p99 > 50ms); delta checks applied at finalReport — this catches transient violations during the run"
  - "generateHtmlReport writes to cwd, not script directory — matches VALIDATION.md execution environment (cd to project root before running)"

patterns-established:
  - "SoakSample replaces MemSample: adds eventLoopP99Ms + audioContextCount fields to match DiagnosticsResponse shape"
  - "HTML report includes 3 charts (heap/RSS, p99, audioContext) + samples table + PASS/FAIL summary section at top"

requirements-completed: [QA-01]

# Metrics
duration: 6min
completed: 2026-05-06
---

# Phase 56 Plan 02: Soak Test Refactor Summary

**HTTP-polling soak test with QA-01 thresholds (100MB heap / 200MB RSS / 50ms p99 / ctx=1) and Chart.js HTML report generated at test completion**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-06T19:39:50Z
- **Completed:** 2026-05-06T19:45:50Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced Phase 44 local `process.memoryUsage()` polling with HTTP polling of `GET /internal/diagnostics`
- Updated all 4 QA-01 thresholds: heap delta FAIL=100MB, RSS delta FAIL=200MB, event loop p99 FAIL=50ms, audioContextCount FAIL >1
- Added `generateHtmlReport()` producing `soak-report-{timestamp}.html` with Chart.js@4.4.0 line charts and dashed threshold lines
- Added `--duration` CLI flag for 1-minute smoke tests (auto-selects 10s sample interval when < 2min)
- Added `GATEWAY_URL` env var support (default: `http://localhost:3000`)
- Added 3-attempt retry with exponential backoff (2s/4s/6s) on HTTP failures

## Task Commits

1. **Task 1: Refactor soak-test.ts — HTTP polling + QA-01 thresholds + HTML report** - `4153227` (feat)

## Files Created/Modified
- `apps/desktop/scripts/soak-test.ts` — Complete rewrite: HTTP polling + 4-metric QA-01 validation + Chart.js HTML report + --duration flag

## Decisions Made
- SAMPLE_INTERVAL_MS auto-selects based on duration: 10s for quick mode (< 2min), 30min for full mode — zero config for both use cases
- testPassed flag accumulates violations per-sample (audioContextCount, p99) AND at finalReport (heap delta, RSS delta) — catches transient violations during long runs
- HTML report written to `process.cwd()` (not script directory) to match the VALIDATION.md execution environment (`node --expose-gc apps/desktop/scripts/soak-test.ts`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — `node --check` syntax validation passed on first write. All 5 post-task verification checks passed.

## Known Stubs

None — all metrics are wired to HTTP polling of `/internal/diagnostics` (from Plan 01). No hardcoded or placeholder data.

## Next Phase Readiness
- `soak-test.ts` is complete and ready for Plan 03 (validation / VALIDATION.md)
- Script requires JARVIS running with `GET /internal/diagnostics` endpoint active (Plan 01)
- Quick smoke test: `node --expose-gc apps/desktop/scripts/soak-test.ts --duration 60000`
- Full 8h run: `node --expose-gc apps/desktop/scripts/soak-test.ts`

---
*Phase: 56-always-listening-soak-test*
*Completed: 2026-05-06*
