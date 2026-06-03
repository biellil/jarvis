---
phase: 90-polish-stability
plan: 02
subsystem: e2e-testing
tags: [e2e, ci, testing, pipeline, github-actions]

# Dependency graph
requires:
  - phase: 89-speaker-recognition
    provides: voice_modes._ptt_loop + chat.build_request_headers + ui.set_state
  - phase: 90-polish-stability
    plan: 01
    provides: speaker.py endurecido (precondição para fixture E2E exercitar speaker code)
provides:
  - voice_modes.run_ptt_once (API pública 1-shot determinística do pipeline PTT)
  - Marker pytest e2e (isolamento de testes lentos)
  - Fixture e2e_audio_wav + tests/fixtures/hello.wav (16kHz mono PT-BR)
  - Workflow CI desktop-py-tests (2 jobs: unit + e2e com cache HF)
affects: [91-stability-ship, futuros refactors do pipeline de voz]

# Tech tracking
tech-stack:
  added:
    - "GitHub Actions: actions/cache@v4 para modelos Whisper/Kokoro"
    - "astral-sh/setup-uv@v3 (cache de venv automático em CI)"
  patterns:
    - "1-shot deterministic execution: extrair caminho crítico com callables injetáveis (audio_provider, http_call, tts_play) para habilitar teste E2E sem threading/hardware"
    - "Fixture sintética via espeak-ng + scipy.signal.resample_poly: gera áudio reconhecível por Whisper sem rodar TTS neural durante build"
    - "pytest marker e2e + jobs CI separados: unit rápido em todo PR, e2e isolado com cache de modelos"

key-files:
  created:
    - apps/desktop-py/tests/fixtures/hello.wav
    - apps/desktop-py/tests/fixtures/README.md
    - apps/desktop-py/tests/test_e2e_pipeline.py
    - .github/workflows/desktop-py-tests.yml
  modified:
    - apps/desktop-py/pyproject.toml
    - apps/desktop-py/tests/conftest.py
    - apps/desktop-py/src/jarvis_desktop/voice_modes.py

key-decisions:
  - "run_ptt_once chama init_stt() NÃO; em vez disso o teste chama explicitamente — mantém run_ptt_once focada em wiring puro, sem efeitos colaterais de setup"
  - "Header Content-Type=application/json injetado dentro de run_ptt_once (não em build_request_headers) — mantém build_request_headers como autoridade única dos headers Phase 89 e adiciona Content-Type apenas no caller que faz POST de fato"
  - "Fixture e2e_audio_wav lê hello.wav uma vez por teste (não session-scoped) — Whisper transcrição não muta o array, mas escopo padrão simplifica isolamento de testes futuros"
  - "Workflow separa unit-tests e e2e-tests em jobs independentes — falha do E2E (cache miss em models) não bloqueia validação rápida da unit suite"

patterns-established:
  - "Dependency injection via kwargs-only (* unpacking) para funções 1-shot deterministicas: força nome explícito do callable em sites de teste"
  - "Fixtures de áudio sintético via espeak-ng + scipy resample para CI determinístico (sem dependência de modelo TTS neural durante geração)"
  - "Cache key versionado (-v1) em actions/cache@v4 permite invalidação manual sem invalidar todos os caches por path"

requirements-completed: [POL-04]

# Metrics
duration: 13 min
completed: 2026-06-03
---

# Phase 90 Plan 02: E2E Pipeline Testing (POL-04) Summary

**Cobertura E2E automática do pipeline PTT → STT → LLM(mock) → TTS via `voice_modes.run_ptt_once` + workflow CI dedicado com cache de modelos HuggingFace.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-03T01:48:23Z
- **Completed:** 2026-06-03T02:00:54Z
- **Tasks:** 4 (Task 1, 2a, 2b, 2c [2 commits], 3)
- **Files modified:** 3 + 4 criados
- **Commits:** 6 atômicos

## Accomplishments

- Fixture `hello.wav` (16kHz mono ~3s "olá jarvis" PT-BR via espeak-ng) commitada — 96 KB, dentro da banda esperada [60KB, 200KB]
- Marker `e2e` configurado em `pyproject.toml` — `pytest -m "not e2e"` filtra unit, `pytest -m e2e` roda só E2E
- Fixture `e2e_audio_wav` em `conftest.py` carrega o WAV com asserções de formato (16kHz mono)
- `voice_modes.run_ptt_once(config, *, audio_provider, http_call, tts_play) -> dict` exportada — função pública 1-shot determinística, zero threading, zero pynput, zero `sd.InputStream`
- `test_ptt_full_pipeline_with_mocked_llm` cobre 5 asserções D-18 incluindo ausência de `x-jarvis-speaker` quando `speaker_recognition_enabled=False`
- Workflow `.github/workflows/desktop-py-tests.yml` com 2 jobs (unit-tests rápido + e2e-tests com cache HF/Kokoro)
- Unit suite continua na linha de base (138 passed; falhas/erros idênticos ao HEAD pré-plano — todos pré-existentes)

## Task Commits

1. **Task 1 — Fixture WAV:** `79d49f8b` — 🔧 chore(tests): adicionar fixture hello.wav PT-BR (espeak-ng) para teste E2E
2. **Task 2a — Marker pytest:** `6b086440` — 🏗️ build(tests): adicionar marker pytest e2e em pyproject.toml
3. **Task 2b — Fixture conftest:** `49b87101` — ✅ test(conftest): adicionar fixture e2e_audio_wav carregando hello.wav
4. **Task 2c.1 — Refactor voice_modes:** `3fe9ecbd` — ♻️ refactor(voice_modes): extrair run_ptt_once 1-shot determinístico para habilitar teste E2E (POL-04)
5. **Task 2c.2 — Teste E2E:** `b8e61fcf` — ✅ test(e2e): cobrir pipeline PTT → STT → LLM(mock) → TTS via run_ptt_once (POL-04)
6. **Task 3 — Workflow CI:** `478482a9` — 🤖 ci: adicionar workflow desktop-py-tests com unit + e2e jobs e cache HF

## Files Created/Modified

### Criados
- `apps/desktop-py/tests/fixtures/hello.wav` — Áudio sintético PT-BR ("olá jarvis"), 16kHz mono PCM_16, 48000 amostras, 96 KB
- `apps/desktop-py/tests/fixtures/README.md` — Documenta origem da fixture e comando de regeneração
- `apps/desktop-py/tests/test_e2e_pipeline.py` — Teste único `test_ptt_full_pipeline_with_mocked_llm` com 5 asserções (D-18)
- `.github/workflows/desktop-py-tests.yml` — 2 jobs (unit + e2e) com cache de modelos HF/Kokoro

### Modificados
- `apps/desktop-py/pyproject.toml` — `[tool.pytest.ini_options] markers = ["e2e: ..."]` adicionado, sem deps novas
- `apps/desktop-py/tests/conftest.py` — Nova fixture `e2e_audio_wav` ao final (preserva todas as fixtures existentes)
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — `run_ptt_once` adicionada (75 linhas) entre `get_text_queue()` e a seção "Internal helpers"; import `Callable` adicionado

## Decisions Made

- **`run_ptt_once` NÃO chama `init_stt`** — Mantém a função focada em wiring; caller (teste ou caller real) gerencia o ciclo de vida do modelo. Em produção, `__main__.py` já chama `init_stt` antes do `start_mode("ptt", ...)`. No teste, a chamada explícita ficou no setup do test_e2e_pipeline.
- **Content-Type=application/json injetado dentro de `run_ptt_once`** — `build_request_headers` (Phase 89) é a fonte de verdade para headers de identidade (auth + client + speaker). `Content-Type` é responsabilidade do site que de fato faz POST; aqui o caller compõe `{Content-Type, **build_request_headers(...)}`.
- **2 jobs CI separados** — Falha do E2E (timeout em download/init de Whisper) não deve bloquear feedback rápido da unit suite. Failure isolation > monolitismo.
- **Fixture e2e_audio_wav function-scoped** — Whisper não muta o array, mas escopo de função é o default e simplifica futuras evoluções (fixture com setup/teardown).
- **Cache key versionado (`-v1`)** — Permite bump manual quando trocarmos `whisper_model` no workflow sem invalidar caches de outros paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adicionar `init_stt(config)` explícito no teste E2E**
- **Found during:** Task 2c (execução do `pytest tests/test_e2e_pipeline.py -m e2e`)
- **Issue:** Primeira execução falhou com `RuntimeError: [STT] Modelo não carregado. Chame init_stt() antes de transcrever.` — `voice_modes.run_ptt_once` chama `transcribe(audio)` direto, mas `transcribe` exige que `init_stt` tenha sido chamado antes (singleton pattern do Whisper).
- **Fix:** Adicionada chamada `_stt.init_stt(config)` no teste após criar o `JarvisConfig`. Não foi alterado `run_ptt_once` porque em produção `__main__.py` já chama `init_stt` antes do `start_mode`; injetar `init_stt` dentro de `run_ptt_once` adicionaria efeito colateral de setup numa função que deve ser puro wiring.
- **Files modified:** `apps/desktop-py/tests/test_e2e_pipeline.py` (1 linha de import + 1 linha de chamada — pré-commit)
- **Verification:** `pytest tests/test_e2e_pipeline.py -m e2e` exits 0 com transcript não-vazio
- **Committed in:** `b8e61fcf` (junto com o próprio teste — Task 2c.2)

---

**Total deviations:** 1 auto-fixed (1 blocking, pré-commit)
**Impact on plan:** Mínimo — ajuste de 2 linhas no teste; nenhuma alteração ao refactor de `voice_modes.py` ou ao plano original. Decisão de design preservada: `run_ptt_once` continua livre de efeitos colaterais de setup.

## Issues Encountered

### Falhas pré-existentes na unit suite (inalteradas pelo plano)

- 7 failed (test_config / test_tts / test_voice_modes::test_ptt_mode_hotkey) + 17 errors (test_pc_control) — verificados via `git stash` que existiam idênticos no HEAD pré-plano.
- `test_ptt_mode_hotkey` já registrado em `.planning/phases/90-polish-stability/deferred-items.md` por 90-01.
- Demais falhas estão fora do escopo deste plano; serão tratadas em plan separado de polish.

### Warning de DeprecationWarning hf_xet

- Durante run do teste E2E aparece `DeprecationWarning: hf_xet.download_files() is deprecated.` — vem da lib `huggingface_hub` (transitiva de `faster-whisper`). Não afeta resultado. Tracking implícito via `huggingface_hub` upstream.

## Authentication Gates

Nenhum — execução totalmente local. Teste E2E mocka HTTP (não toca gateway).

## User Setup Required

- **Local (já satisfeito):** `espeak-ng` instalado para regenerar fixture (`apt install espeak-ng`).
- **CI (já no workflow):** workflow instala `libportaudio2 libsndfile1 ffmpeg espeak-ng` antes dos testes.

## Next Phase Readiness

- Pipeline PTT → STT → LLM → TTS protegido por teste E2E a cada PR — refactors futuros pegam regressões de wiring imediatamente.
- `run_ptt_once` agora é API pública estável; pode ser usada também por scripts CLI 1-shot (oportunidade futura: `jd ptt --audio file.wav`).
- Workflow `desktop-py-tests.yml` é template para futuros workflows Python no monorepo.
- Plan 90-03 (CLI threshold) pode adicionar marker `e2e` próprio se precisar de testes de pipeline com config diferente.

### Threat surface scan

Nenhuma nova superfície introduzida. Todas as mitigações fechadas:
- T-90-02-01 (Information Disclosure / fixture): hello.wav é sintético, sem dados pessoais; README documenta origem
- T-90-02-02 (Information Disclosure / GH secrets): workflow não usa `secrets.*` — testes E2E são fechados (LLM mockado)
- T-90-02-03 (Tampering / HF cache): aceito — cache key determinística, scoped por branch/ref pelo GH
- T-90-02-04 (DoS / latência E2E): aceito — Whisper tiny + Kokoro cached, 2-5min após cold cache
- T-90-02-05 (EoP / callables injetados): mitigado — função pública, só chamada por código interno (testes)

### Known Stubs

Nenhum stub identificado. Pipeline 100% wired — STT real (Whisper-tiny), TTS via callable injetado (em produção é `tts.speak`), HTTP via callable injetado (em produção é `urllib.request.urlopen` + parser SSE em `chat._stream_response`).

## Self-Check: PASSED

Verificações pós-conclusão:

- `apps/desktop-py/tests/fixtures/hello.wav` — FOUND (96044 bytes, 16kHz mono 48000 samples)
- `apps/desktop-py/tests/fixtures/README.md` — FOUND (contém "espeak-ng" e "hello.wav")
- `apps/desktop-py/tests/test_e2e_pipeline.py` — FOUND (contém `@pytest.mark.e2e`, `def test_ptt_full_pipeline_with_mocked_llm`, asserção de ausência de `x-jarvis-speaker`)
- `apps/desktop-py/tests/conftest.py` — FOUND (modificado, contém `def e2e_audio_wav`)
- `apps/desktop-py/pyproject.toml` — FOUND (modificado, contém `markers = ["e2e: ..."]`)
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — FOUND (modificado, contém `def run_ptt_once`)
- `.github/workflows/desktop-py-tests.yml` — FOUND (jobs: unit-tests + e2e-tests; 2 `actions/cache@v4`; deps `libportaudio2 libsndfile1 espeak-ng`)
- Commits no git log: 6 atômicos (79d49f8b, 6b086440, 49b87101, 3fe9ecbd, b8e61fcf, 478482a9)
- `pytest tests/test_e2e_pipeline.py -m e2e -v` — exits 0 (1 passed em 39.30s)
- `pytest -m "not e2e" -q` — 138 passed + falhas pré-existentes inalteradas (linha de base)

---
*Phase: 90-polish-stability*
*Completed: 2026-06-03*
