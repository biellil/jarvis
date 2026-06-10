# Phase 95: Streaming TTS - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS começa a falar a primeira frase enquanto o LLM ainda está gerando o resto da
resposta, em vez de esperar a resposta completa. Entrega: segmentação de fronteira de
sentença em PT-BR + worker TTS assíncrono que consome um buffer de frases sem bloquear o
stream de tokens do LLM + medição de TTFA (time-to-first-audio) ≤300ms p95.

**Requisitos:** STTS-01 (chat.py acumula tokens e faz flush em fronteira de frase),
STTS-02 (nltk PunktSentenceTokenizer PT trata Dr./Sr./Sra./etc., diálogo citado, elipses),
STTS-03 (worker thread consome buffer de frases sem bloquear o stream), STTS-04 (TTFA≤300ms p95).

**Pitfall crítico do roadmap:** P-3 (detecção de fronteira de sentença PT-BR) — validar com
corpus de teste de 50 frases ANTES de shipar. Deferir a fase se a validação falhar.

**Fora de escopo (capacidades novas → outras fases):** dashboards Langfuse e alertas (Fase 96),
Whisper streaming, qualquer mudança no contrato de eventos SSE do backend.

</domain>

<decisions>
## Implementation Decisions

### Segmentação de frases (PT-BR)
- **D-01:** Detector primário = **`nltk` PunktSentenceTokenizer modelo `punkt_tab` português, VENDORIZADO** — empacotar o pickle PT (~649KB) no repositório e carregar via `nltk.data.path` (definido ANTES do primeiro uso). **NUNCA** chamar `nltk.download()` em runtime — viola o princípio offline/privacidade-first. `nltk` passa a ser dependência nova do `desktop-py`; **pinar a versão** do nltk (punkt_tab quebrou compatibilidade na 3.8.2).
- **D-02:** Fallback de segmentação = **segmentador regex + lista de abreviações PT-BR** (puro-Python, zero deps), já implementado e pronto para o caminho de falha do pitfall P-3. Se o corpus de validação de 50 frases reprovar o punkt, o fallback assume sem bloquear a fase.
- **D-03:** Lista de abreviações deve cobrir no mínimo: `Dr.`, `Sr.`, `Sra.`, `etc.`, `Exmo.`, mais elipses, diálogo citado e listas numeradas — sem produzir chunks de uma palavra (áudio picado).
- **D-04:** Validação obrigatória: corpus de 50 frases PT-BR (success criterion #2 + pitfall P-3) antes de shipar.

### Estratégia de chunking / TTFA
- **D-05:** Estratégia do **primeiro chunk = híbrida**: flush na primeira fronteira de sentença **OU** após ~60-80 chars acumulados, o que vier primeiro. Chunks subsequentes usam fronteiras de frase inteiras (prosódia natural). Único caminho realista para TTFA≤300ms p95 quando o LLM abre com frase longa (padrão de produção, ref. Deepgram 50-100 chars).
- **D-06:** Guarda de tamanho mínimo de chunk ~15-20 chars — funde fragmentos minúsculos para evitar áudio picado de 1-3 palavras.

### Worker TTS & barge-in
- **D-07:** Concorrência = **1 daemon thread serial + 1 `queue.Queue`** (produtor = loop SSE em `chat.py`; consumidor = worker TTS). Sintetiza e toca cada frase em ordem FIFO. `_is_playing` fica num único thread → sem race com `voice_modes.is_speaking()`. Mesmo padrão do `sse_listener` daemon. (Pode evoluir para 2 estágios com pipelining numa fase futura se houver gaps audíveis.)
- **D-08:** Backpressure = **`queue.Queue(maxsize=2-3)`** — o loop SSE bloqueia naturalmente quando a fila enche, evitando crescimento ilimitado de memória se o TTS for mais lento que o stream de tokens.
- **D-09:** `_is_playing` vira `True` ao desenfileirar a primeira frase e `False` somente quando a fila esvazia E a reprodução termina (cobre o drain inteiro, não uma frase só). `is_speaking()` deve permanecer `True` durante todo o drain multi-frase (anti-feedback de `voice_modes`).
- **D-10:** Barge-in / `stop_tts()`: drenar a fila **consumindo** os itens (NÃO `queue.queue.clear()`, que não é thread-safe) + `sd.stop()` + sentinela (poison-pill); descartar todas as frases pendentes do turno abortado. Limpar `_is_playing` no mesmo thread que chama `sd.stop()`.

### Streaming vs fluxos agênticos
- **D-11:** Estratégia = **Opção D — streamar turnos plain ao vivo + chunkar o `task:done`**. Turnos plain (só tokens) streamam frase-a-frase ao vivo; quando chega `task:done`, o texto final é roteado pelo **mesmo chunker de frases** (em vez de `speak()` monolítico). Elimina mismatch áudio↔texto por construção; turnos agênticos também ganham chunking.
- **D-12:** **Pré-requisito a VALIDAR na pesquisa/planejamento:** confirmar que o payload de `task:done` sempre contém o texto final completo. Se o contrato for instável, fallback = **Opção A (gate por modo: streaming só em plain, agêntico cai no speak-after-full-stream atual)**.
- **D-13:** Lembrar do comportamento atual de `_read_sse_stream`: `task:plan` limpa tokens acumulados, `task:done` substitui o buffer. A implementação de streaming deve respeitar isso — não falar tokens de planejamento que serão descartados.

### Medição de TTFA
- **D-14:** Medição na Fase 95 = **linha de log estruturada via loguru, client-side** (relógio do primeiro-token-recebido até o primeiro-sample-de-áudio-tocado, em `desktop-py`). Zero deps novas; schema estável que a **Fase 96 consome** para os dashboards Langfuse. A frase "via Langfuse spans" de STTS-04 descreve o estado observável final (pós-Fase 96), NÃO o mecanismo de implementação da Fase 95. NÃO adicionar o SDK Langfuse ao `desktop-py` nesta fase (evita scope creep e "telefonar pra casa" em `local_only`).

### Escopo de provider
- **D-15:** **Todos os 4 providers recebem streaming sentence-by-sentence** (Kokoro, Chatterbox, ElevenLabs, Murf). Decisão do usuário, ciente do trade-off de cloud.
- **D-16:** Cloud (ElevenLabs/Murf) = **API de streaming chunked nativa por provider** (ex: ElevenLabs `/v1/text-to-speech/{voice_id}/stream` ou WebSocket; Murf streaming endpoint) — uma conexão por turno, sem multiplicar chamadas REST. **A pesquisar:** disponibilidade/latência dos endpoints de streaming por provider e por plano de assinatura.
- **D-17:** **Alvo TTFA≤300ms p95 (STTS-04) aplica-se SOMENTE ao caminho default Kokoro offline.** Chatterbox e cloud streamam em best-effort, com TTFA **logado** mas SEM garantia de 300ms (RTT de rede e warmup de GPU estão fora do controle). O critério de sucesso da fase é medido no Kokoro.

### Claude's Discretion
- Estrutura interna do segmentador (módulo novo vs função em `tts.py`); nomes de funções/threads.
- Mecânica exata do sentinela/poison-pill e do timeout de join do thread.
- Layout do schema do log de TTFA (desde que estável e parseável pela Fase 96).
- Onde armazenar o pickle vendorizado do punkt_tab no repo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requisitos
- `.planning/ROADMAP.md` §"Phase 95: Streaming TTS" — goal, 4 success criteria, pitfall P-3.
- `.planning/REQUIREMENTS.md` STTS-01..04 (linhas ~48-51) — texto literal dos requisitos.
- `.planning/ROADMAP.md` §"Phase 96: Performance Metrics" — confirma que Langfuse dashboards/alertas (PERF-01..05) pertencem à Fase 96, NÃO à 95.

### Código a modificar/reusar
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_read_sse_stream()` (~L454, acumula tokens, trata `task:plan`/`task:done`), `_stream_response()` (~L554, chama `speak(full_text)` após o loop). Ponto de integração do produtor de frases.
- `apps/desktop-py/src/jarvis_desktop/tts.py` — `speak()` (~L158, blocante hoje), `stop_tts()` (~L208, `_stop_event`+`sd.stop()`), `is_speaking()`/`_is_playing` (~L298), `_lock`. Providers: `_kokoro_speak` (~L338), `_elevenlabs_speak` (~L394), `_murf_speak` (~L444), `_chatterbox_speak` (~L714). Worker TTS e refactor de `speak()` entram aqui.
- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — consome `tts.is_speaking()` para bloquear captura de mic durante a fala (anti-feedback). Não quebrar esse contrato no drain multi-frase.
- `apps/desktop-py/src/jarvis_desktop/sse_listener.py` — padrão de daemon thread já usado no projeto (referência para o worker TTS).
- `apps/desktop-py/pyproject.toml` — onde adicionar `nltk` (pinado) e o asset vendorizado do punkt_tab.

### Externos (a pesquisar na fase de research)
- NLTK `punkt_tab` português — como vendorizar o pickle e configurar `nltk.data.path` offline; mudança de compatibilidade na 3.8.2.
- ElevenLabs streaming TTS API (`/stream` REST chunked / WebSocket) — latência e disponibilidade.
- Murf streaming TTS API — disponibilidade por plano.
- Chatterbox — comportamento de warmup vs streaming/cold start.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`queue.Queue` + daemon thread**: padrão já usado (`sse_listener.py`, fila de captura de voz `{text, speaker}`). Reusar para o worker TTS (D-07).
- **`stop_tts()` / `_stop_event` / `sd.stop()`**: mecânica de parada já existe — estender para drenar a fila no barge-in (D-10).
- **Providers `_kokoro_speak`/`_elevenlabs_speak`/`_murf_speak`/`_chatterbox_speak`**: cada um já sintetiza+toca uma string; o worker chama esses por frase. ElevenLabs/Murf precisam de novo caminho de streaming chunked (D-16).
- **loguru/rich**: stack de logging já presente — usar para o log de TTFA (D-14).

### Established Patterns
- `_is_playing` global + `_lock` + `is_speaking()` poll por `voice_modes` (anti-feedback). Manter correto no drain multi-frase (D-09).
- `_read_sse_stream` distingue `main_stream` (resposta primária) de streams secundários; `task:plan` limpa tokens, `task:done` substitui (D-13).

### Integration Points
- Produtor de frases: dentro de `_read_sse_stream` no `chat.py`, onde tokens plain são acumulados.
- Consumidor: novo worker TTS no `tts.py`, substituindo o `speak(full_text)` blocante chamado em `_stream_response`.
- `task:done` handler: rotear o texto final pelo chunker (D-11) em vez de `speak()` direto.

</code_context>

<specifics>
## Specific Ideas

- Usuário escolheu explicitamente **todos os 4 providers** com streaming (não só o default), e **streaming chunked nativo** para cloud em vez de REST por frase — priorizando UX uniforme, ciente do trade-off.
- TTFA logado para todos os providers, mas o **gate de sucesso ≤300ms p95 é só Kokoro** — decisão pragmática para manter o critério realista.

</specifics>

<deferred>
## Deferred Ideas

- **Worker TTS em 2 estágios com pipelining** (synth N+1 enquanto N toca) — adiar; começar serial (D-07) e promover se houver gaps audíveis.
- **SDK Langfuse no desktop-py / dashboards / alertas de TTFA** — pertence à **Fase 96** (Performance Metrics).
- **Keep-alive de modelo Chatterbox** para evitar warmup no cold start do streaming — considerar se o TTFA do Chatterbox incomodar.
- **Whisper streaming** (transcrever enquanto o usuário fala) — milestone v3.6 target list, fase separada.

None reviewed via todos (nenhum todo relevante casou com a fase).

</deferred>

---

*Phase: 95-streaming-tts*
*Context gathered: 2026-06-10*
