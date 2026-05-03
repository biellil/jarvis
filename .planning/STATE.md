---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Polish & Stability
status: verifying
last_updated: "2026-05-02T00:45:36.663Z"
last_activity: 2026-05-02
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-30)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 46 — wake-word-reliability

## Current Position

Phase: 46 (wake-word-reliability) — EXECUTING
Plan: 1 of ? — Task 1 complete, awaiting checkpoint Task 2 (human-verify)
Status: Checkpoint — awaiting human smoke test

Last activity: 2026-05-02

Progress: ░░░░░░░░░░ 0%

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
- [Phase 46]: Mel normalization sign inversion was root cause of wake word failures — `x/10 - 2` shifted embedding inputs 4 units below training distribution; fix: `x/10 + 2`
- [Phase 46]: VAD gate is intentionally disabled (Silero requires raw audio, not embeddings); test 5 updated to reflect this architectural decision

### v2.0 Bugs Known

- **PTT guard missing**: ptt-hotkey.ts emite `ptt:action` independente do voice mode atual. ChatInput.tsx inicia gravação mesmo em wake-word mode. Fix: checar voiceModeManager.getMode() === 'ptt-only' antes de emitir.
- **Whisper model override ignored**: main/index.ts define selectedModel via VRAM mas nunca lê getWhisperModelOverride() do store. Settings salva mas valor é ignorado. Fix: aplicar override pós-VRAM-detection.
- **Wake word reliability**: ROOT CAUSE FIXED — mel normalization sign inversion (`-2` → `+2`) caused all embeddings to be out-of-distribution. Fix applied in Phase 46-01. Awaiting human smoke test to confirm.
- **Settings UI narrow**: janela estreita com cara de default Electron. Precisa de janela maior e melhor layout.

### Pending Todos

None.

### Current Blockers

None.

## Session Continuity

**If starting fresh:**

- v2.0 roadmap em `.planning/ROADMAP.md` — 3 phases (45, 46, 47)
- Bugs documentados em "v2.0 Bugs Known" acima
- `/gsd:plan-phase 45` para iniciar execução
