---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: milestone
status: verifying
stopped_at: Completed 93-03-PLAN.md (NDCG benchmark quality gate)
last_updated: "2026-06-10T18:02:41.544Z"
last_activity: 2026-06-10
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 13
  completed_plans: 13
  percent: 29
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02 — v3.6 milestone started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — como um parceiro que nunca esquece.
**Current focus:** Phase 93 — hybrid-memory-retrieval

## Current Position

Phase: 94
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-06-10

Progress: [██        ] 29% (2/7 phases complete)

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
- [Phase 91-01]: fallback_strategy: CPU-ONLY — torch+ROCm não existe para Windows; Chatterbox fica em CPU em todas as plataformas (conservativo)
- [Phase 91-01]: API compatibility PASS — chatterbox-tts 0.1.7 com torch 2.9.1 tem API idêntica; warning de version mismatch é não-fatal
- [Phase 91]: Vulkan detection-only via ctypes (D-07) — nunca roteado como device ativo em Phase 91
- [Phase 91]: gpu_amd_backend campo flat em JarvisConfig — Pydantic BaseModel não suporta dot notation
- [Phase 91]: Allocation test torch.zeros(1, device=...) obrigatório em device_detect.py antes de commitar a qualquer device (GPU P-2)
- [Phase 91]: jd validate-gpu como subcomando de _entry() com args[0] pattern — consistente com setup
- [Phase 91]: apple-silicon e vulkan extras com lista vazia — documenta intenção sem deps desnecessárias
- [Phase 91]: stt.py and tts.py delegate device selection to device_detect.detect() — _detect_device, _detect_amd_windows, _detect_chatterbox_device removed (GPU-06, GPU-07)
- [Phase 91]: Chatterbox warmup builds devices_to_try=[primary_device, cpu] from device_detect result — replaces _detect_chatterbox_device cascade list
- [Phase 92-01]: ChatOpenAI reused with baseURL=openrouter.ai/api/v1 — no new dependency; same pattern as lmstudio
- [Phase 92-01]: apiKey fallback to 'free-tier' string when OPENROUTER_API_KEY empty — free tier accepts any non-empty key
- [Phase 92-01]: 429 wrapped in invoke() override — surfaces as AIMessage after SDK retry exhaustion, not crash
- [Phase 92-02]: openrouterConfig local const inside describe block — keeps base config close to tests without polluting outer mockConfig
- [Phase 92-02]: OPENROUTER_API_KEY added to outer mockConfig so all existing tests compile cleanly with updated LLMConfig type
- [Phase 93-01]: sqlite exported from db.ts via export { sqlite } — minimal change, single source of truth for FTS5 setup
- [Phase 93-01]: setupFts5() called in both MemoryStore constructor paths (test dbPath + production globalSqlite); wrapped in try/catch (MEM-05 parity)
- [Phase 93-01]: HybridRetriever injection pattern: sqlite + vectors constructor args — testable without real ChromaDB
- [Phase 93-02]: HybridRetriever instantiated in MemoryManager constructor with globalSqlite + this.vectors (defaults: topK=12, weights 0.6/0.25/0.15)
- [Phase 93-02]: formatMemoriesSection removed — single ### Memórias section pattern inlined in buildContext()
- [Phase 93-03]: FTS5 uses token OR search for multi-word queries — phrase search fails when query word order differs from document order (PT-BR conversational queries)
- [Phase 93-03]: NDCG benchmark split-baseline: even queries get semantic top-1, odd get nothing — simulates dual recall failure modes without overcomplicating fixture

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
| Phase 91-gpu-multi-platform-detection P01 | 35 | 2 tasks | 1 files |
| Phase 91 P02 | 718 | 2 tasks | 3 files |
| Phase 91 P04 | 1108 | 2 tasks | 3 files |
| Phase 91 P03 | 28 | 2 tasks | 7 files |
| Phase 92-openrouter-provider P01 | 4 | 2 tasks | 5 files |
| Phase 92-openrouter-provider P02 | 4 | 2 tasks | 3 files |
| Phase 93-hybrid-memory-retrieval P01 | 353 | 2 tasks | 5 files |
| Phase 93-hybrid-memory-retrieval P02 | 5 | 1 tasks | 3 files |
| Phase 93-hybrid-memory-retrieval P03 | 7 | 2 tasks | 3 files |

### Arquivos de referência de voz

- `apps/desktop-py/voices/Jarvis.mp3` — arquivo de referência para teste de voice cloning (colocado pelo usuário em 2026-05-28)

## Session Continuity

Last session: 2026-06-10T17:53:43.001Z
Stopped at: Completed 93-03-PLAN.md (NDCG benchmark quality gate)
Resume file: None

**Start here next session:**

- Current phase: 90 (Polish & Stability)
- Run `/gsd:plan-phase 90` to decompose Phase 90 into executable plans
- Read `.planning/ROADMAP.md` for full phase structure and success criteria
- Read `.planning/REQUIREMENTS.md` for complete v3.6 requirement list
