---
phase: 70-llm-config-migration
reviewed: 2026-05-12T15:27:16Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - .env.example
  - apps/backend-ts/src/app.ts
  - apps/backend-ts/src/llm/config.test.ts
  - apps/backend-ts/src/llm/config.ts
  - apps/desktop/package.json
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  - apps/desktop/src/main/ipc/index.ts
  - apps/desktop/src/main/ipc/settings.ts
  - apps/desktop/src/main/migrations/__tests__/llm-config.test.ts
  - apps/desktop/src/main/migrations/llm-config-runner.ts
  - apps/desktop/src/main/migrations/llm-config.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/main/__tests__/store.test.ts
  - apps/desktop/src/preload/settings.ts
  - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-05-12T15:27:16Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 70 cleanly migrates LLM provider/API key configuration from electron-store (plaintext JSON, ~644 perms) to `.env` (managed by the user, typically 600). The implementation is well-structured: the pure function `migrateLlmConfigToEnv()` is fully covered by 9 scenario tests, the boot hook in `index.ts` runs the migration **before** `process.loadEnvFile()` (D-04), atomic write uses tmp file + `renameSync` (T-70-02) with cleanup on failure (T-70-03), and batch store delete uses `store.store = next` (T-70-04). The Zod schema correctly uses `z.preprocess` instead of the broken `z.coerce.boolean()` for `USE_LM_STUDIO_STREAMING_EVENTS` (Open Question 1), and the backend cleanup (deleted reload-llm/mcp-client routes) has no orphan references in renderer or preload code.

The most material finding is a **Critical security/data-loss issue**: when the migration succeeds in copying API keys from electron-store to `.env`, the store's keys are deleted but the original electron-store JSON file (which already had the plaintext keys) is never sanitized via `app.getPath('userData')` overwrite or filesystem-level purge — and the new `.env` is written with `writeFileSync(..., 'utf-8')` using the process's default umask, which on a fresh install typically yields `0644` (world-readable) rather than `0600`. This regresses the very privacy posture the migration was designed to improve.

Secondary issues are concentrated around: edge cases in `setTtsVoiceId('kokoro', ...)` typing vs. legacy `extractStoreValue` returning `''` (skipped) vs `undefined` (skipped) which are equivalent but obscure intent, a few dead comments/imports, and inconsistencies in the renderer's dirty-tracking shape.

No performance issues flagged (out of scope per v1).

## Critical Issues

### CR-01: New `.env` written with default umask — does not enforce 0600 file mode

**File:** `apps/desktop/src/main/migrations/llm-config-runner.ts:51-55`
**Issue:** The whole rationale of Phase 70 (per CONTEXT.md / SIMP-03 / SIMP-04) is to move plaintext API keys from electron-store JSON (typically `0644`, world-readable on shared systems) into `.env`, which is "managed by the user with stricter perms (600)." However, the migration writes the new `.env` via:

```ts
writeFileSync(tmpPath, result.newEnvContent, 'utf-8');
renameSync(tmpPath, envPath);
```

`writeFileSync` honors the process umask (typically `022`), producing a file with mode `0644` on most Linux/macOS installs. On systems where the user has not pre-created `.env` with `chmod 600`, the API keys are now in a world-readable location — actively **worse** than the electron-store JSON, because `.env` lives at the monorepo root rather than the OS-hidden `~/.config/<App>/config.json`.

This is a privacy/security regression for the primary goal of the migration.

Additionally, the original electron-store JSON file still contains the plaintext keys until the next `store.set/get` round-trip persists the post-delete state. `electron-store` writes on `set`, so `store.store = current` will persist a sanitized JSON; however, the **on-disk historical content is not wiped** (no `fs.fdatasync` after the JSON rewrite, no overwrite of the old key bytes). On most filesystems the old bytes will eventually be reclaimed, but in the interim a forensic read of free blocks could recover them. For a single-user privacy-first assistant this is acceptable, but the user-visible `.env` mode issue is not.

**Fix:**

```ts
// In runLlmConfigMigration, when writing the new .env:
import { writeFileSync, renameSync, chmodSync, statSync } from 'node:fs';

if (result.migratedKeys.length > 0) {
  const tmpPath = `${envPath}.tmp-${process.pid}`;
  try {
    // Preserve existing .env mode if present, else default to 0o600 (owner read/write only).
    // On Windows, chmodSync is a no-op (mode bits ignored); ACL inheritance applies.
    const existingMode = (() => {
      try { return statSync(envPath).mode & 0o777; } catch { return 0o600; }
    })();
    writeFileSync(tmpPath, result.newEnvContent, { encoding: 'utf-8', mode: existingMode });
    // Defensive: chmod after write in case mode option was clamped by umask.
    if (process.platform !== 'win32') chmodSync(tmpPath, existingMode);
    renameSync(tmpPath, envPath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch {}
    throw err;
  }
}
```

For the historical electron-store JSON exposure: after the batch delete (`store.store = current`), log a one-time warning that recommends the user run `chmod 600 .env` and delete `~/.config/<App>/config.json` if they want a hard purge. This matches the "privacy by configuration" stance in CLAUDE.md.

## Warnings

### WR-01: `setTtsVoiceId('kokoro', ...)` accepted but mock test asserts kokoro returns 'voice-elev-99' (test bug, not code bug)

**File:** `apps/desktop/src/main/ipc/__tests__/settings.test.ts:303-319`
**Issue:** In the test `'settings:get returns ttsVoiceIds with murf and elevenlabs keys (QUICK-260427-tjc)'`, the mock implementation returns the elevenlabs string for `provider !== 'murf'`:

```ts
getTtsVoiceIdMock.mockImplementation((provider) =>
  provider === 'murf' ? 'pt-BR-yago' : 'voice-elev-99',
);
```

The assertion then claims kokoro should equal `'voice-elev-99'`:

```ts
expect(result.ttsVoiceIds).toEqual({
  murf: 'pt-BR-yago',
  elevenlabs: 'voice-elev-99',
  kokoro: 'voice-elev-99', // mock returns 'voice-elev-99' for non-murf providers
});
```

This is technically passing only because the mock collapses `elevenlabs` and `kokoro` into the same arm. The test does not actually verify that the production code asks for `kokoro` independently. The mock should differentiate the three providers so a regression where the handler omits `kokoro: getTtsVoiceId('kokoro')` from the response would be caught.

**Fix:**

```ts
getTtsVoiceIdMock.mockImplementation((provider) => {
  switch (provider) {
    case 'murf':       return 'pt-BR-yago';
    case 'elevenlabs': return 'voice-elev-99';
    case 'kokoro':     return 'kokoro-default';
    default:           return '';
  }
});

expect(result.ttsVoiceIds).toEqual({
  murf: 'pt-BR-yago',
  elevenlabs: 'voice-elev-99',
  kokoro: 'kokoro-default',
});
expect(getTtsVoiceIdMock).toHaveBeenCalledWith('kokoro');
```

This is in the scope of Phase 70 because Phase 70 deletes LlmSection/McpSection and re-asserts the canonical `settings:get` shape — this test is the contract test for that shape.

### WR-02: `extractStoreValue` returns `snap.llmProvider` directly without empty-string guard

**File:** `apps/desktop/src/main/migrations/llm-config.ts:108-110`
**Issue:** The `llmProvider` case is the only one without an `'' length > 0` guard:

```ts
case 'llmProvider':
  return snap.llmProvider;
```

If the electron-store somehow contains `llmProvider: ''` (e.g., user manually edited JSON, or a previous bug wrote `setLlmProvider('')`), this function returns `''`. Then the upsert path produces `LLM_PROVIDER=` in `.env`, which the backend Zod schema treats as missing → default `'lmstudio'`. Functionally OK, but inconsistent with the other cases and would produce a `migratedKeys: ['LLM_PROVIDER']` entry that wrote an empty value — confusing in the migration log.

The `TypeScript` type prevents this in well-behaved callers (`LlmProvider` excludes `''`), but `store.get('llmProvider')` is cast via `as LlmStoreSnapshot['llmProvider']` in `llm-config-runner.ts:31` — TypeScript does not enforce the cast at runtime.

**Fix:**

```ts
case 'llmProvider':
  return snap.llmProvider && snap.llmProvider.length > 0 ? snap.llmProvider : undefined;
```

This aligns with the pattern used for `lmStudioUrl`, `geminiApiKey`, etc. and makes the migration deterministic against a corrupted store.

### WR-03: `setupProactiveIpc` mounted twice on `/api/settings` and `/api/proactive` (orphan from Phase 67)

**File:** `apps/backend-ts/src/app.ts:40-41`
**Issue:**

```ts
app.use("/api/proactive", createProactiveRouter());
app.use("/api/settings", createProactiveRouter());
```

The same router is mounted on two different prefixes. This is an unrelated bug to Phase 70 but the file was modified/touched here. It's not strictly an orphan from the LLM cleanup (`/api/settings` is for proactive `apply-quiet-hours` etc.), but `createProactiveRouter()` is called twice, creating two separate Express Router instances with their own middleware chains. If the router has any startup side effects (timers, subscriptions, file watchers) they'll run twice.

Verify by reading `routes/proactive.ts` — if `createProactiveRouter()` is a pure factory returning a fresh Router, this is benign but wasteful. If it instantiates singletons (e.g., quiet-hours scheduler), this is a real bug introducing duplicate work.

**Fix:** Either reuse a single router instance:

```ts
const proactiveRouter = createProactiveRouter();
app.use("/api/proactive", proactiveRouter);
app.use("/api/settings", proactiveRouter);
```

Or, preferably, split the router into two factories so the `/api/settings` mount only exposes the proactive-settings endpoints and the `/api/proactive` mount only exposes the SSE stream + ack — which matches the intent in the existing comments.

### WR-04: Race window between migration write and `process.loadEnvFile` if migration throws after `renameSync`

**File:** `apps/desktop/src/main/index.ts:17-30`
**Issue:** The boot hook wraps `runLlmConfigMigration(envPath)` in try/catch and logs non-fatal on failure:

```ts
try {
  runLlmConfigMigration(envPath);
} catch (err) {
  console.error('[migration] LLM config migration failed (non-fatal):', err);
}

try {
  process.loadEnvFile(envPath);
} catch { /* .env is optional */ }
```

If the migration partially completes (e.g., `renameSync` succeeded but `store.store = current` threw because electron-store's JSON file got locked by another process), then:

1. The new `.env` has the keys (good)
2. The electron-store still has the keys (because batch delete threw)
3. Next boot: the migration runs again, sees `.env` has non-empty values → "skipped" path (D-02) → marks keysToDelete → tries batch delete again

This is **idempotent and self-healing** (good — D-03), but the user-visible log on the failing boot will say `LLM config migration failed (non-fatal)` with no indication that the keys *were actually written* to `.env`. If the user investigates, they'll be confused why `.env` already has the values.

Also: `renameSync` throwing after `writeFileSync` succeeded leaves an orphan `.env.tmp-<pid>` — the catch block in `llm-config-runner.ts:56-64` calls `unlinkSync(tmpPath)`, which is correct, but the re-thrown error reaches `index.ts:17-22` which only logs.

**Fix:** Make the migration completion message include which steps succeeded:

```ts
// In llm-config-runner.ts, separate the two side-effects so callers can distinguish:
} catch (err) {
  // T-70-03 cleanup
  try { unlinkSync(tmpPath); } catch {}
  throw new Error(`[migration] .env write failed (keys NOT persisted): ${err}`);
}

// Then for the store cleanup:
try {
  store.store = current as never;
} catch (err) {
  throw new Error(`[migration] .env written but store cleanup failed (will retry next boot): ${err}`);
}
```

This makes the user-visible failure mode actionable.

## Info

### IN-01: `getTtsVoiceId('kokoro')` returns string but kokoro has no API key — handler iterates over kokoro for `setTtsVoiceId` too

**File:** `apps/desktop/src/main/ipc/settings.ts:105-111`
**Issue:** The save handler iterates `Object.entries(request.ttsVoiceIds)` and calls `setTtsVoiceId(provider as 'murf' | 'elevenlabs' | 'kokoro', id)`. Kokoro doesn't use a voice ID in the same way (it's a local model with a fixed default voice), and `setTtsVoiceId('kokoro', x)` persists to a store key that is read by `getTtsVoiceId('kokoro')` but probably ignored by the kokoro provider factory. Not a bug — just dead-effort.

**Fix:** Either:
- Add a comment explaining that kokoro voice IDs *are* used (kokoro supports 54 voices per CLAUDE.md — `af_bella`, etc.), in which case ignore this finding; or
- Filter kokoro out of the iteration if the kokoro provider hardcodes its voice.

### IN-02: `parseDotenv` silently swallows duplicate KEY= lines

**File:** `apps/desktop/src/main/migrations/llm-config.ts:70`
**Issue:** `parse(envContent)` returns only the **last** value for duplicate keys (verified via Node REPL: `parse("A=1\nA=2") → {A:"2"}`). The `upsertEnvKey` regex replaces only the **first** match (`String.prototype.replace` with non-`g` flag). If a user's `.env` somehow has two lines `LLM_PROVIDER=lmstudio` followed by `LLM_PROVIDER=openai`, the migration would:

1. `parsed['LLM_PROVIDER']` returns `'openai'` (last wins) → treated as non-empty → skip migration
2. Or if both are empty, upsert replaces only the first → second empty line remains

This is an extremely unusual edge case but worth a comment in the function header noting "single-line, single-occurrence keys only — duplicate KEY= lines are not handled."

**Fix:** Add a comment, or harden by using `String.prototype.replaceAll` with a `g` flag:

```ts
const lineRegex = new RegExp(`^${escapeRegex(key)}=.*$`, 'gm');
return content.replace(lineRegex, line);
```

Caveat: `gm` replaceAll would normalize duplicates into identical lines. Probably fine; the user can dedupe manually.

### IN-03: Unused `BackendClient` reference + dead comments

**File:** `apps/desktop/src/main/store.ts:274-330`
**Issue:** Block comments referring to "Phase 70 (SIMP-04) — LLM config lives in .env now" and "Accessors removidos em Phase 70 (SIMP-04)" are valuable rationale and should stay. However, lines 326-330 contain `// ============================================================` separators with empty body — these are visual leftovers from deleted accessors. Consider collapsing to a single one-liner pointing readers to `apps/backend-ts/src/llm/config.ts`.

**Fix:** Minor cleanup; not blocking.

### IN-04: Dirty-tracking in `SettingsLayout` omits screenshotHotkey

**File:** `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx:226`
**Issue:**

```ts
const formValues = { pttHotkey, ttsProvider, ttsApiKey, whisperModel, ttsVoiceIds, kokoroLocalOnly };
const dirty = JSON.stringify(formValues) !== JSON.stringify(initialSettings);
```

`screenshotHotkey` is **not** in `formValues` but `handleScreenshotHotkeyChange` calls `window.settings.save(...)` immediately on change (apply-without-restart). That's consistent with `vadThresholdMs` and `wakeWordThreshold` (also excluded). However, `kokoroLocalOnly` is in `formValues` *and* is applied directly via `await window.settings.save({ kokoroLocalOnly: v })` in the section prop handler (lines 391-394) — inconsistent. The Save button does nothing for `kokoroLocalOnly` because changes are already persisted.

This is unrelated to Phase 70 but the file was touched.

**Fix:** Either remove `kokoroLocalOnly` from dirty tracking (since it's apply-on-change), or remove the in-handler `save()` and rely on the Save button. Recommend the former for consistency with `screenshotHotkey`/`vadThresholdMs`.

### IN-05: `getOrCreateClientId` placement — touched by store.ts but unrelated to LLM migration

**File:** `apps/desktop/src/main/store.ts:332-346`
**Issue:** The accessor block for `getOrCreateClientId()` is sandwiched between Phase 53 (Streaming TTS) and Phase 63 (Screenshot hotkey), with no obvious reason for its location. Not introduced or modified by Phase 70 — flagged only to note that the surrounding section dividers (multiple `// ============================================================`) make the file harder to navigate as Phase 70 removed several large accessor blocks. A future cleanup pass could group related accessors.

**Fix:** Defer to future refactor — not blocking.

---

## Cross-cutting verification (verified, no findings)

- **No orphan references** to deleted store keys (`llmProvider`, `lmStudioUrl`, `geminiApiKey`, `openaiApiKey`, `anthropicApiKey`, `streamingLMStudioEventsEnabled`) outside the migration module itself. Verified via grep across `apps/desktop/src/` and `apps/backend-ts/src/`.
- **No orphan references** to deleted UI components (`LlmSection`, `McpSection`, `mcp-settings`, `reload-llm`, `llm-settings`). Only one comment reference to "McpSection pattern" in `ProactiveSection.tsx` which is harmless prose.
- **Migration ordering** — `runLlmConfigMigration` runs at top of `index.ts` (line 18) before `process.loadEnvFile(envPath)` (line 27). D-04 satisfied.
- **Idempotency** — verified by test `idempotent — second run no-op after store cleanup` (`llm-config.test.ts:71-78`) and by `hasAnything` early return in `llm-config-runner.ts:43-44`.
- **Atomic write semantics** — tmp file in same directory as target, then `renameSync` (POSIX atomic on same FS). Cleanup in catch via `unlinkSync`. Correct pattern.
- **Batch store delete** — `store.store = current` results in one electron-store write. Verified.
- **`z.preprocess` for `USE_LM_STUDIO_STREAMING_EVENTS`** — verified the fix for Zod's broken `z.coerce.boolean()`. Test coverage in `config.test.ts:150-185` is comprehensive (string "true", string "false", missing, boolean literal).
- **No hardcoded secrets** in any reviewed file.
- **No `eval`, `innerHTML`, or injection vectors** in any reviewed file.
- **Node 24 + Electron 41** — `process.loadEnvFile` is available (Node 21+).

---

_Reviewed: 2026-05-12T15:27:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
