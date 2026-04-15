# Phase 32: Backend & Docker Cleanup - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Mode:** Auto-generated (cleanup phase — discuss skipped)

<domain>
## Phase Boundary

Remove the now-superseded audio HTTP endpoints and STT dependency from the backend, now that the IPC path (Phase 31, ARCH-06) is validated E2E:
1. Remove `POST /api/chat/audio` from gateway (apps/gateway)
2. Remove `POST /chat/audio` from backend-ts (apps/backend-ts)
3. Remove `nodejs-whisper` from backend-ts and Dockerfile — smaller Docker image with no runtime STT download

Success criteria:
1. `POST /api/chat/audio` endpoint no longer exists in gateway (INFRA-03)
2. `POST /chat/audio` endpoint no longer exists in backend-ts (INFRA-04)
3. `nodejs-whisper` removed from backend-ts deps and Dockerfile; Docker image builds without STT dependency (INFRA-05)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure cleanup/deletion phase.

Key constraints:
- Phase 31 validated `USE_WHISPER_CPP=true` E2E — safe to delete the replaced code
- `USE_WHISPER_CPP=false` path still uses the HTTP gateway for text chat — only audio endpoints are removed
- backend-ts TTS providers were stubbed in Phase 30 (throw "migrated to Electron main") — those stubs may remain or be cleaned
- No renderer changes needed — sendAudioAndHandle already routes via IPC when flag is set

</decisions>

<code_context>
## Existing Code Insights

### Integration Points
- `apps/gateway/` — Express gateway, routes `/api/chat/audio`
- `apps/backend-ts/` — NestJS backend, routes `/chat/audio`
- `apps/backend-ts/Dockerfile` — Docker image, installs nodejs-whisper
- `apps/backend-ts/package.json` — has nodejs-whisper dependency
- `apps/backend-ts/src/voice/` — voice route, handlers, STT code

### What was stubbed in Phase 30
- `apps/backend-ts/src/voice/tts/` — all TTS providers throw "migrated to Electron main in Phase 30"
- STT backend code may still exist but is unused when USE_WHISPER_CPP=true

</code_context>

<specifics>
## Specific Ideas

No specific requirements — delete what was replaced, keep what's still needed (text chat gateway, backend-ts NestJS API for non-voice).

</specifics>

<deferred>
## Deferred Ideas

None — cleanup phase, no deferred scope.

</deferred>
