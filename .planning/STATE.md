---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Emotional Voice Cloning TTS
status: executing
stopped_at: Phase 86 context gathered
last_updated: "2026-05-29T01:10:19.366Z"
last_activity: 2026-05-29 -- Phase 86 execution started
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 4
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-28 — v3.5 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — como um parceiro que nunca esquece.
**Current focus:** Phase 86 — identificacao-de-voz-speaker-recognition

## Current Position

Phase: 86 (identificacao-de-voz-speaker-recognition) — EXECUTING
Plan: 1 of 4
Status: Executing Phase 86
Last activity: 2026-05-29 -- Phase 86 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v3.5)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

- v3.5: Chatterbox instalado com `--no-deps` + torch pinned para evitar conflito ctranslate2
- v3.5: Warmup obrigatório no `init_tts()` — cold start de 5-10s inaceitável em uso real
- v3.5: Tags de emoção mapeadas para `exaggeration` + `cfg_weight` do Chatterbox
- v3.5: Kokoro permanece como fallback — não é removido
- v3.4: Kokoro voice preset selector entregue (Phase 85) — 3 vozes PT-BR

### Pitfalls conhecidos (Phase 86)

- **CRÍTICO:** torch do Chatterbox conflita com ctranslate2 do faster-whisper — usar `--no-deps` + pin manual
- **CRÍTICO:** cold start de 5-10s na primeira inferência — warmup dummy no `init_tts()` obrigatório
- **EMOTE:** tags no texto DEVEM ser removidas antes da inferência (nunca lidas em voz alta)

### Blockers/Concerns

Nenhum no momento.

### Arquivos de referência de voz

- `apps/desktop-py/voices/Jarvis.mp3` — arquivo de referência para teste de voice cloning (colocado pelo usuário em 2026-05-28)

## Session Continuity

Last session: 2026-05-29T00:07:58.401Z
Stopped at: Phase 86 context gathered
Resume file: .planning/phases/86-identificacao-de-voz-speaker-recognition/86-CONTEXT.md
