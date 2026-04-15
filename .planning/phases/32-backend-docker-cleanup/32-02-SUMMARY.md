---
phase: 32-backend-docker-cleanup
plan: "02"
subsystem: docker
tags: [cleanup, refactor, docker, whisper, vulkan, gpu]
dependency_graph:
  requires:
    - phase: 32-01
      provides: gateway+backend-ts audio endpoints removed, Dockerfile.backend-ts simplified
  provides:
    - INFRA-05 complete — Dockerfile.backend-ts.gpu also stripped of whisper.cpp/Vulkan build
  affects: [Dockerfile.backend-ts.gpu]
tech_stack:
  added: []
  patterns: [dockerfile-cleanup, dead-build-stage-removal]
key_files:
  created: []
  modified:
    - Dockerfile.backend-ts.gpu
key_decisions:
  - "package.json was already clean from Plan 01 — Task 1 confirmed only, no changes needed"
  - "Dockerfile.backend-ts was already clean from Plan 01 — only GPU Dockerfile required edits in this plan"
patterns-established: []
requirements-completed: [INFRA-05]
duration: "5min"
completed: "2026-04-15"
---

# Phase 32 Plan 02: Backend & Docker Cleanup Summary

**Stripped whisper.cpp Vulkan build, ggml-medium.bin model download, binary COPYs, and LD_LIBRARY_PATH from Dockerfile.backend-ts.gpu — GPU image now builds Node.js + SQLite + Vulkan runtime only**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-15
- **Completed:** 2026-04-15
- **Tasks:** 2 (Task 1 confirmed already complete; Task 2 executed)
- **Files modified:** 1

## Accomplishments

- Confirmed apps/backend-ts/package.json already clean (nodejs-whisper, ffmpeg-static, multer removed by Plan 01)
- Confirmed Dockerfile.backend-ts already clean from Plan 01
- Removed git, cmake, build-essential from Dockerfile.backend-ts.gpu builder apt-get (whisper.cpp compile deps)
- Deleted GPU whisper cmake build block (RUN cd nodejs-whisper/cpp...cmake -DGGML_VULKAN=ON)
- Deleted ggml-medium.bin model download + validation block from runtime stage
- Deleted two COPY --from=builder whisper build/ and models/ blocks
- Removed LD_LIBRARY_PATH ENV pointing to whisper shared libs
- Preserved: libvulkan1, vulkan-tools, mesa-vulkan-drivers, curl, ffmpeg, libsqlite3-dev, VK_ICD_FILENAMES

## Task Commits

1. **Task 1: Remove nodejs-whisper, ffmpeg-static, multer from package.json** - already done by Plan 01 (confirmed clean, no commit needed)
2. **Task 2: Strip whisper compilation from both Dockerfiles** - `d706631` (refactor)

**Plan metadata:** (created with this summary)

## Files Created/Modified

- `Dockerfile.backend-ts.gpu` - Removed 30 lines: whisper cmake build (Vulkan), medium model download, validation check, binary COPYs, LD_LIBRARY_PATH

## Decisions Made

None — followed plan as specified. Task 1 was pre-completed by Plan 01; only Dockerfile.backend-ts.gpu required edits.

## Deviations from Plan

None — plan executed exactly as written. The context note in the prompt correctly identified that package.json and Dockerfile.backend-ts were already handled by Plan 01. Dockerfile.backend-ts.gpu edits proceeded per plan spec.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 32 complete — INFRA-03, INFRA-04, INFRA-05 all fulfilled
- Both Dockerfiles (CPU + GPU) are now whisper-free; images build faster and ship smaller
- v1.6 architecture fully realized: all voice processing in Electron, backend-ts is text-only
- Milestone v1.6 Local Voice Pipeline complete

## Self-Check: PASSED

- `grep -E "nodejs-whisper|ffmpeg-static|multer" apps/backend-ts/package.json` → no output (PASS)
- `grep "nodejs-whisper|cmake|ggml-small|ggml-medium|LD_LIBRARY_PATH" Dockerfile.backend-ts` → no output (PASS)
- `grep "nodejs-whisper|cmake|ggml-small|ggml-medium|LD_LIBRARY_PATH" Dockerfile.backend-ts.gpu` → no output (PASS)
- `grep "libvulkan1" Dockerfile.backend-ts.gpu` → present (PASS)
- Commit d706631 exists (PASS)

---
*Phase: 32-backend-docker-cleanup*
*Completed: 2026-04-15*
