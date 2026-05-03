---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Settings UX
status: executing
last_updated: "2026-05-03T04:39:49.688Z"
last_activity: 2026-05-03 -- Plan 48-02 complete
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-30)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 48 — design-system-foundation

## Current Position

Phase: 48 (design-system-foundation) — EXECUTING
Plan: 3 of 3 (next)
Status: Plan 48-02 complete — Plan 48-03 next (Field/HotkeyRecorder/Progress + barrel)

Last activity: 2026-05-03 -- Plan 48-02 complete (5 primitives shipped: Button/Input/Label/Select/Slider)

Progress: [███░░░░░░░] 33%

## Milestone History

Last completed: v1.9 Voice Capture Modes (6 phases, 20 plans, shipped 2026-04-30). See `.planning/milestones/v1.9-ROADMAP.md`.

## Accumulated Context

### Decisions

Carry-forward patterns from v1.9:

- Strategy pattern para captura de voz: WakeWordStrategy, AlwaysListeningStrategy, PttOnlyStrategy
- EventEmitter pub/sub para desacoplar tray, voiceInputManager e IPC de mode changes
- electron-store como single source of truth para voiceMode (default: 'wake-word')
- State machine com flag `transitioning` para evitar race conditions em mode switch
- Ring buffer pre-roll 500ms em Always-Listening para preservar primeiros fonemas
- Intent classifier local (multilingual-e5-small Transformers.js) — privacidade preservada
- OrbContext voiceMode via IPC subscription com cleanup correto
- crossfade useEffect watches [state, voiceMode] — pitfall crítico documentado
- Mode-switch toast autoCloseMs: 2000 (action toasts: 0ms)
- macOS permission gate via toast acionável "Abrir System Settings"
- [Phase 45]: PTT hotkey guard via setVoiceModeManager injection and createPttToggleCallback factory — null-safe, no circular import
- [Phase 45]: Mock objects must expose all symbols used by the module under test — missing setVoiceModeManager in ptt-hotkey mock caused unhandled Vitest error
- [Phase 46]: Mel normalization corrected to x/10 + 2 — sign inversion was root cause of near-zero classifier scores for all audio
- [Phase 46]: WakeWordEngine tests need @vitest-environment happy-dom annotation + inputNames/outputNames on all 4 session mocks (mel, embed, vad, kw)
- [Phase 46]: VAD gate is intentionally disabled (Silero requires raw audio, not embeddings); test 5 updated to reflect this architectural decision
- [Phase 47-01]: Settings window 480 → 600px width; space-y-8 inter-section gaps; mb-4 on h2 headers; space-y-4 inside TtsProviderSelect — human-verified and approved
- [Phase 48]: [Phase 48-02]: Authored 5 UI primitives (Button/Input/Label/Select/Slider) manually after shadcn CLI failed silently on Tailwind v4. Used ring-destructive/30 (token+opacity) instead of literal rgba for Input error focus.

### v2.0 Bugs Known

- **PTT guard missing**: ptt-hotkey.ts emite `ptt:action` independente do voice mode atual. ChatInput.tsx inicia gravação mesmo em wake-word mode. Fix: checar voiceModeManager.getMode() === 'ptt-only' antes de emitir.
- **Whisper model override ignored**: main/index.ts define selectedModel via VRAM mas nunca lê getWhisperModelOverride() do store. Settings salva mas valor é ignorado. Fix: aplicar override pós-VRAM-detection.
- **Wake word reliability**: ROOT CAUSE FIXED — mel normalization sign inversion (`-2` → `+2`) caused all embeddings to be out-of-distribution. Fix applied in Phase 46-01. Awaiting human smoke test to confirm.
- ~~**Settings UI narrow**: janela estreita com cara de default Electron.~~ FIXED in Phase 47-01 — window widened to 600px with improved spacing.

### Pending Todos

None.

### Current Blockers

None.

## Session Continuity

**If starting fresh:**

- v2.0 roadmap em `.planning/ROADMAP.md` — 3 phases (45, 46, 47)
- Bugs documentados em "v2.0 Bugs Known" acima
- `/gsd:plan-phase 45` para iniciar execução
