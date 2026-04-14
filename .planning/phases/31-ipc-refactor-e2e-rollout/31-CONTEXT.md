# Phase 31: IPC Refactor & E2E Rollout - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Refactor `sendAudioAndHandle` (and related renderer voice hooks) to send audio to the Electron main process via IPC (`send-audio` channel) instead of the HTTP gateway endpoint `/chat/audio`. The pipeline complete: wake word → IPC → STT local → gateway LLM → TTS main → IPC → renderer, with `USE_WHISPER_CPP` feature flag as bidirectional killswitch.

Success criteria:
1. With `USE_WHISPER_CPP=true`, full wake word + PTT → audio response pipeline works E2E (ARCH-06)
2. PTT no regression with `USE_WHISPER_CPP=true`
3. Multi-turn voice (Phase 28 awaiting-followup state) preserved on new IPC path
4. With `USE_WHISPER_CPP=false`, original HTTP gateway path 100% operational

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure/refactor phase. Use codebase conventions, existing IPC patterns, and Phase 30's voiceHandler.ts as the implementation target.

Key technical constraints:
- Renderer sends audio buffer via `ipcRenderer.invoke('send-audio', buffer)` → main `ipcMain.handle('send-audio', ...)` → voiceHandler.handleAudio()
- Feature flag `USE_WHISPER_CPP` must gate the IPC path vs legacy HTTP path in sendAudioAndHandle
- Multi-turn voice window (Phase 28) must be preserved — `awaiting-followup` state transitions unchanged
- No changes to the wake word detection path (Phase 22/24) — only the audio routing after wake

</decisions>

<code_context>
## Existing Code Insights

### Integration Points
- `sendAudioAndHandle` in `apps/desktop/src/renderer/` — current HTTP caller, target for IPC refactor
- `apps/desktop/src/main/voiceInput/voiceHandler.ts` — Phase 30 orchestrator, IPC target
- `apps/desktop/src/main/ipc/chat.ts` — `handleSendAudio` already wired to voiceHandler (Phase 30)
- `apps/desktop/src/main/index.ts` — IPC handlers registration
- Feature flag: `USE_WHISPER_CPP` env var, already used in Phase 29/30

### Established Patterns
- IPC channels: `ipcMain.handle` / `ipcRenderer.invoke` pattern used throughout
- Feature flags: env var check at call site, not at module load
- Phase 28 multi-turn: `awaiting-followup` state in OrbContext, follow-up window logic in renderer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure refactor phase. Refer to ROADMAP phase description, ARCH-06, and Phase 30 implementation as guide.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped (infrastructure).

</deferred>
