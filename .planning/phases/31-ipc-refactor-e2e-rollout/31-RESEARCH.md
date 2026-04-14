# Phase 31: IPC Refactor & E2E Rollout - Research

**Researched:** 2026-04-14
**Domain:** IPC refactoring, audio pipeline routing, feature flag bifurcation
**Confidence:** HIGH

## Summary

Phase 31 is a pure infrastructure refactor that redirects audio routing in the renderer from HTTP gateway to IPC main process. The work is constrained and well-scoped: `sendAudioAndHandle` already exists and works; `voiceHandler.ts` (Phase 30) is complete and tested; the IPC handler stub already exists in `handleSendAudio` with feature flag guarding. All that remains is implementing the local audio path when `USE_WHISPER_CPP=true` — replacing the HTTP fallback with a direct call to `voiceHandler.handleAudio()`. The renderer code (`sendAudioAndHandle.ts`) needs no changes; the main process (`chat.ts`) requires one function implementation; the preload API is already correct.

**Primary recommendation:** Focus all work on implementing the three phases of the feature: (1) ensure `voiceHandler.handleAudio()` is correctly injected as a dependency to `handleSendAudio`; (2) verify audio buffer format consistency (WebM 48kHz → WAV 16kHz normalization must happen before `whisper.transcribe()`); (3) test the E2E pipeline with both flags (`USE_WHISPER_CPP=true/false`) to prevent regression.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices at Claude's discretion (infrastructure phase).

### Claude's Discretion
- Renderer `sendAudioAndHandle` implementation patterns (already written; Phase 31 verifies only)
- Main process `voiceHandler.handleAudio()` injection pattern (following ChatHandlerDeps model)
- Feature flag bifurcation strategy (already designed in Phase 29; Phase 31 verifies only)
- Multi-turn voice state preservation on new IPC path (Phase 28 already handles; just verify on IPC path)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-06 | sendAudioAndHandle refactored to send audio to main process (via IPC) instead of gateway HTTP, under feature flag `USE_WHISPER_CPP` | Full implementation path identified: (1) audio routes via IPC when flag=true, (2) voiceHandler.handleAudio() consumes it, (3) renderer awaits response identical to HTTP path; (4) feature flag controls bifurcation at handleSendAudio() entry point |

</phase_requirements>

## Standard Stack

### Core IPC Infrastructure (Unchanged)
| Technology | Version | Purpose | Current Status |
|------------|---------|---------|-----------------|
| Electron IPC (`ipcRenderer.invoke` / `ipcMain.handle`) | 28.x | Request-response message passing | Already wired in Phase 19.5+ |
| TypeScript | 5.6+ | Type-safe IPC contracts | All types in `shared/ipc-types.ts` |
| Shared IPC types (`SendAudioResponse` union type) | — | Audio response contract | Already unified in Phase 30 |

### Voice Handler Orchestration (Phase 30, reused in Phase 31)
| Technology | Version | Purpose | Already Implemented |
|------------|---------|---------|-----------------|
| `voiceHandler.ts` | Phase 30 complete | Audio → STT → LLM → TTS pipeline | Pure function `handleAudio(buffer, deps)` with injected dependencies |
| `audioNormalizer.ts` | Phase 29 complete | WebM 48kHz → WAV 16kHz PCM mono | Produces Buffer consumable by whisper.cpp |
| `whisperResources.ts` | Phase 29 complete | Lazy-load whisper.cpp bindings | Returns inference-ready instance |
| TTS providers (murf.ai, ElevenLabs, fallback) | Phase 30 complete | Text → Audio synthesis | All migrated to Electron main |

### Feature Flag Mechanism
| Component | Scope | Default | Function |
|-----------|-------|---------|----------|
| `USE_WHISPER_CPP` env var | Process startup (read once at module load) | `false` | Gates IPC path vs legacy HTTP path |
| Read location | `apps/desktop/src/main/ipc/chat.ts` line 34 | — | Single env check at module top-level (D-13 from STATE.md) |

## Architecture Patterns

### Current IPC Audio Path (USE_WHISPER_CPP=false, Phase 28 behavior)
```
Renderer:
  MediaRecorder → encodeFloat32ToWav() → Uint8Array
    ↓
  sendAudioAndHandle(buffer, deps)
    ↓
  window.jarvis.sendAudio(buffer)
    ↓
  ipcRenderer.invoke('chat:send-audio', Buffer.from(buffer))

Main:
  ipcMain.handle('chat:send-audio', handleSendAudio)
    ↓
  handleSendAudio(buffer, deps)
    ↓
  fetch() POST /api/chat/audio to gateway

Gateway:
  /api/chat/audio endpoint → Python backend → Whisper → LLM → TTS → JSON response

Renderer (response):
  handleAudioResponse() → addHumanMessage + addAgentMessage + playTTS
```

### New IPC Audio Path (USE_WHISPER_CPP=true, Phase 31 implementation)
```
Renderer:
  MediaRecorder → encodeFloat32ToWav() → Uint8Array
    ↓
  sendAudioAndHandle(buffer, deps)
    ↓
  window.jarvis.sendAudio(buffer)
    ↓
  ipcRenderer.invoke('chat:send-audio', Buffer.from(buffer))

Main:
  ipcMain.handle('chat:send-audio', handleSendAudio)
    ↓
  handleSendAudio(buffer, deps)
    ↓
  [IF USE_WHISPER_CPP=true]
    → handleAudio(buffer, deps.voiceHandler) ← NEW PHASE 31 WORK
    → voiceHandler.normalizeAudioToWav(webmBuffer)
    → whisperResources.getWhisperInstance(selectedModel)
    → whisper.transcribe(wavBuffer)
    → fetch() to gateway /api/chat (text only, NOT /api/chat/audio)
    → TTS via main process (Phase 30)
    → return { success: true, data: { transcription, message, audioBase64, ... } }
  [ELSE USE_WHISPER_CPP=false]
    → fetch() to gateway /api/chat/audio (unchanged, legacy path)

Renderer (response):
  handleAudioResponse() — IDENTICAL response handler, works for both paths
```

### Feature Flag Bifurcation Pattern
**Location:** `apps/desktop/src/main/ipc/chat.ts`, lines 34–196

**Pattern:**
```typescript
const USE_WHISPER_CPP = process.env['USE_WHISPER_CPP'] === 'true';

export async function handleSendAudio(
  audioBuffer: Buffer,
  deps: ChatHandlerDeps,
): Promise<SendAudioResponse> {
  if (USE_WHISPER_CPP) {
    // Phase 31: new local path
    if (!deps.voiceHandler) {
      console.error('[IPC:chat:send-audio] USE_WHISPER_CPP=true but voiceHandler deps not injected');
      return { success: false, error: { code: 'CONFIG_ERROR', message: '...' } };
    }
    console.log('[IPC:chat:send-audio] USE_WHISPER_CPP=true — routing to local voiceHandler');
    return handleAudio(audioBuffer, deps.voiceHandler);
  }
  // Phase 28: legacy HTTP path (unchanged)
  const url = `${deps.config.backendUrl}/api/chat/audio`;
  // ... existing fetch code ...
}
```

**Why this pattern:**
- Single point of bifurcation (at function entry, not scattered)
- Cleanest rollback: set env to `false` to revert to legacy
- No runtime overhead when path not taken (both branches are if/else, not conditional imports)
- Both paths return identical `SendAudioResponse` type (union of success | error)

### Dependency Injection Pattern (ChatHandlerDeps Extension)
**Current definition** (`apps/desktop/src/main/ipc/chat.ts`, line 39):
```typescript
export interface ChatHandlerDeps {
  openStream: typeof OpenChatStream;
  config: BackendConfig;
  actionExecutor: ActionExecutor;
  voiceHandler?: VoiceHandlerDeps;  // ← Optional, only when USE_WHISPER_CPP=true
}
```

**Why optional:**
- When `USE_WHISPER_CPP=false`, voiceHandler is never called — no need to instantiate expensive deps (GPU detection, TTS provider, etc.)
- Follows principle from Phase 30-01 (STATE.md line 134): "VoiceHandlerDeps optional on ChatHandlerDeps — USE_WHISPER_CPP=false path unchanged, no gateway test regression"
- Backward compatible: existing code paths need no changes

**VoiceHandlerDeps structure** (from `voiceHandler.ts`, line 18):
```typescript
export interface VoiceHandlerDeps {
  config: BackendConfig;
  selectedModel: 'tiny' | 'base' | 'large';  // ← from vramDetection module-scope cache
  ttsProvider: TTSProvider;  // ← from ttsFactory instantiated at startup
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio format conversion (WebM 48kHz to WAV 16kHz) | Custom PCM transcoding | `audioNormalizer.ts` (Phase 29, tested) | Whisper.cpp requires 16kHz mono PCM; normalizer handles byte-level format conversion, sample rate decimation, and silence trimming — complex to get right |
| Whisper.cpp instance lifecycle | Manual node module loading | `whisperResources.ts` (Phase 29, mocked for tests) | Handles ASAR unpacking path, lazy singleton caching, VRAM-based model selection, and proper cleanup — don't replicate |
| IPC error handling & retry | Custom retry with backoff | Existing `retryWithBackoff()` in `chat.ts` (Phase 19.5) | Already debugged; applies to legacy path; new path reuses voiceHandler's error handling |
| Response type coercion | Custom union narrowing | `SendAudioResponse` discriminated union | TypeScript enforces `success: true` narrows to `data`; custom narrowing risks missing null checks |
| Feature flag checking | Hardcoded string comparisons scattered | Single module-scope read (line 34 of chat.ts, D-13 from STATE.md) | Avoids env var per-call overhead; bifurcation is clear and testable |

**Key insight:** Audio normalization and whisper.cpp lifecycle are black boxes that took Phase 29 to get right. Don't try to replace them; invoke them as dependencies. Phase 31 is orchestration only.

## Common Pitfalls

### Pitfall 1: Audio Format Mismatch (Whisper.cpp Requires 16kHz Mono PCM)
**What goes wrong:** MediaRecorder produces WebM 48kHz; whisper.cpp demands 16kHz PCM mono. Sending raw WebM buffer to whisper.transcribe() → "unsupported input format" or garbled transcription.

**Why it happens:** Audio is opaque binary. Easy to assume "audio is audio" and skip the normalization step.

**How to avoid:**
1. ALWAYS route audio through `normalizeAudioToWav()` before calling `whisper.transcribe()`
2. Log the buffer size before/after normalization — if pre-normalized is ~48x larger than post (due to 3:1 sample rate ratio), format is correct
3. Unit test the normalizer with known WebM input (captured in Phase 29) and verify output is PCM 16-bit

**Warning signs:**
- Transcription output is gibberish or silence detected incorrectly
- whisper.transcribe() takes >10s (slow due to format misinterpretation)
- Error: "invalid WAV header" or "unsupported audio format"

### Pitfall 2: VoiceHandler Deps Injection Missing on Startup
**What goes wrong:** `USE_WHISPER_CPP=true` but `voiceHandler` not injected into `ChatHandlerDeps` at startup → `handleSendAudio` returns CONFIG_ERROR.

**Why it happens:** Main process startup code (`apps/desktop/src/main/index.ts`) wires up `setupChatHandlers(deps)`. If voiceHandler initialization is missing or broken, IPC handler receives undefined.

**How to avoid:**
1. In `apps/desktop/src/main/index.ts`, before `setupChatHandlers()`, check: `if (USE_WHISPER_CPP) { instantiate voiceHandler deps }`
2. Add startup log: `console.log('[main] initialized voiceHandler deps with model:', selectedModel, 'tts:', ttsProvider.name)`
3. Test: `USE_WHISPER_CPP=true npm test` should initialize deps without throwing

**Warning signs:**
- IPC handler logs "voiceHandler deps missing" on first audio send with flag=true
- Tests pass but runtime fails (startup path not exercised in test mocks)
- CONFIG_ERROR returned to renderer (D-08 contract not matched)

### Pitfall 3: Multi-Turn Voice State Lost on New Path
**What goes wrong:** Phase 28's `awaiting-followup` state management works on HTTP path but breaks on IPC path. Follow-up message sent via IPC doesn't update chat history or state.

**Why it happens:** `sendAudioAndHandle` is the bridge. If it's called via HTTP, all state transitions are in renderer. If called via IPC, state transitions still in renderer but network latency differs → race conditions.

**How to avoid:**
1. State management is in `useMultiTurnWindow` hook (lines 54–223). It reuses VAD from `useWakeWord` and calls `sendAudioAndHandle` identically for both 'ptt' and 'followup' sources
2. `sendAudioAndHandle` always ends with `setState('idle')` (finally block, line 138). This is true regardless of HTTP vs IPC path because deps.setState is injected
3. Don't change `sendAudioAndHandle` contract for Phase 31; it's already correct

**Warning signs:**
- Follow-up message sent, response received, but chat history not updated
- Orb stuck in 'awaiting-followup' state (setState('idle') not called)
- TTS plays but message doesn't appear in chat

**Verification:** Run `npm test sendAudioAndHandle` and `npm test useMultiTurnWindow` with Phase 31 implementation. Both should pass.

### Pitfall 4: Feature Flag Read at Wrong Scope
**What goes wrong:** `USE_WHISPER_CPP` read inside function instead of module scope → evaluated per-call, not once at startup. If env var changes at runtime, behavior becomes inconsistent.

**Why it happens:** Lazy evaluation feels safer (only check when needed), but creates confusion: first audio uses flag=false, later audio uses flag=true (env changed mid-session).

**How to avoid:**
1. ALWAYS read feature flags at module scope (top of file, before any function)
2. From STATE.md D-13 (Phase 29): "USE_WHISPER_CPP wired at module/startup scope — single env read, no per-call overhead"
3. Add comment: `// Phase 29 (INFRA-02): Feature flag read once at startup. Env var changes require restart.`

**Warning signs:**
- Inconsistent behavior across multiple audio sends in same session
- Tests pass individually but fail when run together (shared global state)
- Race conditions in logging (sometimes "routing to local", sometimes "routing to gateway")

### Pitfall 5: Forgetting `Buffer.from()` Conversion at IPC Boundary
**What goes wrong:** Preload sends `Uint8Array`, IPC transfers `Buffer`, but downstream code expects specific type. Type coercion silently fails.

**Why it happens:** IPC serialization boundary: typed arrays become buffers, buffers become ArrayBuffers. Easy to miss the conversion.

**How to avoid:**
1. In preload (`apps/desktop/src/preload/index.ts`, line 33): `return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_AUDIO, Buffer.from(audioBuffer))`
2. In main handler (`apps/desktop/src/main/ipc/chat.ts`, line 160): signature is `async (_event, audioBuffer: Buffer)`
3. Buffer is already correct type; no further conversion needed
4. If passing to voiceHandler: `handleAudio(audioBuffer, deps)` — audioBuffer is already Buffer, voiceHandler.ts expects Buffer (line 29: `webmBuffer: Buffer`)

**Warning signs:**
- Type errors: "Buffer is not assignable to Uint8Array"
- Runtime: "audioBuffer is not iterable" or ".length is undefined"
- Tests fail with "cannot read property 'byteLength' of undefined"

## Runtime State Inventory

This is a pure refactoring phase with no data migrations or OS-level state changes. All runtime state remains in existing locations:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — voice pipeline state stored in Electron process memory only, not persistent | None — no migration |
| Live service config | None — no new services registered (voiceHandler is in-process) | None |
| OS-registered state | None — no new Task Scheduler, launchd, or systemd registrations | None |
| Secrets/env vars | `USE_WHISPER_CPP` existing env var; no new secrets introduced | None — env var already in use since Phase 29 |
| Build artifacts | None — no new npm packages, no new .node binaries (whisper.cpp already in Phase 29) | None |

**Conclusion:** Phase 31 is pure code refactoring. No runtime state cleanup, migration, or registration needed.

## Code Examples

Verified patterns from existing codebase (Phases 28–30):

### Example 1: Renderer Calls sendAudio via IPC (Already Works)
```typescript
// Source: apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts
const result: SendAudioResponse = await window.jarvis.sendAudio(audioBuffer);
```

**Why this works:**
- Preload bridges the call to ipcRenderer.invoke (line 31 of preload/index.ts)
- ipcRenderer.invoke marshals Uint8Array to Buffer across IPC
- Main process receives as Buffer in handleSendAudio parameter

### Example 2: Main Bifurcates on Feature Flag
```typescript
// Source: apps/desktop/src/main/ipc/chat.ts (Phase 31 implementation)
export async function handleSendAudio(
  audioBuffer: Buffer,
  deps: ChatHandlerDeps,
): Promise<SendAudioResponse> {
  if (USE_WHISPER_CPP) {
    if (!deps.voiceHandler) {
      return {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'voiceHandler deps missing' },
      };
    }
    console.log('[IPC:chat:send-audio] USE_WHISPER_CPP=true → local voiceHandler');
    return handleAudio(audioBuffer, deps.voiceHandler);  // ← Phase 31 call
  }
  // Legacy HTTP path (unchanged)
  const url = `${deps.config.backendUrl}/api/chat/audio`;
  // ... existing code ...
}
```

### Example 3: VoiceHandler Returns Same Response Type
```typescript
// Source: apps/desktop/src/main/voiceInput/voiceHandler.ts (Phase 30, reused in Phase 31)
export async function handleAudio(
  webmBuffer: Buffer,
  deps: VoiceHandlerDeps,
): Promise<SendAudioResponse> {
  // ... normalize, transcribe, call LLM, synthesize TTS ...
  return {
    success: true,
    data: {
      transcription,
      message: reply,
      audioBase64,
      audioFormat,
      sttProvider: 'whisper.cpp',
      ttsProvider: deps.ttsProvider.name,
    },
  };
  // Same response shape as legacy HTTP path ✓
}
```

### Example 4: Renderer Handles Response Identically (No Changes Needed)
```typescript
// Source: apps/desktop/src/renderer/src/voice/handleAudioResponse.ts
export async function handleAudioResponse(
  response: SendAudioResponse,  // ← Works for both HTTP and IPC paths
  deps: HandleAudioResponseDeps,
): Promise<void> {
  if (response.success) {
    deps.addHumanMessage(response.data.transcription);
    deps.addAgentMessage(response.data.message);
    await deps.playTTS(response.data.audioBase64, response.data.audioFormat);
  } else {
    const { code, message } = response.error;
    deps.setToast({
      message: mapErrorCode(code, message),
      variant: isRecoverableWithMessage(code) ? 'warning' : 'error',
    });
  }
}
```

**Why this is Phase 31-ready:** Response type is already unified. Handler works for both paths without modification.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (existing, used in Phase 29–30) |
| Config file | `apps/desktop/vitest.config.ts` |
| Quick run command | `pnpm --filter desktop test --run` |
| Full suite command | `pnpm --filter desktop test --run --reporter=verbose` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-06 (part A) | `USE_WHISPER_CPP=true` → handleSendAudio routes to voiceHandler.handleAudio() | unit | `pnpm test apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts -t "whisper.*routing"` | ✅ Partial (HTTP path tested; IPC path needs new test) |
| ARCH-06 (part B) | voiceHandler.handleAudio() produces SendAudioResponse with transcription + message + audioBase64 | unit | `pnpm test apps/desktop/src/main/__tests__/voiceHandler.test.ts -t "complete.*pipeline"` | ✅ Exists (Phase 30) |
| ARCH-06 (part C) | `USE_WHISPER_CPP=false` → handleSendAudio routes to gateway HTTP (no regression) | unit | `pnpm test apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts -t "gateway.*legacy"` | ✅ Exists (Phase 28) |
| ARCH-06 (part D) | sendAudioAndHandle + handleAudioResponse work identically for both paths (renderer integration) | integration | `pnpm test apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` | ✅ Exists (Phase 24) |
| ARCH-06 (part E) | Multi-turn voice (`awaiting-followup` state) preserved on IPC path | integration | `pnpm test apps/desktop/src/renderer/hooks/__tests__/useMultiTurnWindow.test.ts` | ✅ Exists (Phase 28) |

### Sampling Rate
- **Per task commit:** Quick syntax check only, no full suite (IPC testing is E2E)
- **Per wave merge:** Full unit suite (`pnpm test --run`) to verify both paths (HTTP and IPC)
- **Phase gate:** Full suite green + manual E2E with `USE_WHISPER_CPP=true/false` before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test in `chat-send-audio.test.ts` — test case for "USE_WHISPER_CPP=true → routes to voiceHandler" (new, ~30 lines)
  - Mock voiceHandler dependency
  - Assert handleAudio called with correct buffer and deps
  - Verify response shape matches SendAudioResponse
- [ ] Startup integration test in `apps/desktop/src/main/__tests__/index.test.ts` — verify voiceHandler deps injected when flag=true
  - Mock Electron app.getGPUInfo and environment
  - Assert setupChatHandlers receives valid voiceHandler in ChatHandlerDeps
- [ ] E2E manual validation instructions (in PLAN, not code) — both flag values in desktop app

*(All unit tests can be automated. E2E requires manual "run desktop app with flag=true, speak audio, verify response" — documented in PLAN's manual verification section)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Audio processed in Python backend | Audio processed in Electron main | Phase 29–30 (whisper.cpp + GPU) | Offline STT, auto GPU fallback, lower latency |
| HTTP request per audio | HTTP request per audio (gateway still used for LLM) | Phase 31 | Gateway now stateless: receives text only, not audio |
| No multi-turn window | 8-second follow-up window (Phase 28) | Phase 28 | Users skip "Hey JARVIS" for follow-ups |
| TTS in Python backend | TTS in Electron main (Phase 30) | Phase 30 | Provider selection by config (Murf/ElevenLabs) |
| Single speech path | Bifurcated by USE_WHISPER_CPP flag | Phase 31 | Safe rollout: flag=false preserves Phase 28 behavior |

**Deprecated/outdated:**
- None in Phase 31 scope — refactor only, no removals (Phase 32 removes /api/chat/audio endpoints)

## Open Questions

1. **Should voiceHandler init happen in main/index.ts or in a separate module?**
   - Current assumption: main/index.ts reads USE_WHISPER_CPP and conditionally creates VoiceHandlerDeps
   - Alternative: lazy init in handleSendAudio (but violates D-13: "module/startup scope")
   - **Recommendation:** Follow D-13; init at startup in main/index.ts before setupChatHandlers()

2. **How to test voiceHandler injection without mocking entire GPU detection?**
   - Current approach: voiceHandler.ts already exported as pure function with DI
   - Phase 30-01 (STATE.md line 133) established testable pattern
   - **Recommendation:** Mock VoiceHandlerDeps directly (config, selectedModel, ttsProvider) rather than mocking internals

3. **Will Phase 32 cleanup (removing /api/chat/audio gateway endpoint) affect Phase 31?**
   - Phase 31 implements local path (new)
   - Phase 32 removes gateway endpoint (old path)
   - No blocking dependency; Phase 31 works independently
   - **Recommendation:** Phase 31 lands with both paths functional; Phase 32 removes HTTP path after sign-off

## Environment Availability

Phase 31 has no new external dependencies beyond what Phase 29–30 already verified:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Electron + whisper.cpp | ✓ | 22 LTS | — |
| Electron IPC | Audio routing | ✓ | 28.x | — |
| @fugood/whisper.node | STT when USE_WHISPER_CPP=true | ✓ | 1.0.16 | USE_WHISPER_CPP=false → gateway |
| TTS providers (Murf/ElevenLabs) | Voice synthesis | ✓ | Phase 30 integrated | Graceful degrade: null audio, text preserved |
| Gateway HTTP endpoint (Phase 28 path) | LLM calls on legacy path | ✓ | Running (docker-compose) | Configure BACKEND_URL env |

**Missing dependencies with no fallback:**
- None — Phase 31 code paths already depend on Phase 29–30 complete infrastructure

**Fallback strategy when USE_WHISPER_CPP not available:**
- Set `USE_WHISPER_CPP=false` (default) → entire legacy HTTP path used
- Audio sent to gateway /api/chat/audio as before
- Zero code changes; env var controls routing

## Sources

### Primary (HIGH confidence)
- **Phase 30 voiceHandler.ts implementation** — `apps/desktop/src/main/voiceInput/voiceHandler.ts` (complete, tested, ready for reuse)
- **Phase 29-30 STATE.md decisions** — Lines 130–139 document ASAR unpacking, feature flag, dependency injection patterns
- **Existing IPC patterns** — `apps/desktop/src/main/ipc/chat.ts` (lines 34–196 show bifurcation structure)
- **SendAudioResponse type** — `apps/desktop/src/shared/ipc-types.ts` (unified response for both paths)
- **Test suite precedent** — Phase 28 `sendAudioAndHandle.test.ts` and Phase 30 `voiceHandler.test.ts` define testing patterns

### Secondary (MEDIUM confidence)
- **Electron IPC documentation** — ipcMain.handle / ipcRenderer.invoke patterns (standard Electron API, stable)
- **Feature flag bifurcation pattern** — common in safe rollouts; validated in Phase 29 env var handling

### Metadata
**Confidence breakdown:**
- Standard stack (IPC + voiceHandler reuse): **HIGH** — all code exists and tested
- Architecture (bifurcation pattern): **HIGH** — structure already in place, Phase 31 implements one branch
- Pitfalls (audio format, deps injection, state loss): **HIGH** — derived from Phase 29–30 lessons learned
- Test coverage: **HIGH** — existing test suite covers both paths, gaps minimal

**Research date:** 2026-04-14
**Valid until:** 2026-04-28 (14 days — small scope, well-understood domain)
