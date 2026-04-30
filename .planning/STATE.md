---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Polish & Stability
status: in-progress
last_updated: "2026-04-30"
last_activity: 2026-04-30
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-30)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** v2.0 Polish & Stability — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements

Last activity: 2026-04-30 — Milestone v2.0 started

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

### v2.0 Bugs Known

- **PTT guard missing**: ptt-hotkey.ts emite `ptt:action` independente do voice mode atual. ChatInput.tsx inicia gravação mesmo em wake-word mode. Fix: checar voiceModeManager.getMode() === 'ptt-only' antes de emitir.
- **Whisper model override ignored**: main/index.ts define selectedModel via VRAM mas nunca lê getWhisperModelOverride() do store. Settings salva mas valor é ignorado. Fix: aplicar override pós-VRAM-detection.
- **Wake word reliability**: usuário reporta que "Hey JARVIS" muitas vezes não ativa. Causa a investigar.
- **Settings UI narrow**: janela estreita com cara de default Electron. Precisa de janela maior e melhor layout.

### Pending Todos

None.

### Current Blockers

None.

## Session Continuity

**If starting fresh:**

- v2.0 roadmap em `.planning/ROADMAP.md`
- Bugs documentados em "v2.0 Bugs Known" acima
- `/gsd:plan-phase 45` para iniciar execução
