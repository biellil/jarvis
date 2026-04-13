---
phase: 28
plan: 02
subsystem: renderer/multi-turn-voice
tags: [voice, multi-turn, vad, tts-hooks, orb-state]
dependency_graph:
  requires:
    - awaiting-followup-visual-state (28-01)
  provides:
    - multi-turn-follow-up-window
  affects:
    - useWakeWord (VAD instance exposure)
    - sendAudioAndHandle (source parameter)
    - App.tsx (hook integration)
tech_stack:
  added: []
  patterns:
    - TTS lifecycle hooks (registerTTSHooks)
    - VAD instance sharing (no re-prompt)
    - Window blur/focus timer management
    - Source tracking for telemetry
key_files:
  created:
    - apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts
  modified:
    - apps/desktop/src/renderer/hooks/useWakeWord.ts
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts
    - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
    - apps/desktop/.env.example
decisions:
  - Reuse VAD from useWakeWord (D-01) — shares MediaStream, no mic re-prompt
  - Register via TTS afterPlay hook (D-14) — natural trigger point after response
  - 250ms delay before window opens (D-16) — respiro natural na conversa
  - Silent timeout transition (D-05) — no toast, smooth fade to idle
  - Pause/resume timer on window blur/focus (D-06) — intelligent UX
  - Source tracking ('followup') for telemetry (D-02) — observability
metrics:
  duration_minutes: 7
  tasks_completed: 5
  files_modified: 6
  commits: 5
  completed: 2026-04-13
---

# Phase 28 Plan 02: Multi-Turn Follow-Up Window Summary

**One-liner:** Multi-turn follow-up window implemented — after TTS response, JARVIS automatically enters 8-second listening state for follow-up questions without requiring "Hey JARVIS" wake word.

## What Was Built

Implemented the complete multi-turn voice follow-up window (MTURN-01/02/03), enabling natural conversational flow where users can continue asking questions immediately after JARVIS responds.

**Hook architecture:** useMultiTurnWindow orchestrates timer, VAD, state transitions, and TTS integration via registerTTSHooks afterPlay callback.

**VAD sharing (D-01):** Reuses MicVAD instance from useWakeWord — shared MediaStream prevents microphone re-prompt and reduces resource overhead.

**Timer management (D-06):** Pause/resume on window blur/focus — respects user context when app loses focus.

**Source tracking (D-02):** Extended sendAudioAndHandle with optional source parameter ('ptt' | 'wakeword' | 'followup') for telemetry and debugging.

**Wake word coordination (D-04):** Existing state gate in useWakeWord automatically suspends wake word engine during awaiting-followup state.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create useMultiTurnWindow hook | be2b576 | useMultiTurnWindow.ts (new) |
| 2 | Integrate useMultiTurnWindow in App.tsx | 86b1fd1 | useWakeWord.ts, App.tsx |
| 3 | Document wake word pause during awaiting-followup | e492f38 | useWakeWord.ts |
| 4 | Extend sendAudioAndHandle source parameter | bab175e | sendAudioAndHandle.ts, useWakeWord.ts, ChatInput.tsx |
| 5 | Add VITE_MULTI_TURN_WINDOW_MS to .env.example | b37539f | .env.example |

## Deviations from Plan

None — plan executed exactly as written.

All tasks completed successfully with no blocking issues, no auto-fixes required, and no architectural changes needed.

## Verification

**Hook integration:**
- `grep "export function useMultiTurnWindow" apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts` shows hook export
- `grep "useMultiTurnWindow" apps/desktop/src/renderer/src/App.tsx` shows hook mounted in AppContent
- `grep "vadInstance.*MicVAD" apps/desktop/src/renderer/hooks/useWakeWord.ts` shows VAD exposure

**TTS integration:**
- `grep "registerTTSHooks.*afterPlay" apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts` shows afterPlay callback
- `grep "setState.*awaiting-followup" apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts` shows state transition

**Timer management:**
- `grep "window.*blur.*focus" apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts` shows pause/resume logic
- Timer cancels immediately on speech start (D-03)
- Silent timeout fallback to idle (D-05)

**Wake word coordination:**
- `grep "D-04.*awaiting-followup" apps/desktop/src/renderer/hooks/useWakeWord.ts` shows documentation
- Existing state gate suspends engine for state !== 'idle' (includes awaiting-followup)

**Source tracking:**
- `grep "source.*ptt.*wakeword.*followup" apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` shows type definition
- `grep "console.log.*source" apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` shows logging
- All three callers (PTT, wake word, follow-up) pass source parameter

**Configuration:**
- `grep "VITE_MULTI_TURN_WINDOW_MS=8000" apps/desktop/.env.example` shows default 8 seconds
- `grep "VITE_MULTI_TURN_ENABLED=true" apps/desktop/.env.example` shows default enabled

## Files Modified

### apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts (NEW)
- Created hook orchestrating multi-turn follow-up window
- D-01: Reuses VAD from useWakeWord (shared MediaStream)
- D-03: Cancels timer immediately on speech start
- D-05: Silent timeout transition without toast
- D-06: Pause/resume timer on window blur/focus
- D-14: Trigger via registerTTSHooks afterPlay
- D-16: 250ms delay before opening window (natural respiro)
- ~223 lines including documentation and error handling

### apps/desktop/src/renderer/hooks/useWakeWord.ts
- Extended UseWakeWordState interface with vadInstance field
- Updated return statement to expose vadRef.current
- Added D-04 documentation comments in state gate useEffect
- VAD instance now accessible to useMultiTurnWindow

### apps/desktop/src/renderer/src/App.tsx
- Imported useMultiTurnWindow hook
- Read VITE_MULTI_TURN_ENABLED and VITE_MULTI_TURN_WINDOW_MS env vars
- Mounted useMultiTurnWindow with VAD from useWakeWord
- Hook integration inside OrbProvider with proper dependencies

### apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts
- Extended SendAudioAndHandleDeps interface with optional source parameter
- Added source logging for telemetry/debug
- Backward-compatible (source is optional, defaults to 'unknown')

### apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
- Updated sendAudioAndHandle call to pass source: 'ptt'
- Completes D-02 source tracking pattern

### apps/desktop/src/renderer/hooks/useWakeWord.ts (D-02)
- Updated sendAudioAndHandle call to pass source: 'wakeword'
- Completes D-02 source tracking pattern

### apps/desktop/.env.example
- Added VITE_MULTI_TURN_WINDOW_MS=8000 (default 8 seconds)
- Added VITE_MULTI_TURN_ENABLED=true (default enabled)
- Comments explain purpose and configuration

## Known Stubs

None — all functionality is fully implemented and production-ready.

The multi-turn window is a complete feature:
- Timer management with pause/resume
- VAD integration with speech detection
- State transitions (awaiting-followup → listening → processing → responding)
- Error handling via sendAudioAndHandle (non-throw, always ends in idle)
- Configuration via env vars

## Implementation Notes

**D-01: VAD Reuse Pattern**

The useMultiTurnWindow hook receives the VAD instance from useWakeWord via props. This is the same MicVAD instance that handles wake word speech detection, sharing the same MediaStream.

Benefits:
- No microphone re-prompt (getUserMedia already called by wake word)
- Resource efficiency (single VAD worklet instead of two)
- Consistent speech detection behavior across wake word and follow-up

**D-14: TTS Hook Trigger Mechanism**

The registerTTSHooks API allows registration of beforePlay/afterPlay callbacks. The afterPlay callback is the natural trigger point for the follow-up window — it fires immediately after TTS audio finishes playing.

Implementation:
```typescript
registerTTSHooks({
  afterPlay: async () => {
    // D-16: 250ms delay before opening window
    setTimeout(() => {
      setState('awaiting-followup');
      void vad.start();
      // Start timeout timer
    }, WINDOW_DELAY_MS);
  },
});
```

**D-16: Natural Respiro (250ms delay)**

The 250ms delay between TTS ending and follow-up window opening reflects natural conversation pacing. Without this delay, the transition would feel jarring — like JARVIS is rushing the user. The delay is intentional UX, not latency.

**D-06: Window Blur/Focus Timer Management**

When the app loses focus (user switches to another window), the timer pauses. When focus returns, the timer resumes from the remaining duration. This prevents the follow-up window from timing out while the user wasn't looking at JARVIS.

Implementation:
- On blur: clearTimeout, store pausedAt timestamp
- On focus: calculate elapsed time, resume with remaining duration
- Edge case: if timer already expired during blur, close window silently

**D-05: Silent Timeout Transition**

When the follow-up window times out without speech, JARVIS transitions to idle silently — no toast notification. This is intentional:
- Toast would be noisy for a normal flow (user simply chose not to continue)
- Crossfade animation (ORB-POL-04) provides subtle visual feedback
- User still sees orb color change (sky-400 → cyan-500)

**D-04: Wake Word Coordination**

The existing state gate in useWakeWord already suspends the wake word engine for ANY non-idle state:
```typescript
if (state === 'idle') {
  void engine.resume();
} else {
  void engine.suspend(); // Includes 'awaiting-followup'
}
```

No additional code needed — 'awaiting-followup' is automatically covered by the existing logic. Added documentation comments to make this explicit.

**D-02: Source Tracking Pattern**

Extended sendAudioAndHandle with optional source parameter:
- 'ptt' — Push-to-talk from ChatInput
- 'wakeword' — Wake word detection from useWakeWord
- 'followup' — Multi-turn follow-up from useMultiTurnWindow

Logged for telemetry/debug purposes. Backward-compatible (optional parameter).

## Next Steps

This plan completes Phase 28 multi-turn voice functionality. The feature is ready for manual verification:

**Integration test (MTURN-01/02/03):**
1. Start JARVIS, say "Hey JARVIS, que horas são?"
2. After TTS response ends, orb transitions to awaiting-followup (sky-400, pulse-followup animation)
3. Say follow-up question within 8 seconds WITHOUT saying "Hey JARVIS"
4. JARVIS processes follow-up and responds
5. If no speech within 8 seconds, orb fades to idle silently (no toast)

**Wake word coordination test (D-04):**
1. During awaiting-followup window, wake word engine is suspended
2. Saying "Hey JARVIS" during follow-up does NOT trigger wake word detection
3. After timeout or speech, wake word resumes normally

**Pause/resume test (D-06):**
1. Enter awaiting-followup state
2. Minimize window (blur)
3. Wait 5 seconds
4. Restore window (focus)
5. Remaining ~3 seconds of window should resume countdown

## Self-Check

**Files exist:**
```
✓ apps/desktop/src/renderer/hooks/useMultiTurnWindow.ts (new)
✓ apps/desktop/src/renderer/hooks/useWakeWord.ts (modified)
✓ apps/desktop/src/renderer/src/App.tsx (modified)
✓ apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts (modified)
✓ apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx (modified)
✓ apps/desktop/.env.example (modified)
```

**Commits exist:**
```
✓ be2b576 — Task 1: Create useMultiTurnWindow hook
✓ 86b1fd1 — Task 2: Integrate useMultiTurnWindow in App.tsx
✓ e492f38 — Task 3: Document wake word pause
✓ bab175e — Task 4: Extend sendAudioAndHandle source parameter
✓ b37539f — Task 5: Add env vars to .env.example
```

**Grep verification:**
```
✓ Hook export: grep "export function useMultiTurnWindow"
✓ TTS integration: grep "registerTTSHooks.*afterPlay"
✓ State transition: grep "setState.*awaiting-followup"
✓ Blur/focus: grep "window.*blur.*focus"
✓ VAD instance: grep "vadInstance.*MicVAD"
✓ Source tracking: grep "source.*ptt.*wakeword.*followup"
✓ Env vars: grep "VITE_MULTI_TURN_WINDOW_MS=8000"
```

## Self-Check: PASSED

All files modified, all commits present, all acceptance criteria met. Feature is complete and ready for manual verification per PLAN.md verification section.
