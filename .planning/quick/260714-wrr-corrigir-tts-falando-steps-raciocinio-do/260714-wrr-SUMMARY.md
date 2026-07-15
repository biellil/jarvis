---
phase: quick
plan: 260714-wrr
subsystem: voice
tags: [tts, sse-streaming, chat, sentence-chunker, chatterbox, kokoro]

requires:
  - phase: 95-streaming-tts
    provides: SentenceChunker/tokenize_all-based streaming TTS enqueue in _read_sse_stream
provides:
  - "_read_sse_stream enfileira TTS uma única vez, no fim do stream, a partir do full_text já resolvido"
  - "Turnos agênticos não vazam mais tokens de planejamento/raciocínio para o áudio TTS"
affects: [streaming-tts, chat]

tech-stack:
  added: []
  patterns:
    - "TTS enqueue diferido: tokens acumulam em all_tokens durante o stream (display inalterado); tokenize_all(full_text) roda uma única vez após o loop SSE terminar"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_chat.py

key-decisions:
  - "Opção A (bufferizar, falar só o texto final resolvido) — latência aceita: TTS só começa no fim do stream, mas display e áudio ficam coerentes"
  - "SentenceChunker removido de chat.py (import e instância); tokenize_all é o único ponto de fatiamento de sentenças agora"

patterns-established:
  - "_first_token_ts setado no guard 'if accumulate_for_tts and _first_token_ts is None' na primeira chegada de token plano OU agent_text; anexado só ao item de índice 0 do enqueue final (TTFA preservado)"

requirements-completed: []

coverage:
  - id: D1
    description: "_read_sse_stream não enfileira mais per-token/per-agent_text; único enqueue TTS logo após full_text ser resolvido, via tokenize_all(full_text)"
    verification:
      - kind: unit
        ref: "apps/desktop-py/tests/test_chat.py#test_sse_stream_enqueues_sentences"
        status: pass
    human_judgment: false
  - id: D2
    description: "Turno agêntico (tokens de planejamento → task:plan → task:done) não vaza texto de raciocínio para _tts._tts_queue; só o summary final é enfileirado"
    verification:
      - kind: unit
        ref: "apps/desktop-py/tests/test_chat.py#test_sse_stream_agentic_turn_speaks_only_final_answer"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-07-15
status: complete
---

# Quick Task 260714-wrr: Corrigir TTS falando steps de raciocínio Summary

**TTS em `_read_sse_stream` agora enfileira sentenças uma única vez, no fim do stream, a partir do `full_text` já resolvido — nunca mais a partir de tokens de planejamento/raciocínio de turnos agênticos.**

## Performance

- **Duration:** 3min
- **Started:** 2026-07-15T02:45:00Z
- **Completed:** 2026-07-15T02:48:28Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `_read_sse_stream` (chat.py) parou de alimentar `SentenceChunker` per-token e enfileirar em `_tts._tts_queue` conforme os tokens chegavam
- Único ponto de enqueue TTS agora roda após `full_text = "".join(all_tokens)`, guardado por `accumulate_for_tts and full_text.strip()`, iterando `tokenize_all(full_text)`
- `_first_token_ts` continua sendo capturado na primeira chegada (token plano ou `agent_text`) e anexado apenas ao item de índice 0 do enqueue final — TTFA (time-to-first-audio) preservado
- Novo teste de regressão `test_sse_stream_agentic_turn_speaks_only_final_answer` comprova que nenhum item de `_tts._tts_queue` contém texto de planejamento ("Passo 1", "contexto 1"), mesmo quando ele precede `task:done` no stream
- `test_sse_stream_enqueues_sentences` (turno não-agêntico puro) continua passando sem modificação de asserts

## Task Commits

Each task was committed atomically:

1. **Task 1: Diferir enqueue de TTS para o fim do stream em `_read_sse_stream`** - `6f76191` (fix)
2. **Task 2: Teste de regressão — turno agêntico não vaza tokens de planejamento pro TTS** - `912c1d6` (test)

_Nenhuma task TDD teve fase REFACTOR — código já ficou limpo na primeira passada._

## Files Created/Modified
- `apps/desktop-py/src/jarvis_desktop/chat.py` - `_read_sse_stream` reescrito: removida a instância de `SentenceChunker` e todos os `_tts._tts_queue.put` per-token/per-agent_text; adicionado único ponto de enqueue pós-loop via `tokenize_all(full_text)`. Import trocado para `from jarvis_desktop.sentence_chunker import tokenize_all`. Docstrings do módulo e da função atualizadas (D-01 reescrito, comentários D-11 removidos junto com o código que comentavam).
- `apps/desktop-py/tests/test_chat.py` - Novo teste `test_sse_stream_agentic_turn_speaks_only_final_answer`: monta stream SSE sintético (tokens de planejamento → `task:plan` → `task:done`), assert que nenhum item enfileirado contém as substrings de planejamento e que exatamente um item carrega `first_token_ts`.

## Decisions Made
- Opção A (bufferizar e falar só o texto final resolvido) foi a única opção considerada — já vinha travada pelo usuário na fase de planejamento. Latência aceita: TTS só começa a falar no fim do stream, mas isso já é coerente com o display, que também só renderiza como bloco único no fim do stream.
- `SentenceChunker` foi completamente removido de `chat.py` (import e instanciação) — `tokenize_all` é agora o único mecanismo de fatiamento de sentenças usado por `_read_sse_stream`. Confirmado via grep que nenhum outro módulo em `apps/desktop-py/src` importava `SentenceChunker` de `chat.py`.

## Deviations from Plan

None - plan executado exatamente como escrito.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fix e teste de regressão completos; suite `test_chat.py` roda 10 passed, 1 xfailed, 3 xpassed (mesmo padrão pré-existente, sem regressão introduzida por esta mudança)
- Nenhum bloqueador para o próximo trabalho na Phase 90 (Polish & Stability)

---
*Quick task: 260714-wrr*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: apps/desktop-py/src/jarvis_desktop/chat.py
- FOUND: apps/desktop-py/tests/test_chat.py
- FOUND: commit 6f76191
- FOUND: commit 912c1d6
