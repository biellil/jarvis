---
phase: quick-260514-sjn
plan: 01
subsystem: build
tags: [electron-builder, rollup, externals, build-fix]
dependency_graph:
  requires: []
  provides: ['open package externalized in electron.vite.config.ts']
  affects: [main-process-build, preload-build]
tech_stack:
  added: []
  patterns: [rollup-externalization]
key_files:
  created: []
  modified: [apps/desktop/electron.vite.config.ts]
decisions:
  - Added 'open' to MAIN_EXTERNALS following existing pattern
  - Positioned after kokoro-js, before sharp to maintain grouping
  - Added explanatory comment about platform-specific child process calls
metrics:
  duration: "5 minutes"
  completed: "2026-05-14T23:38:19Z"
  tasks: 1
  commits: 1
---

# Quick Task 260514-sjn: Add 'open' to MAIN_EXTERNALS Summary

**One-liner:** Externalized 'open' package in Rollup config to prevent bundling of platform-specific child process code

## Task Completed

**Task 1: Add 'open' to MAIN_EXTERNALS array**
- Added 'open' string to MAIN_EXTERNALS array (line 103)
- Positioned after 'kokoro-js' and before 'sharp'
- Added explanatory comment: "Platform-specific child process calls — cannot be bundled"
- Maintains alphabetical-like grouping pattern with existing entries

## Verification Results

### Automated Checks
✅ 'open' appears in MAIN_EXTERNALS array (line 103)
✅ Main bundle builds successfully (860KB output at dist/main/index.js)
✅ Preload bundle builds successfully (9.33KB at dist/preload/index.js)
✅ Config file maintains proper formatting and comments

### Build Status
- **Main process:** ✅ Built successfully (860.02 kB)
- **Preload scripts:** ✅ Built successfully (index.js 9.33 kB, settings.js 3.67 kB)
- **Renderer process:** ⚠️ Failed due to pre-existing lucide-react dependency issue (unrelated to this task)

## Implementation Details

The 'open' package uses platform-specific child process calls to open URLs and files in the system's default application. Similar to other native or system-dependent packages (electron-store, onnxruntime-node, kokoro-js, sharp), it must be externalized so it's not bundled by Rollup and can execute properly at runtime.

### Change Made
```typescript
const MAIN_EXTERNALS = [
  'electron',
  /^node:/,
  /^@fugood\//,
  'bufferutil',
  'utf-8-validate',
  /^onnxruntime-node/,
  '@huggingface/transformers',
  'kokoro-js',
  'open', // Platform-specific child process calls — cannot be bundled
  'sharp', // Phase 63: native addon — Rollup cannot bundle .node binaries (D-10)
];
```

## Deviations from Plan

None - plan executed exactly as written.

## Out of Scope Issues Discovered

**Missing lucide-react dependency**
- **Location:** apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
- **Issue:** Renderer build fails because lucide-react is imported but not installed
- **Action:** Documented in deferred-items.md
- **Reasoning:** Pre-existing issue unrelated to 'open' externalization task. Main and preload bundles (where 'open' is used) built successfully, confirming our change works correctly.

## Success Criteria Met

✅ Build process completes without errors in main/preload bundles
✅ 'open' package is properly externalized
✅ Config file maintains readability with existing pattern
✅ No Rollup warnings about 'open' external dependency

## Commit

**2119216:** 🔧 chore(260514-sjn): add 'open' to MAIN_EXTERNALS array

## Self-Check

### Files Exist
✅ FOUND: apps/desktop/electron.vite.config.ts (modified)
✅ FOUND: .planning/quick/260514-sjn-adicionar-open-lista-main-externals-em-a/deferred-items.md (created)

### Commits Exist
✅ FOUND: 2119216

### Build Verification
✅ Main bundle built: dist/main/index.js (860KB)
✅ Preload bundle built: dist/preload/index.js (9.33KB)

## Self-Check: PASSED

All files created/modified as expected. Commit exists in git history. Build verification confirms the 'open' package externalization works correctly (main and preload bundles built successfully).
