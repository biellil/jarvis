---
phase: quick
plan: 260714-wrr
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop-py/src/jarvis_desktop/chat.py
  - apps/desktop-py/tests/test_chat.py
autonomous: true
requirements: []

must_haves:
  truths:
    - "Em turnos agênticos, tokens de planejamento/raciocínio (tudo que chega ANTES de task:plan) nunca são enfileirados em _tts._tts_queue"
    - "Apenas o texto final resolvido (task:done summary, ou o full_text acumulado em turnos não-agênticos) é fatiado em sentenças e enfileirado — uma única vez, após o fim do stream"
    - "_first_token_ts continua sendo capturado na primeira chegada (token plano OU agent_text) e é anexado apenas ao primeiro item enfileirado (TTFA preservado)"
    - "test_sse_stream_enqueues_sentences (turno não-agêntico puro) continua passando sem modificação de asserts"
    - "Novo teste de regressão comprova que nenhum item de _tts._tts_queue contém texto de planejamento, mesmo quando ele precede o task:done no stream"
  artifacts:
    - path: "apps/desktop-py/src/jarvis_desktop/chat.py"
      provides: "_read_sse_stream sem enqueue per-token/per-agent_text; único ponto de enqueue TTS logo após full_text ser resolvido"
      contains: "tokenize_all(full_text)"
    - path: "apps/desktop-py/tests/test_chat.py"
      provides: "teste de regressão para turno agêntico com tokens de planejamento + task:plan + task:done"
      contains: "def test_sse_stream_agentic_turn_speaks_only_final_answer"
  key_links:
    - from: "_read_sse_stream loop (tokens planos + agent_text de task:done)"
      to: "all_tokens (buffer de display)"
      via: "append inalterado; task:plan e task:done continuam fazendo all_tokens.clear() antes de reacumular"
    - from: "full_text = ''.join(all_tokens) (calculado após o loop)"
      to: "_tts._tts_queue.put(...)"
      via: "tokenize_all(full_text) — único enqueue da função, guardado por accumulate_for_tts and full_text.strip()"
    - from: "primeiro token plano OU primeiro agent_text não vazio"
      to: "_first_token_ts"
      via: "guard 'if _first_token_ts is None' — setado uma única vez, reaproveitado no item de índice 0 do enqueue final"
---

<objective>
Corrigir o TTS falando steps/raciocínio do LLM em turnos agênticos ("Passo 1", "contexto 1", etc.)
— o áudio deve falar SÓ a mensagem final, igual ao que aparece na tela.

Root cause (já diagnosticado, não re-investigar): em `_read_sse_stream` (chat.py), tokens SSE
planos (`event_type is None`) eram alimentados a um `SentenceChunker` e enfileirados em
`_tts._tts_queue` IMEDIATAMENTE conforme chegavam. Em turnos agênticos, o gateway manda os
tokens de planejamento/raciocínio da LLM primeiro (como tokens planos), e só depois emite
`task:plan` (que faz `all_tokens.clear()` — mas isso só limpa o buffer de DISPLAY, não drena
a fila de TTS já enfileirada) e por fim `task:done` com a resposta real. Resultado: a tela
mostra só a resposta final limpa, mas o áudio já falou os passos de planejamento.

Fix travado (Opção A — bufferizar, falar só o texto final resolvido): parar de enfileirar em
`_tts._tts_queue` durante o stream. Tokens continuam acumulando em `all_tokens` exatamente
como hoje (lógica de display inalterada). Só DEPOIS que o stream terminar e `full_text` for
calculado, fatiar `full_text` via `tokenize_all()` e enfileirar cada sentença. Fatiamento
continua permitido (múltiplas chamadas de TTS são ok — usuário aprovou), só não pode falar
os steps/raciocínio. Latência (TTS só começa no fim do stream) é aceita — o display já
renderiza como um bloco só no fim do stream, então texto e voz ficam coerentes.

Purpose: áudio == texto exibido, sempre — sem vazar raciocínio interno da LLM pro usuário.
Output: `_read_sse_stream` corrigido em chat.py + teste de regressão em test_chat.py.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/desktop-py/src/jarvis_desktop/chat.py
@apps/desktop-py/tests/test_chat.py
@apps/desktop-py/src/jarvis_desktop/sentence_chunker.py
@apps/desktop-py/src/jarvis_desktop/tts.py
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Diferir enqueue de TTS para o fim do stream em _read_sse_stream</name>
  <files>apps/desktop-py/src/jarvis_desktop/chat.py</files>
  <behavior>
    - Stream agêntico (tokens de planejamento planos → task:plan → task:done com summary):
      _tts._tts_queue recebe SÓ as sentenças do summary; zero itens contendo texto de
      planejamento.
    - Stream não-agêntico puro (só tokens planos, sem eventos nomeados): _tts._tts_queue
      ainda recebe as sentenças do full_text acumulado no fim do stream (comportamento do
      test_sse_stream_enqueues_sentences existente preservado).
    - O primeiro item enfileirado, em qualquer um dos dois casos, carrega a chave
      first_token_ts (TTFA preservado); nenhum outro item carrega essa chave.
  </behavior>
  <action>
Editar `_read_sse_stream` em chat.py (função atual entre as linhas ~458-576).

**1. Import no topo do arquivo (linha ~38):** trocar
`from jarvis_desktop.sentence_chunker import SentenceChunker, tokenize_all` por
`from jarvis_desktop.sentence_chunker import tokenize_all` — `SentenceChunker` só é
usado dentro desta função (confirmado via grep no repo: nenhum outro módulo em
`apps/desktop-py/src` importa `SentenceChunker` de `chat.py`; o único outro consumidor é
`sentence_chunker.py`/`test_sentence_chunker.py`, que importam direto do módulo).

**2. Remover o estado do chunker:** apagar a linha `chunker = SentenceChunker()` e a
variável `_tts_turn_started` (não é mais necessária). Manter `_first_token_ts: "float | None" = None`.

**3. No loop principal (`while True: ... for event_type, payload in events:`), branch de
token plano (`event_type is None`):** manter o `all_tokens.append(token_text)` como está.
Trocar o bloco `if accumulate_for_tts: if _first_token_ts is None: ... for sent in
chunker.feed(token_text): ... _tts._tts_queue.put(item)` por apenas: se `accumulate_for_tts`
e `_first_token_ts is None`, setar `_first_token_ts = time.perf_counter()`. Não chamar mais
`_tts._tts_queue.put` neste ponto.

**4. No mesmo loop, branch `else` (eventos nomeados):** manter o
`if event_type == "task:plan": all_tokens.clear()` e a chamada a `_handle_agentic_event`
como estão. No bloco `if agent_text and accumulate_for_tts:`, manter
`all_tokens.clear()` + `all_tokens.append(agent_text)`, mas trocar o
`for i, sent in enumerate(tokenize_all(agent_text)): ... _tts._tts_queue.put(item)` por
apenas: se `_first_token_ts is None`, setar `_first_token_ts = time.perf_counter()`. Não
enfileirar nada aqui.

**5. No branch de flush do buffer incompleto (bloco `if buffer.strip():` logo após o
`while True`, que repete a mesma lógica para o tail incompleto):** aplicar exatamente as
mesmas duas mudanças dos passos 3 e 4 (mesmo padrão, mesmo guard `if _first_token_ts is
None`), removendo os dois `_tts._tts_queue.put` desse bloco também.

**6. Remover o bloco `if accumulate_for_tts: for sent in chunker.flush_remaining():
_tts._tts_queue.put({"text": sent})`** que hoje roda logo antes do comentário
"Print complete response via sys.stdout.write()".

**7. Adicionar o único ponto de enqueue da função**, imediatamente após a linha
`full_text = "".join(all_tokens)` e antes do bloco de display (`if full_text.strip():
display = ...`): quando `accumulate_for_tts` for verdadeiro e `full_text.strip()` for
verdadeiro, iterar `tokenize_all(full_text)` com índice; para cada sentença montar
`item = {"text": sent}`; quando o índice for 0 e `_first_token_ts is not None`, incluir
`item["first_token_ts"] = _first_token_ts`; chamar `_tts._tts_queue.put(item)` para cada
item. Este é o ÚNICO lugar da função que chama `_tts._tts_queue.put` depois do fix.

**8. Atualizar comentários/docstrings que ficam desatualizados com a mudança** (Respeitar
referências STTS-01/D-01/D-11 — atualizar, não remover a rastreabilidade):
   - Docstring do módulo (topo do arquivo, linha ~17: `Phase 95: Streaming TTS — sentence
     chunker feeds _tts_queue; speak(full_text) removed.`) — acrescentar uma linha nova
     `Quick 260714-wrr: TTS enqueue diferido para o fim do stream — fala só o full_text
     resolvido, nunca tokens de planejamento/raciocínio de turnos agênticos.`
   - Linha `D-01: TTS after full stream completes — speak(full_text, config) after SSE
     loop` (linha ~20, já desatualizada desde a Fase 95) — reescrever para refletir o
     estado atual: TTS é enfileirado a partir do full_text resolvido, uma única vez, após
     o fim do loop SSE (não mais per-token).
   - Docstring da própria função `_read_sse_stream` (linhas ~464-474, o parágrafo que
     começa com "Phase 95: Feeds tokens into SentenceChunker and enqueues complete
     sentences...") — reescrever para descrever o comportamento novo: tokens e agent_text
     continuam acumulando em `all_tokens` durante o stream (display inalterado); o enqueue
     de TTS acontece uma única vez, no fim, a partir do `full_text` já resolvido — por
     isso o áudio nunca fala tokens de planejamento descartados por `all_tokens.clear()`
     em `task:plan`/`task:done`.
   - Os dois comentários inline `# Phase 95 D-11: route task:done summary through
     sentence chunker (same chunker as plain tokens — ensures agentic turns also stream)`
     (um no loop principal, outro no flush do buffer) — remover junto com o código que
     comentam (passo 4 e 5); a explicação do D-11 atualizado já fica coberta pela
     docstring da função reescrita no item acima.

Não alterar a lógica de display (impressão via `sys.stdout.write`) nem o valor de retorno
da função — `full_text` continua sendo retornado exatamente como hoje.
  </action>
  <verify>
    <automated>cd apps/desktop-py && count=$(grep -v '^[[:space:]]*#' src/jarvis_desktop/chat.py | grep -c -E 'SentenceChunker\(|chunker\.feed|chunker\.flush_remaining'); test "$count" = "0" && uv run pytest tests/test_chat.py -k test_sse_stream_enqueues_sentences -q</automated>
  </verify>
  <done>
    - `SentenceChunker` não é mais importado nem instanciado em chat.py (grep fora de comentários retorna 0 ocorrências de `SentenceChunker(`, `chunker.feed`, `chunker.flush_remaining`)
    - `_tts._tts_queue.put` é chamado em exatamente um lugar de `_read_sse_stream`, após `full_text = "".join(all_tokens)`, guardado por `accumulate_for_tts and full_text.strip()`
    - `test_sse_stream_enqueues_sentences` continua passando sem alteração de asserts
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Teste de regressão — turno agêntico não vaza tokens de planejamento pro TTS</name>
  <files>apps/desktop-py/tests/test_chat.py</files>
  <behavior>
    - Stream sintético com tokens planos de "planejamento" (ex: "Passo 1: verificando conta
      bancária." e "contexto 1: saldo insuficiente.") seguidos de um evento nomeado
      `task:plan` e depois `task:done` carregando a resposta final real.
    - Após `_read_sse_stream(...)`, todos os itens drenados de `_tts._tts_queue` contêm
      SÓ texto derivado da resposta final — nenhum item contém qualquer trecho dos tokens
      de planejamento.
    - Exatamente um item da fila carrega a chave `first_token_ts` (o primeiro).
  </behavior>
  <action>
Adicionar um novo teste em `tests/test_chat.py`, logo após `test_sse_stream_enqueues_sentences`
(seção "Phase 95: Streaming TTS — sentence producer integration (STTS-01)", ~linha 368),
nomeado `test_sse_stream_agentic_turn_speaks_only_final_answer`. Assinatura igual à do teste
vizinho: `def test_sse_stream_agentic_turn_speaks_only_final_answer(mock_kokoro_engine,
mock_sounddevice_play):` — mesmos fixtures, mesmo padrão de mock.

Montar os bytes SSE sintéticos concatenando três blocos, na ordem:
1. Dois ou mais tokens planos (linhas `data: <token>\n\n`, sem `event:`) cujo texto junto
   forme algo como "Passo 1: verificando conta bancária. Consultando contexto 1: saldo
   insuficiente." — use texto claramente identificável como "raciocínio", incluindo as
   substrings literais `Passo 1` e `contexto 1` (citadas aqui só como referência do que
   o teste deve conter — usar variações de texto de planejamento à vontade, desde que
   contenham esses marcadores para a assertion negativa).
2. Um evento nomeado `task:plan`: linha `event: task:plan\n` seguida de `data: <json>\n\n`,
   onde `<json>` é `json.dumps({"taskId": "t1", "plan": {"steps": []}}, ensure_ascii=False)`
   — mesmo formato usado por `parse_sse_chunk` (linha `event: <nome>` + `data: <payload>`,
   terminado em linha em branco dupla). Ver `parse_sse_chunk` em chat.py (~linha 72-119)
   para o formato exato esperado.
3. Um evento nomeado `task:done`: linha `event: task:done\n` seguida de `data: <json>\n\n`,
   onde `<json>` é `json.dumps({"taskId": "t1", "summary": "Pagamento realizado com
   sucesso."}, ensure_ascii=False)`. `_handle_agentic_event` (chat.py ~linha 335-339) lê
   `data.get("summary", "").strip()` e retorna essa string — é isso que vira `agent_text`
   e acaba em `all_tokens`/`full_text`.

Codificar tudo em `.encode()` (UTF-8) e concatenar num único `sse_bytes`, igual ao padrão
de `test_sse_stream_enqueues_sentences` (linhas 327-329: `sse_bytes += f"data: {t}\n\n"
.encode()` por token — reaproveitar essa estrutura, só que intercalando os dois eventos
nomeados no final).

Mock de `response`: mesmo padrão do teste vizinho — `mock_response = unittest.mock.MagicMock()`
com `.read.side_effect` que devolve `sse_bytes` na primeira chamada e `b""` depois (função
`mock_read(n)` com `call_count` list, igual ao existente).

Antes de chamar `_read_sse_stream`, drenar `_tts._tts_queue` com o mesmo loop
`while True: try: _tts._tts_queue.get_nowait() except queue.Empty: break` do teste vizinho.

Chamar dentro de `with unittest.mock.patch("jarvis_desktop.tts.start_tts_worker"):`
`result = _read_sse_stream(mock_response, config, accumulate_for_tts=True,
main_stream=False)`.

Assertions:
- `result == "Pagamento realizado com sucesso."` (o texto de planejamento não deve
  sobreviver no valor de retorno — prova que `all_tokens.clear()` do `task:plan`/`task:done`
  continua funcionando).
- Drenar a fila em uma lista de dicts completos (não só o texto, para poder checar
  `first_token_ts`): `enqueued: list[dict] = []` populado via `_tts._tts_queue.get_nowait()`
  até `queue.Empty`.
- `len(enqueued) >= 1`.
- Para cada item em `enqueued`, `item["text"]` não contém nenhuma das substrings de
  planejamento usadas no passo 1 (ex: `"Passo 1"` e `"contexto 1"`) — iterar e assertar
  `phrase not in item["text"]` para cada marcador, com mensagem de falha mostrando
  `enqueued` completo.
- Todo texto concatenado dos itens enfileirados (`" ".join(i["text"] for i in enqueued)`)
  contém `"Pagamento realizado"` — prova que a resposta final chegou na fila.
- Exatamente um item de `enqueued` tem a chave `"first_token_ts"` (o primeiro, índice 0);
  os demais não têm essa chave — assertar `sum(1 for i in enqueued if "first_token_ts"
  in i) == 1` e `"first_token_ts" in enqueued[0]`.

Não modificar `test_sse_stream_enqueues_sentences` nem nenhum outro teste existente no
arquivo — apenas adicionar o novo teste.
  </action>
  <verify>
    <automated>cd apps/desktop-py && uv run pytest tests/test_chat.py -k "sse_stream" -v</automated>
  </verify>
  <done>
    - `test_sse_stream_agentic_turn_speaks_only_final_answer` PASSED
    - `test_sse_stream_enqueues_sentences` PASSED (sem regressão)
    - `pytest tests/test_chat.py -k sse_stream`: 2 passed, 0 failed
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gateway SSE stream → `_read_sse_stream` | Já existente, não alterado nesta mudança — payloads JSON de eventos nomeados seguem parseados via `json.loads` com `except json.JSONDecodeError` (chat.py ~290-295) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick260714wrr-01 | Information Disclosure | `_tts._tts_queue` (fila interna, mesmo processo) | low | accept | Mudança é puramente sobre QUANDO/O-QUE é enfileirado (fim do stream vs per-token), não introduz nova fronteira de confiança nem novo parsing de input não confiável — o `json.loads` de `task:plan`/`task:done` já existe e não é tocado por este fix |

Nenhum novo pacote, endpoint externo ou superfície de ataque introduzido — mudança é
reordenação de fluxo de dados dentro do mesmo processo local.
</threat_model>

<verification>
```bash
cd apps/desktop-py

# 1. Testes de streaming TTS passam (regressão + novo)
uv run pytest tests/test_chat.py -k "sse_stream" -v

# 2. Suite completa de test_chat.py não quebrou
uv run pytest tests/test_chat.py -q

# 3. Confirma que SentenceChunker não é mais usado em chat.py fora de comentários
grep -v '^[[:space:]]*#' src/jarvis_desktop/chat.py | grep -c -E 'SentenceChunker\(|chunker\.feed|chunker\.flush_remaining'
```
</verification>

<success_criteria>
- `pytest tests/test_chat.py -k sse_stream` — 2 passed, 0 failed
- `pytest tests/test_chat.py` — suite completa sem regressão
- `_read_sse_stream` enfileira TTS uma única vez, a partir do `full_text` resolvido, nunca
  a partir de tokens de planejamento/raciocínio pré-`task:plan`
- Commits sugeridos (Conventional Commits + emoji, sem assinatura Claude — CLAUDE.md):
  - `🐛 fix(chat): TTS enfileira apenas texto final resolvido, nunca steps de raciocínio`
  - `✅ test(chat): regressão — turno agêntico não vaza tokens de planejamento pro TTS`
</success_criteria>

<output>
Criar `.planning/quick/260714-wrr-corrigir-tts-falando-steps-raciocinio-do/260714-wrr-SUMMARY.md`
com: arquivos modificados, decisão de design aplicada (enqueue diferido para fim do stream),
commit hash(es), e resultado dos testes.
</output>
