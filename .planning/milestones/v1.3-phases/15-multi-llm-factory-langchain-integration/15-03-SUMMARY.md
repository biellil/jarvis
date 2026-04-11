---
phase: 15-multi-llm-factory-langchain-integration
plan: 03
subsystem: llm
tags: [validation, startup, capabilities, langchain]
dependency_graph:
  requires: [15-01]
  provides: [version-validation, capability-detection]
  affects: [server-startup]
tech_stack:
  added:
    - "@langchain/core version checking"
    - "Startup validation sequence"
  patterns:
    - "Runtime peer dependency validation"
    - "Non-fatal capability detection"
    - "Fail-fast on version mismatch"
key_files:
  created:
    - apps/backend-ts/src/llm/version-check.ts
    - apps/backend-ts/src/llm/capabilities.ts
    - apps/backend-ts/src/llm/version-check.test.ts
  modified:
    - apps/backend-ts/src/index.ts
decisions:
  - title: "Runtime version validation over build-time checks"
    rationale: "Runtime validation catches Docker and deployment environment issues that build-time checks miss. Validates actual installed packages, not just package.json declarations."
    alternatives: ["pnpm script validation", "pre-commit hook check"]
    outcome: "Implemented validateLangChainVersions() called at startup before server initialization"
  - title: "Non-fatal capability detection"
    rationale: "Per D-13: Capability detection failure shouldn't prevent server startup. Provider being offline is acceptable — server can still run health checks and other functionality."
    alternatives: ["Fatal error on detection failure", "Skip detection entirely"]
    outcome: "Wrapped detectCapabilities() in try-catch with warning log on error"
  - title: "Simplified semver range matching"
    rationale: "Phase 15 scope: major version compatibility check is sufficient. Full semver range parsing (^, ~, >, <) adds complexity without value given stable LangChain.js 1.x ecosystem."
    alternatives: ["Use semver npm package", "Implement full range parser"]
    outcome: "satisfiesRange() checks major version match only (1.x.x compatibility)"
metrics:
  duration: "18m 42s"
  tasks_completed: 3
  files_created: 3
  files_modified: 1
  tests_added: 1
  commits: 3
  lines_added: 230
  completed_at: "2026-04-07T22:03:58Z"
---

# Phase 15 Plan 03: Startup Validation Summary

**One-liner:** LangChain.js version validation and provider capability detection at server startup with fail-fast on version mismatch

## What Was Built

Implemented startup validation sequence that checks LangChain.js package compatibility and detects provider capabilities before initializing the Express server. The validation ensures all `@langchain/*` packages use compatible `@langchain/core` versions, preventing obscure runtime errors from peer dependency mismatches.

**Key components:**
1. **version-check.ts** — Validates `@langchain/core` peer dependency compatibility across all LangChain.js packages
2. **capabilities.ts** — Detects streaming, vision, and function calling support using heuristics matching Python implementation
3. **Startup integration** — index.ts async main() flow with validation gates before server start

## Tasks Completed

| Task | Name | Commit | Files | Status |
|------|------|--------|-------|--------|
| 1 | Create version check module | 61c971e | version-check.ts | ✅ Complete |
| 2 | Create capability detection | a647bf7 | capabilities.ts | ✅ Complete |
| 3 | Integrate validation into startup | 09372e4 | index.ts, version-check.test.ts | ✅ Complete |

## Technical Implementation

### Version Validation Strategy

The validation reads `package.json` files from installed packages using `require.resolve()` to find the actual resolved versions. This catches real deployment issues that package.json peer dependency declarations might miss.

**Validation flow:**
1. Resolve `@langchain/core`, `@langchain/openai`, `@langchain/anthropic` package.json files
2. Extract installed versions and peer dependency requirements
3. Check if installed `@langchain/core` satisfies each provider package's peer dependency range
4. Fail startup with detailed error if mismatch detected

**Example output on success:**
```
Validating LangChain.js versions...
✅ All packages use compatible @langchain/core 1.1.39
```

**Example output on failure:**
```
❌ LangChain.js version mismatch detected:
Core version 1.1.39 does not satisfy: [["@langchain/openai:requires","^2.0.0"]]
Installed versions: { "@langchain/core": "1.1.39", "@langchain/openai": "2.0.0", ... }
```

### Capability Detection Heuristics

Replicates Python's `src/jarvis/llm/capabilities.py` exactly for E2E validation parity:

**LM Studio:** streaming ✓, vision ✗, functions ✓
**OpenAI:** streaming ✓, vision ✓ (for 4o/vision models), functions ✓
**Anthropic:** streaming ✓, vision ✓ (for claude-3 models), functions ✓

Detection is **non-fatal** — server continues if capability detection throws an error. This allows the server to start even if a provider is temporarily unreachable.

### Startup Sequence

Old behavior (Phase 14):
```typescript
const app = createApp();
app.listen(config.backendPort, () => { ... });
```

New behavior (Phase 15-03):
```typescript
async function main() {
  const llmConfig = loadConfig();           // Fail if .env invalid
  const versionCheck = await validateLangChainVersions();
  if (!versionCheck.valid) process.exit(1); // Fail if version mismatch

  try {
    const caps = await detectCapabilities(llmConfig);
    console.log(formatCapabilities(caps));
  } catch (error) {
    console.warn('⚠️ Capability detection failed:', error.message);
    // Continue — non-fatal
  }

  const app = createApp();
  app.listen(config.backendPort, () => { ... });
}
```

## Deviations from Plan

None — plan executed exactly as written.

## Testing

**Unit test:** `version-check.test.ts`
- Validates that `validateLangChainVersions()` successfully resolves installed packages
- Verifies `result.valid === true` in normal case (compatible versions)
- Checks `result.coreVersion` is defined and `result.message` contains '@langchain/core'

**Test execution:**
```bash
cd apps/backend-ts
pnpm test src/llm/version-check.test.ts --run
```

Result: **PASSED** (1/1 tests, 314ms)

## Verification

**Manual verification steps:**
1. Start server: `cd apps/backend-ts && pnpm dev`
2. Observe console output for validation messages
3. Confirm server starts successfully after validation passes
4. Check capability detection output shows expected providers

**Expected console output:**
```
Loading configuration...
Validating LangChain.js versions...
✅ All packages use compatible @langchain/core 1.1.39
Provider capabilities:
  lmstudio: streaming ✓, vision ✗, functions ✓
🚀 Backend-TS listening on port 8001
   Health check: http://localhost:8001/health
   LLM Provider: lmstudio
```

## Known Stubs

None — all functionality is fully wired.

## Integration Points

**Upstream dependencies (Phase 15-01):**
- `loadConfig()` from `llm/config.ts` — Zod validation of env vars
- `LLMConfig` type from `llm/types.ts` — Configuration interface

**Downstream consumers (Phase 15+):**
- Phase 15-04+ will use validated config from `main()` startup
- Phase 17 (ChatSession) will rely on capability detection for feature gating
- Phase 20 (E2E Validation) will verify capability parity with Python

**Cross-cutting:**
- `index.ts` startup sequence is now async — any future startup steps must integrate into `main()` function
- Version validation runs once at startup — no runtime overhead during request handling

## Lessons Learned

1. **TypeScript module resolution quirk:** Imports must use `.js` extension even when importing `.ts` files when `moduleResolution: "node16"`. This is ESM compliance — the import path is the **output** path, not source path.

2. **Peer dependency hell is real:** LangChain.js ecosystem has documented issues (GitHub issues #10168, #1661) with `@langchain/core` version mismatches causing obscure runtime errors. Runtime validation catches this before it causes production issues.

3. **Non-fatal design pattern:** Capability detection being non-fatal (D-13) allows graceful degradation — server can start and serve health checks even if LM Studio is offline. This is critical for monitoring and deployment.

## Requirements Satisfied

- ✅ **LLM-TS-01** — Multi-provider support infrastructure (capability detection layer)
- ✅ **LLM-TS-03** — Version validation at startup prevents peer dependency mismatches

## Files Modified

| File | Changes | Lines | Purpose |
|------|---------|-------|---------|
| apps/backend-ts/src/llm/version-check.ts | Created | +87 | LangChain.js peer dependency validation |
| apps/backend-ts/src/llm/capabilities.ts | Created | +85 | Provider capability detection with Python parity |
| apps/backend-ts/src/llm/version-check.test.ts | Created | +16 | Unit test for version validation |
| apps/backend-ts/src/index.ts | Modified | +42/-3 | Async startup with validation gates |

**Total:** 3 files created, 1 file modified, 230 lines added

## Commits

1. **61c971e** — ✨ feat(15-03): add LangChain.js version validation module
2. **a647bf7** — ✨ feat(15-03): add provider capability detection
3. **09372e4** — ✨ feat(15-03): integrate validation into startup sequence

## Next Steps

**Immediate (Phase 15-04+):**
- Use validated `llmConfig` in factory function initialization
- Wire capability detection results to feature flags (e.g., disable vision endpoints if no vision support)

**Future phases:**
- Phase 17: ChatSession uses capability matrix for intelligent provider routing
- Phase 20: E2E validation verifies Python vs TypeScript capability detection parity

---

**Self-Check: PASSED**

✅ All created files exist:
- `apps/backend-ts/src/llm/version-check.ts`
- `apps/backend-ts/src/llm/capabilities.ts`
- `apps/backend-ts/src/llm/version-check.test.ts`

✅ All commits exist:
- `61c971e` — version validation module
- `a647bf7` — capability detection
- `09372e4` — startup integration

✅ Tests pass:
- `pnpm test src/llm/version-check.test.ts --run` → 1/1 PASSED

✅ TypeScript compiles:
- `npx tsc --noEmit` → No errors

✅ Requirements traced:
- LLM-TS-01: Capability detection implemented
- LLM-TS-03: Version validation at startup implemented
