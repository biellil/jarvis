---
phase: 89-identifica-o-de-voz-speaker-recognition-backlog
plan: 03
subsystem: voice-pipeline
tags: [pipeline-integration, voice-modes, llm-context, chromadb-guard, queue-dict-api, speaker-recognition]

# Dependency graph
requires:
  - phase: 89-01
    provides: "speaker.identify_speaker(audio, config) -> {name, confidence, is_known, candidate_name}"
  - phase: 89-02
    provides: "config.speaker_recognition_enabled toggle + config.speaker_threshold (default 0.75)"
provides:
  - "voice_modes._identify_speaker_safe(audio, config) — wrapper que respeita toggle e captura exceções"
  - "voice_modes Queue API mudada para dict {text, speaker} — extensível (D-08 da revisão 2026-05-29 sobre tuple)"
  - "chat._build_speaker_prefix(speaker_result, threshold) -> prefix string conforme D-08"
  - "chat.build_request_headers ganha parâmetro speaker_name -> header x-jarvis-speaker"
  - "chat._stream_response(config, message, speaker_result=None) — header HTTP D-11"
  - "chat._await_input retorna tupla (text, is_voice, speaker_result) com desempacotamento dict OU string legacy"
  - "chat.chat_loop aplica prefix via _build_speaker_prefix e propaga speaker_result"
affects:
  - "Phase futura de memória/ChromaDB no gateway — consumirá header x-jarvis-speaker para skip de unknown (D-11 contrato HTTP)"
  - "Phase futura LangGraph/system prompt — pode ler prefixo [Name]: do message body OU header x-jarvis-speaker"

# Tech tracking
tech-stack:
  added: []  # zero deps novas — apenas wiring entre módulos existentes
  patterns:
    - "_identify_speaker_safe: try/except global em integração de feature opt-in (T-89-03-04)"
    - "Queue dict API {text, speaker} — extensível para campos futuros (vs tuple rejeitado)"
    - "_unpack guard isinstance(item, dict) vs str — compat reversa para producers legacy"
    - "Hybrid speaker injection: prefix no message body + header HTTP (D-08 + D-11)"

key-files:
  created: []
  modified:
    - "apps/desktop-py/src/jarvis_desktop/voice_modes.py (+24 linhas: helper + 3 sites integrados)"
    - "apps/desktop-py/src/jarvis_desktop/chat.py (+78 linhas: _build_speaker_prefix + header + _stream_response + _await_input + chat_loop)"
    - "apps/desktop-py/tests/test_voice_modes.py (+86 linhas: 3 testes novos + 4 adaptações legacy)"
    - "apps/desktop-py/tests/test_chat.py (+165 linhas: 7 testes novos)"

key-decisions:
  - "_identify_speaker_safe loga sempre o candidate_name + score independente do is_known — útil para diagnosticar 'Biel? 0.72' (próximo do threshold) em produção"
  - "Prefixo aplicado no chat_loop (não dentro de _stream_response) — desacopla: _stream_response repassa message como recebido, apenas extrai speaker_name para header"
  - "_await_input com helper interno _unpack — guard isinstance permite que producers legacy (puro string) coexistam com Queue dict, sem quebrar nada"
  - "Threshold parameter mantido na assinatura de _build_speaker_prefix embora não seja usado diretamente (identify_speaker já aplica) — futuro-proof para políticas dependentes do score bruto"

patterns-established:
  - "Safe wrapper de feature opt-in: getattr(config, flag, False) → try/except → log → return None"
  - "Queue payload extensível via dict {primary, metadata1, metadata2, ...} em vez de tuple posicional"
  - "Compat reversa em consumers: isinstance guard antes de unpack permite mudança de API sem quebrar producers antigos"
  - "Hybrid injection (body prefix + HTTP header): prefix para LLM ler como contexto, header para gateway agir programaticamente"

requirements-completed: [SPK-07, SPK-08]

# Metrics
duration: ~6min30s
completed: 2026-05-30
---

# Phase 89 Plan 03: Pipeline Integration — Speaker Recognition em voice_modes + chat Summary

**Integra o módulo speaker (Plan 01) e o toggle do menu (Plan 02) no pipeline de voz e LLM: voice_modes identifica o falante entre captura e transcribe (D-06), chat_loop injeta prefixo `[Name]:`/`[Name?]:`/`[unknown]:` no message body (D-08/D-09) e propaga header `x-jarvis-speaker` ao gateway (D-11). Queue API migrada para dict {text, speaker} — extensível.**

## Performance

- **Duration:** ~6min30s (389s)
- **Started:** 2026-05-30T00:42:20Z
- **Completed:** 2026-05-30T00:48:49Z
- **Tasks:** 3 (TDD: RED + 2x GREEN)
- **Files modified:** 4 (2 src + 2 tests)

## Accomplishments

- `voice_modes._identify_speaker_safe` wrapper seguro respeitando toggle (D-10) + capturando exceções (T-89-03-04)
- Os 3 voice loops (PTT, wake_word, always_listening) chamando `_identify_speaker_safe` entre captura e transcribe — passando o MESMO NumPy que vai ao Whisper (D-06)
- Queue API migrada para dict `{text, speaker}` em 3 sites — extensível por design (decisão de revisão 2026-05-29 sobre tuple)
- `chat._build_speaker_prefix` cobre todos os 4 casos D-08: `[Name]:` (high conf), `[Name?]:` (low conf com match), `[unknown]:` (zero match), `""` (feature off)
- `chat.build_request_headers` ganha parâmetro `speaker_name` — header `x-jarvis-speaker` adicionado quando não-vazio (contrato HTTP D-11)
- `chat._stream_response` aceita `speaker_result` kwarg e propaga header ao gateway
- `chat._await_input` retorna tupla 3 (text, is_voice, speaker_result) com helper `_unpack` que aceita dict novo OU string legacy (compat reversa)
- `chat.chat_loop` aplica prefixo via helper e propaga `speaker_result` para `_stream_response` (D-09 — reconstruído a cada turno)
- 10 testes novos passando (3 voice_modes + 7 chat): SPK-07, SPK-08, D-11, T-89-03-04 todos cobertos
- 0 regressões novas — as 4 falhas remanescentes em `pytest tests/` são todas pré-existentes documentadas no `deferred-items.md` do Plan 01

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: RED tests para Queue dict + speaker injection** — `4b05d676` (✅ test)
2. **Task 2: _identify_speaker_safe + Queue dict {text, speaker}** — `ffcba3c2` (✨ feat)
3. **Task 3: hybrid speaker injection no chat.py** — `73bdb81d` (✨ feat)

_Pattern TDD aplicado: Task 1 escreveu 10 testes (9 RED + 1 que já passou — `test_queue_includes_speaker_result` só testa Queue mechanics), Task 2 fez 3 deles verdes (voice_modes), Task 3 fez os 7 restantes verdes (chat)._

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — +24 linhas. Adicionada função `_identify_speaker_safe(audio, config)` (linha 163). Modificados 3 sites de `_queue.put(text)` para `_queue.put({"text": text, "speaker": speaker_result})` em `_ptt_loop` (linha 303), `_wake_word_loop` (linha 416) e `_always_listening_loop` (linha 509). Cada site insere `speaker_result = _identify_speaker_safe(audio, config)` antes do `transcribe(audio)`.
- `apps/desktop-py/src/jarvis_desktop/chat.py` — +78 linhas. `build_request_headers` (linha 112) ganha parâmetro `speaker_name` e adiciona header `x-jarvis-speaker` quando não-vazio. Adicionada função `_build_speaker_prefix` (logo antes do `_stream_response`). `_stream_response` ganha kwarg `speaker_result: dict | None = None` e extrai `speaker_name` para header. `_await_input` ganha helper interno `_unpack(item)` que diferencia dict vs string legacy; retorna tupla 3 em todos os return statements. `chat_loop` desempacota tupla 3, aplica prefixo via `_build_speaker_prefix` e passa `speaker_result=speaker_result` para `_stream_response`.
- `apps/desktop-py/tests/test_voice_modes.py` — +86 linhas. 3 testes novos no final: `test_identify_speaker_safe_returns_none_when_disabled`, `test_identify_speaker_safe_returns_none_on_exception`, `test_queue_includes_speaker_result`. 4 testes legacy ajustados para nova API: `test_wake_word_detection`, `test_always_listening_vad`, `test_ptt_mode_hotkey` (parcial), `test_chat_loop_consumes_voice_queue`.
- `apps/desktop-py/tests/test_chat.py` — +165 linhas. 7 testes novos: `test_build_speaker_prefix_high_confidence`, `test_build_speaker_prefix_low_confidence_match`, `test_build_speaker_prefix_unknown`, `test_build_speaker_prefix_none_returns_empty`, `test_speaker_injection_system_prompt`, `test_unknown_speaker_chromadb_header`, `test_no_speaker_header_when_disabled`.

## Decisions Made

- **_identify_speaker_safe loga sempre o candidate_name + score:** mesmo quando `is_known=False`, loga `[SPK] candidate_name (score) -> name` — facilita debug em produção quando score fica próximo do threshold (ex: 0.72 com threshold 0.75 → `[SPK] biel (0.72) -> unknown` deixa claro o "quase match").
- **Prefixo aplicado no chat_loop, NÃO em _stream_response:** Isso desacopla as responsabilidades. `_stream_response` apenas extrai `speaker_name` para o header — o prefixo no body é construído pelo chat_loop antes de chamar a função. Vantagem: testes de `_stream_response` podem passar messages arbitrários sem precisar simular o prefixo correto.
- **_unpack helper local em _await_input:** Permite mudança de API sem quebrar consumers antigos. Se algum producer legado (não modificado) ainda put-ar uma string pura, o desempacotamento retorna `(string, None)` e o pipeline continua funcionando. Defense in depth.
- **Threshold mantido na assinatura de _build_speaker_prefix mesmo não sendo usado diretamente:** O `is_known` já é decidido por `speaker.identify_speaker` aplicando o threshold. Mas mantive o parâmetro na API porque (a) facilita futuras políticas baseadas no score bruto sem mudança de assinatura, (b) os testes do plan explicitamente passam `threshold=0.75` — manter a assinatura espelhada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - API contract bug] Tests legacy de queue precisavam adaptar para dict API**
- **Found during:** Task 2 (verificação de regressão pytest)
- **Issue:** 3 testes legacy (`test_wake_word_detection`, `test_always_listening_vad`, e parcialmente o Task 1's stub `test_queue_includes_speaker_result`) asseravam `vm._queue.get() == "hello jarvis"` mas Plan 03 deliberadamente migra Queue para dict
- **Fix:** Atualizei os 3 asserts para `isinstance(item, dict)` + `item["text"] == "..."` + `item["speaker"] is None` (compat reversa quando `speaker_recognition_enabled=False`)
- **Files modified:** apps/desktop-py/tests/test_voice_modes.py (3 sites)
- **Commit:** ffcba3c2 (Task 2)
- **Justification:** A mudança de Queue API é o coração do SPK-07. Testes legacy DEVEM refletir a nova API — caso contrário o contrato fica indefinido. Mudança alinhada com plan's must_haves: "Queue agora carrega dict {text, speaker}".

**2. [Rule 1 - API contract bug] test_chat_loop_consumes_voice_queue mock signature**
- **Found during:** Task 3 (verificação de regressão pytest)
- **Issue:** O mock de `_stream_response(config, message)` no test não aceitava o novo kwarg `speaker_result` — chat_loop agora chama `_stream_response(config, message_with_speaker, speaker_result=speaker_result)`
- **Fix:** Adicionado `speaker_result=None` ao mock signature
- **Files modified:** apps/desktop-py/tests/test_voice_modes.py
- **Commit:** 73bdb81d (Task 3)

## Issues Encountered

- **`test_ptt_mode_hotkey` continua falhando:** Falha pré-existente documentada em `deferred-items.md` do Plan 01 — causa raiz é `ImportError: cannot import name 'HotKey' from 'pynput.keyboard'` quando pynput é mockado pelo teste mas `HotKey` não é exportado pelo mock. Não relacionado a Plan 03. Out of scope.

## Deferred Issues

Nenhum novo introduzido. As 4 falhas remanescentes em `pytest tests/` (`test_config.py::test_load_config_creates_config_file`, `test_config.py::test_whisper_model_locked_default`, `test_config_persistence.py::test_config_missing_fields_get_defaults`, `test_voice_modes.py::test_ptt_mode_hotkey`) e os 17 erros em `test_pc_control.py` continuam idênticos ao baseline pré-Plan-01.

## User Setup Required

- **Para uso real do reconhecimento de voz:** usuário precisa rodar `uv sync --extra speaker` (instalar `resemblyzer` + `webrtcvad-wheels`) — já documentado no Summary do Plan 01.
- **Para habilitar:** `/config` → `9. Reconhecimento de voz` → toggle para `sim`. Depois `/config` → `10. Perfis de voz` → `1. Adicionar` para enrollar pelo menos um perfil.
- **Para verificar funcionamento:** após habilitar e enrollar, falar via voz. Console deve logar `[SPK] biel (0.82) -> biel` e `[você] [biel]: olá jarvis (voz)`.

## Next Phase Readiness

- **Phase 89 está completa após este plan:** Plans 01, 02, 03 todos verdes. Speaker recognition end-to-end funcionando no desktop-py com contrato HTTP estabelecido para o gateway.
- **Phase futura de memória/ChromaDB no gateway:** pode consumir o header `x-jarvis-speaker` para implementar o skip de gravação quando `name == "unknown"` (D-11 enforcement real). Esta plan estabeleceu o contrato — não há implementação do gateway-side.
- **Phase futura de LangGraph system prompt:** pode reconstruir o system prompt incluindo `Current speaker: {name}` lendo o header. Atualmente o LLM apenas vê o prefixo no message body (suficiente para POC), mas system prompt formal é fase futura de memória.

## Threat Flags

Nenhum threat flag novo. Os threats T-89-03-01 a T-89-03-05 do plan foram todos mitigados (T-01: dict imutável por turno; T-02: accept — header local; T-03: contrato HTTP estabelecido, enforcement futuro; T-04: try/except em `_identify_speaker_safe`; T-05: accept — assistive não authoritative).

## Self-Check: PASSED

Files exist:
- FOUND: apps/desktop-py/src/jarvis_desktop/voice_modes.py (com _identify_speaker_safe e 3 sites de Queue dict)
- FOUND: apps/desktop-py/src/jarvis_desktop/chat.py (com _build_speaker_prefix, build_request_headers(speaker_name), _stream_response(speaker_result), _await_input tupla 3, chat_loop integrado)
- FOUND: apps/desktop-py/tests/test_voice_modes.py (com 3 testes novos + 4 ajustes legacy)
- FOUND: apps/desktop-py/tests/test_chat.py (com 7 testes novos)

Commits exist:
- FOUND: 4b05d676 (Task 1 — RED tests)
- FOUND: ffcba3c2 (Task 2 — voice_modes integration)
- FOUND: 73bdb81d (Task 3 — chat integration)

Tests:
- FOUND: 10/10 novos testes do Plan 03 passando (3 voice_modes + 7 chat)
- FOUND: 7/7 Plan 01 tests (test_speaker.py) continuam verdes
- FOUND: 4/4 Plan 02 speaker tests (test_config_menu.py) continuam verdes
- FOUND: 0 regressões novas no resto da suite — apenas as 4 falhas pré-existentes documentadas

---
*Phase: 89-identifica-o-de-voz-speaker-recognition-backlog*
*Completed: 2026-05-30*
