---
phase: 24-wake-word-full-pipeline-integration
reviewed: 2026-04-12T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - apps/backend-ts/src/voice/tts/murf.ts
  - apps/backend-ts/src/voice/tts/murf.test.ts
  - apps/backend-ts/src/voice/tts/index.ts
  - apps/backend-ts/src/voice/tts/index.test.ts
  - apps/backend-ts/src/voice/ffmpeg-check.ts
  - apps/backend-ts/src/session/chat-session.ts
  - apps/desktop/src/renderer/hooks/useWakeWord.ts
  - apps/desktop/src/renderer/hooks/__tests__/useWakeWord.test.ts
  - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts
  - apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts
  - apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts
  - apps/desktop/src/renderer/src/voice/__tests__/encodeFloat32ToWav.test.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-04-12T12:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 24 closes the wake-word-to-TTS pipeline gap by wiring MicVAD speech detection into `useWakeWord`, introducing a shared `sendAudioAndHandle` function, adding the Murf.ai TTS provider, and creating a browser-safe WAV encoder. Overall code quality is solid: error handling is thorough, the shared pipeline function uses a `finally` block to guarantee idle state, security around API key leakage is explicitly tested, and test coverage is comprehensive across all new modules.

Four warnings were found: a debug `console.log` left in `chat-session.ts` that logs potentially sensitive content, a double `setState('idle')` on the success path in `sendAudioAndHandle`, a missing input validation in `encodeFloat32ToWav`, and a potential state inconsistency in `useWakeWord` where `voiceInputManager.release` runs after `sendAudioAndHandle` (which already sets idle). Four informational items relate to minor code quality observations.

No critical security vulnerabilities were found. The Murf provider correctly avoids leaking the API key in error messages and logs.

## Warnings

### WR-01: Debug console.log in chat-session.ts leaks content to stdout

**File:** `apps/backend-ts/src/session/chat-session.ts:152-156`
**Issue:** The `send()` method contains a debug log that dumps the last 3 messages including sliced `content` (up to 200 chars) and tool call names. This logs user conversation content (potentially sensitive) to stdout in production. The comment says "Debug" but there is no gate (e.g., `DEBUG` env var or log level check). This was likely left from development and should be removed or gated.
**Fix:** Remove the debug block or gate it behind a debug flag:
```typescript
// Remove lines 151-156 entirely, or gate:
if (process.env.DEBUG_AGENT === 'true') {
  const lastMsgs = result.messages.slice(-3);
  for (const m of lastMsgs) {
    // ...existing debug log...
  }
}
```

### WR-02: Double setState('idle') on success path in sendAudioAndHandle

**File:** `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts:107,132`
**Issue:** On the success path, after `handleAudioResponse` completes at line 107, execution falls through to the `finally` block at line 132 which calls `deps.setState('idle')`. But `handleAudioResponse` does not set state to idle -- the caller `sendAudioAndHandle` transitions to `responding` at line 97, then the `finally` always sets `idle`. This means the success path produces: `processing -> responding -> idle` which is correct. However, on the D-08 error path (lines 111-113), the function returns early after `tryHandleD08Error` sets the toast but does NOT set `responding` -- the `finally` then sets `idle`. This means D-08 errors produce: `processing -> idle` (skipping `responding`), which is the intended behavior per the tests. So the logic is actually correct, but the early `return` on line 107 still hits `finally` which is fine. **The real concern**: if `handleAudioResponse` itself calls any setState internally (it does not currently), the double-set would cause a visual flicker. This is fragile -- a future change to `handleAudioResponse` could break the invariant silently.
**Fix:** Add a comment clarifying the `finally` contract, or explicitly set idle before returning on the success path and use a flag to avoid double-set:
```typescript
// Minimal fix: document the contract clearly
} finally {
  // INVARIANTE: always return to idle. This may double-set on success path
  // (responding -> idle) but that's intentional -- belt-and-braces against
  // any downstream function that might throw mid-flight.
  deps.setState('idle');
}
```

### WR-03: encodeFloat32ToWav does not validate sampleRate

**File:** `apps/desktop/src/renderer/src/voice/encodeFloat32ToWav.ts:33-36`
**Issue:** The function accepts any `number` as `sampleRate` including 0, negative numbers, NaN, or Infinity. A zero or negative sample rate would produce a malformed WAV header (byteRate = 0) that would confuse decoders. While the current callers always pass 16000, the function is exported and could be called with invalid values.
**Fix:** Add a guard at the top:
```typescript
export function encodeFloat32ToWav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`encodeFloat32ToWav: invalid sampleRate ${sampleRate}`);
  }
  // ... rest of function
}
```

### WR-04: useWakeWord onSpeechEnd releases voiceInputManager after sendAudioAndHandle, but sendAudioAndHandle already set idle

**File:** `apps/desktop/src/renderer/hooks/useWakeWord.ts:331-340`
**Issue:** In `onSpeechEnd`, `sendAudioAndHandle` is awaited (line 331-336), which internally calls `deps.setState('idle')` in its `finally` block. After that, lines 339-340 call `voiceInputManager.release('wakeword')` and reset the flag. This means there is a window where orb is already `idle` but voiceInputManager still thinks `wakeword` is the active source. If a new wake word detection fires between `setState('idle')` (inside `sendAudioAndHandle`) and `release('wakeword')` (line 339), the new detection would pass the `stateRef === 'idle'` gate but `acquire('wakeword')` might behave unexpectedly (re-acquiring while already held). In practice this window is tiny (microtask-level), but it is a logical inconsistency.
**Fix:** Move the release and flag reset into the deps or call release before the final idle transition. Alternatively, document the race window as acceptable:
```typescript
// Option A: release BEFORE sendAudioAndHandle's finally sets idle
voiceInputManager.release('wakeword');
wakeTriggeredListeningRef.current = false;
await sendAudioAndHandle(wavBytes, { ... });
// But this changes the contract -- release happens before processing completes.

// Option B (preferred): document the acceptable race window
await sendAudioAndHandle(wavBytes, { ... });
// NOTE: sendAudioAndHandle's finally already set idle. The release below
// has a microtask-level race window, but gate 3 (acquire) prevents
// double-acquisition in practice.
voiceInputManager.release('wakeword');
wakeTriggeredListeningRef.current = false;
```

## Info

### IN-01: console.log statements throughout useWakeWord

**File:** `apps/desktop/src/renderer/hooks/useWakeWord.ts:177,183,191,228,251,258,276,311,356`
**Issue:** Multiple `console.log` calls throughout the hook for debugging (detection scores, mic stream info, VAD events). While useful during development, these add noise in production. Consider using a structured logger or gating behind a verbose flag.
**Fix:** Gate behind `import.meta.env.DEV` or a verbose env var.

### IN-02: Murf API URL is hardcoded

**File:** `apps/backend-ts/src/voice/tts/murf.ts:47`
**Issue:** The Murf API endpoint `https://api.murf.ai/v1/speech/generate` is hardcoded. If Murf changes their API URL or the user needs to route through a proxy, there is no way to override it without code changes.
**Fix:** Read from an optional env var with the current URL as default:
```typescript
const url = process.env.MURF_API_URL ?? "https://api.murf.ai/v1/speech/generate";
```

### IN-03: murf.test.ts uses process.env direct assignment instead of vi.stubEnv

**File:** `apps/backend-ts/src/voice/tts/murf.test.ts:4-9`
**Issue:** The test manually clones and restores `process.env` via `{ ...ORIGINAL_ENV }`. The `index.test.ts` file for the same module uses `vi.stubEnv()` which is the modern Vitest pattern and auto-restores via `vi.unstubAllEnvs()`. Using both patterns in the same directory is inconsistent.
**Fix:** Migrate `murf.test.ts` to use `vi.stubEnv` for consistency with `index.test.ts`.

### IN-04: createTTSProvider treats empty ELEVENLABS_API_KEY as absent but empty MURF_API_KEY differently

**File:** `apps/backend-ts/src/voice/tts/index.ts:33,46`
**Issue:** For ElevenLabs (line 33), the check is `!process.env.ELEVENLABS_API_KEY` which treats empty string as falsy (falls back to local). For Murf (line 46), the check is identical `!process.env.MURF_API_KEY` which also treats empty as falsy. The behavior is consistent, but the Murf provider's own `synthesize()` method reads `process.env.MURF_API_KEY` at call time (line 42 of murf.ts), which means if someone sets `MURF_API_KEY` after construction but before the first `synthesize()` call, it would work -- but the factory would have already fallen back to local. This is a minor inconsistency but matches the ElevenLabs pattern, so it is acceptable.
**Fix:** No action needed -- documenting for awareness.

---

_Reviewed: 2026-04-12T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
