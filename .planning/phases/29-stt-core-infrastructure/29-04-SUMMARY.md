---
plan: 29-04
phase: 29-stt-core-infrastructure
status: complete
completed: 2026-04-14
wave: 4
---

# Plan 29-04 Summary — Build Verification + Human PoC Sign-off

## What Was Built

Manual verification checkpoint for Phase 29 PoC. Validated INFRA-01 (ASAR/extraResources packaging) and received human sign-off on GPU detection behavior.

## Task 1: ASAR Packaging Verification (INFRA-01)

**Diagnosis:** Original `asarUnpack` config had no effect because `files: ["!node_modules/**/*"]` + `extraMetadata: {dependencies: {}}` excluded all node_modules from the build. asarUnpack only unpacks files already in the ASAR — it cannot add files.

**Fix applied:**
- `electron.vite.config.ts`: externalized `/^@fugood\//` from Vite bundle (native addons cannot be bundled by Vite/Rollup)
- `electron-builder.yml`: replaced non-functional `asarUnpack` with `extraResources` entries copying `@fugood/whisper.node/lib/`, `node-whisper-win32-x64/index.node`, `node-whisper-win32-x64-cuda/index.node`, `node-whisper-win32-x64-vulkan/index.node` from monorepo root to `resources/node_modules/@fugood/`
- `gpuDetection.ts`: changed to lazy dynamic `import('@fugood/whisper.node')` inside `initializeGpuDetection()` — defers module resolution until after Module.globalPaths setup, and enables vi.mock() interception in tests
- `index.ts`: adds `process.resourcesPath/node_modules` to `Module.globalPaths` before calling `initializeGpuDetection()` in packaged app

**Verification:**
```
release-v2/win-unpacked/resources/node_modules/@fugood/
├── node-whisper-win32-x64/index.node      ✅
├── node-whisper-win32-x64-cuda/index.node ✅
├── node-whisper-win32-x64-vulkan/index.node ✅
└── whisper.node/lib/                       ✅
```

INFRA-01 satisfied. Build completes without errors.

## Task 2: Human PoC Sign-off (STT-01, INFRA-02)

**Human verified (approved 2026-04-14):**
- `USE_WHISPER_CPP=false` (default): PTT and wake word work identically to Phase 28 — no regressions
- `USE_WHISPER_CPP=true`: GPU detection log appears on startup, app does not crash

## All Phase 29 Unit Tests

8/8 tests GREEN after packaging fixes:
- `whisper-gpu-detection.test.ts`: 5/5 ✅
- `whisper-audio-normalizer.test.ts`: 3/3 ✅

## Self-Check: PASSED

- ✅ INFRA-01: .node binaries accessible in packaged app via extraResources
- ✅ STT-01: GPU detection runs at startup when USE_WHISPER_CPP=true
- ✅ INFRA-02: USE_WHISPER_CPP=false preserves Phase 28 behavior (human verified)
- ✅ Phase 29 PoC signed off — Phase 30 may proceed
