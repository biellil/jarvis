---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Emotional Voice Cloning TTS
status: planning
stopped_at: Defining requirements
last_updated: "2026-05-28T00:00:00.000Z"
last_activity: 2026-05-28
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-28 — v3.5 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** v3.5 — Emotional Voice Cloning TTS (Python Desktop only)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-28 — Milestone v3.5 started

## Accumulated Context

- v3.4 shipped 2026-05-28 — arquivada em `.planning/milestones/v3.4-ROADMAP.md`
- 4 phases (82-85), 12 plans, 162 commits
- **v3.5 scope:** `apps/desktop-py` only — TypeScript/Electron fora de escopo
- **TTS system:** Chatterbox TTS (Resemble AI, Apache 2.0, ~800MB)
  - Zero-shot voice cloning via `audio_prompt_path` (arquivo .wav/.mp3)
  - `exaggeration` param (0.0-1.0) mapeado para emotion tags
  - GPU CUDA→CPU auto-detect (mesmo padrão do _detect_device() do Whisper)
- **Emotion tags** mapeadas: [angry][whispering][sad][soft][embarrassed][breathy][emphasis][excited]
- **Fallback:** Kokoro permanece como fallback, não é removido

## Backlog (carry-over)

- **999.6** — Linux smoke test (DIST-04 UAT, retoma plan 71-04)
