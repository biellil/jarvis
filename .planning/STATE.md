---
gsd_state_version: 1.0
milestone: v3.5
milestone_name: Emotional Voice Cloning TTS
status: verifying
stopped_at: Completed 87-02-PLAN.md
last_updated: "2026-05-29T13:56:13.622Z"
last_activity: 2026-05-29
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-28 — v3.5 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — como um parceiro que nunca esquece.
**Current focus:** Phase 87 — voice-cloning

## Current Position

Phase: 88
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-05-29

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
- [Phase 87-voice-cloning]: Phase 87 Plan 01: 3 tests pass accidentally because warmup ignores audio_prompt_path — expected RED phase behavior
- [Phase 87-voice-cloning]: Phase 87 Plan 01: voice_reference_{descriptor} fixture naming pattern for voice cloning tests using soundfile+numpy
- [Phase 87-voice-cloning]: Warmup generate call not modified — audio is discarded; passing audio_prompt_path during warmup unnecessary
- [Phase 87-voice-cloning]: _generate_kwargs dict pattern for conditional kwarg passing to Chatterbox generate()

### Pitfalls conhecidos (Phase 86)

- **CRÍTICO:** torch do Chatterbox conflita com ctranslate2 do faster-whisper — usar `--no-deps` + pin manual
- **CRÍTICO:** cold start de 5-10s na primeira inferência — warmup dummy no `init_tts()` obrigatório
- **EMOTE:** tags no texto DEVEM ser removidas antes da inferência (nunca lidas em voz alta)

### Blockers/Concerns

Nenhum no momento.

### Arquivos de referência de voz

- `apps/desktop-py/voices/Jarvis.mp3` — arquivo de referência para teste de voice cloning (colocado pelo usuário em 2026-05-28)

## Session Continuity

Last session: 2026-05-29T13:49:40.450Z
Stopped at: Completed 87-02-PLAN.md
Resume file: None
