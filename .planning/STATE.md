---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: GPU Multi-Platform + OpenRouter + Polish/Memory/Performance
status: defining_requirements
stopped_at: Milestone v3.6 started — defining requirements
last_updated: "2026-06-02T00:00:00.000Z"
last_activity: 2026-06-02
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02 — v3.6 milestone started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — como um parceiro que nunca esquece.
**Current focus:** v3.6 — GPU Multi-Platform + OpenRouter + Polish/Memory/Performance

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-02 — Milestone v3.6 started

Progress: [          ] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v3.6)
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
- [Phase 88-01]: _EMOTION_TAG_MAP tuple lookup with config defaults fallback — exaggeration/cfg_weight always injected to generate()
- [Phase 88-01]: Emotion tag strip ONLY in Chatterbox path — Kokoro receives original text (D-04)
- [Phase 88-02]: Conditional menu item 8 checked per-iteration (not cached) — prevents stale display if provider changes inside while loop
- [Phase 88-02]: Inline chatterbox_audio_prompt_path prompt inside _menu_tts_provider after set_provider — single interaction flow
- [Phase 89-01]: speaker.py expõe candidate_name no dict de retorno além de name/confidence/is_known — habilita hybrid injection do Plan 03
- [Phase 89-01]: _speakers_dir() é função dinâmica chamando Path.home() por invocação — essencial para tmp_home fixture funcionar
- [Phase 89-01]: Singleton VoiceEncoder usa try/except no reset da fixture para tolerar 1ª chamada antes do módulo existir
- [Phase 89]: [Phase 89-02]: Item 10 contador per-iteration via len(spk.list_profiles()) — consistente com pattern Phase 88-02
- [Phase 89]: [Phase 89-02]: Submenu CRUD (3 ações + voltar) é pattern reutilizável; sobrescrita de perfil exige confirmação (s/N) — defense in depth
- [Phase 89-03]: Queue API migrada de tuple para dict {text, speaker} — extensível por design (decisão de revisão 2026-05-29)
- [Phase 89-03]: Prefixo de speaker aplicado no chat_loop (não em _stream_response) — desacopla responsabilidades e simplifica testes de _stream_response
- [Phase 89-03]: _await_input usa helper _unpack com isinstance(item, dict) guard — compat reversa para producers legacy com string puro

### Pitfalls conhecidos (Phase 86)

- **CRÍTICO:** torch do Chatterbox conflita com ctranslate2 do faster-whisper — usar `--no-deps` + pin manual
- **CRÍTICO:** cold start de 5-10s na primeira inferência — warmup dummy no `init_tts()` obrigatório
- **EMOTE:** tags no texto DEVEM ser removidas antes da inferência (nunca lidas em voz alta)

### Pitfalls conhecidos (v3.6 entrada)

- **GPU AMD Windows:** ROCm 7.2.1 requer HIP SDK instalado no sistema + torch 2.9.1+rocm via URL direta (não PyPI) — uv.lock pinado em torch 2.6.0 precisa estratégia de extras
- **GPU AMD Windows:** chatterbox-tts pina `torch==2.6.0` — reinstalar com `--no-deps` e gerenciar dependências manualmente
- **Multi-GPU detection:** ROCm aparece como `"cuda"` no PyTorch — sem código novo necessário, mas detecção de hardware real exige checagem adicional

### Blockers/Concerns

Nenhum no momento.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260530-uqr | Salvar turns agentivos no SQLite | 2026-05-31 | 3511c89 | [260530-uqr-salvar-turns-agentivos-no-sqlite](./quick/260530-uqr-salvar-turns-agentivos-no-sqlite/) |

### Arquivos de referência de voz

- `apps/desktop-py/voices/Jarvis.mp3` — arquivo de referência para teste de voice cloning (colocado pelo usuário em 2026-05-28)

## Session Continuity

Last session: 2026-06-02T00:00:00.000Z
Stopped at: Milestone v3.6 started — defining requirements
Resume file: None
