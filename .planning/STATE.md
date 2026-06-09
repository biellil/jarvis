---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: milestone
status: executing
stopped_at: Completed 90-03-PLAN.md
last_updated: "2026-06-03T16:37:39.692Z"
last_activity: 2026-06-03
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02 — v3.6 milestone started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — como um parceiro que nunca esquece.
**Current focus:** Phase 90 — polish-stability

## Current Position

Phase: 90 (polish-stability) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-06-09 - Completed quick task 260609-rw9: Fix STT language detection (pinar idioma PT-BR)

Progress: [          ] 0% (0/7 phases complete)

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
- [Phase 90-01]: EnrollmentAborted como RuntimeError dedicado — caller distingue abort de erro real
- [Phase 90-01]: WR-03: itera list_profiles() ao invés de load_all_profiles() — fail-soft por perfil
- [Phase 90-01]: WR-06 filtra list_profiles silenciosamente (continue em ValueError) — perfis maliciosos somem sem warning
- [Phase 90-01]: Atomic write pattern: tempfile.mkstemp(dir=parent)+os.replace para writes resistentes a crash em ~/.jarvis/*
- [Phase 90-polish-stability]: Phase 90-02: run_ptt_once é função pública 1-shot determinística — zero threading/pynput/queue/sd.InputStream, recebe audio_provider/http_call/tts_play injetados via kwargs-only
- [Phase 90-polish-stability]: Phase 90-02: Content-Type=application/json injetado no caller que faz POST — build_request_headers permanece autoridade única de headers de identidade
- [Phase 90-polish-stability]: Phase 90-02: 2 jobs CI separados (unit-tests + e2e-tests) — failure isolation > monolitismo; cache key versionado (-v1) permite bump manual
- [Phase 90-polish-stability]: Phase 90-02: Fixture sintética via espeak-ng + scipy.resample_poly — Whisper transcreve sem rodar TTS neural durante build
- [Phase 90-polish-stability]: Phase 90-03: _show_config_menu virou router para 5 _menu_group_* (LLM/Voice/Memory/Speakers/System) — 7 _menu_* originais preservadas (D-10 diff minimizado)
- [Phase 90-polish-stability]: Phase 90-03: _make_input_feeder coexiste com _make_input_sequence legado — compat reversa para testes Phase 89

### Pitfalls conhecidos (Phase 86)

- **CRÍTICO:** torch do Chatterbox conflita com ctranslate2 do faster-whisper — usar `--no-deps` + pin manual
- **CRÍTICO:** cold start de 5-10s na primeira inferência — warmup dummy no `init_tts()` obrigatório
- **EMOTE:** tags no texto DEVEM ser removidas antes da inferência (nunca lidas em voz alta)

### Pitfalls conhecidos (v3.6 entrada)

- **GPU P-1 (CRÍTICO):** torch 2.9.1+rocm vs Chatterbox API — validar compatibilidade em ambiente isolado ANTES de fazer Phase 91 ship. Se incompatível: patch chatterbox ou CPU-only para Chatterbox + GPU para Kokoro/Whisper
- **GPU P-2 (CRÍTICO):** False positives de GPU detection — `torch.zeros(1, device=...)` allocation test obrigatório em `device_detect.py` antes de commitar a um device
- **STTS P-3 (CRÍTICO):** Boundary detection falha com abreviações PT-BR ("Dr.", "Sr.", "Sra.") — validar nltk PunktSentenceTokenizer com corpus de 50 frases ANTES de fazer Phase 95 ship. Defer se falhar
- **HMEM P-4 (MODERADO):** Pesos RRF não calibrados → recency bias domina — usar defaults documentados (semantic 0.6, keyword 0.25, recency 0.15) + gate NDCG ≥7% lift
- **OPENR P-5 (MODERADO):** Rate limits OpenRouter (20 req/min, 200 req/day) sem retry → chat trava com 429 — implementar exponential backoff + jitter (3 retries) + quota display em `/config`
- **PSPK P-6 (MODERADO):** Cross-speaker contamination — three-state speaker ID (high/low/unknown), threshold ≥0.75 para memória nomeada, teste de isolação com 3 speakers

### Todos

- [ ] Executar HUMAN-UAT speaker recognition com hardware real (3 testes pendentes de Phase 89) — Phase 90
- [ ] Fechar ou aceitar formalmente os 6 warnings + 7 info do code review Phase 89 — Phase 90
- [ ] Validar Chatterbox + torch 2.9.1 em ambiente isolado (gate para Phase 91 ship)
- [ ] Benchmark NDCG 50 queries PT-BR (gate para Phase 93 ship)
- [ ] Validar nltk PunktSentenceTokenizer PT-BR com corpus 50 frases (gate para Phase 95 ship)

### Blockers

Nenhum no momento.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260530-uqr | Salvar turns agentivos no SQLite | 2026-05-31 | 3511c89 | [260530-uqr-salvar-turns-agentivos-no-sqlite](./quick/260530-uqr-salvar-turns-agentivos-no-sqlite/) |
| 260609-qtd | Fazer .env ser fonte de verdade para GATEWAY_URL | 2026-06-09 | 7233f8a8 | [260609-qtd-fazer-o-env-ser-fonte-de-verdade-para-a-](./quick/260609-qtd-fazer-o-env-ser-fonte-de-verdade-para-a-/) |
| 260609-rw9 | Fix STT language detection: pinar idioma PT no faster-whisper e whisper.cpp | 2026-06-09 | 9360e7d2 | [260609-rw9-fix-stt-language-detection-pinar-idioma-](./quick/260609-rw9-fix-stt-language-detection-pinar-idioma-/) |
| Phase 90 P01 | 11 min | 4 tasks | 4 files |
| Phase 90-polish-stability P02 | 13 min | 4 tasks | 7 files |
| Phase 90-polish-stability P03 | 6m24s | 2 tasks | 2 files |

### Arquivos de referência de voz

- `apps/desktop-py/voices/Jarvis.mp3` — arquivo de referência para teste de voice cloning (colocado pelo usuário em 2026-05-28)

## Session Continuity

Last session: 2026-06-03T16:37:39.680Z
Stopped at: Completed 90-03-PLAN.md
Resume file: None

**Start here next session:**

- Current phase: 90 (Polish & Stability)
- Run `/gsd:plan-phase 90` to decompose Phase 90 into executable plans
- Read `.planning/ROADMAP.md` for full phase structure and success criteria
- Read `.planning/REQUIREMENTS.md` for complete v3.6 requirement list
