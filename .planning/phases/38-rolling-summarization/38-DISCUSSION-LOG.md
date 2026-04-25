# Phase 38: Rolling Summarization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-04-25
**Phase:** 38-rolling-summarization
**Areas discussed:** Trigger de Sumarização, O que 'sumarizar' faz no SQLite, Como buildContext() acessa o summary, O que conta como '20 mensagens'

---

## Trigger de Sumarização

| Option | Description | Selected |
|--------|-------------|----------|
| Fire-and-forget após cada turn | void _runRollingSummary(convId) em send()/sendStream() após saveTurn(). Zero impacto no pipeline. Segue padrão Phase 36. | ✓ |
| Shutdown gracioso (SIGTERM) | Sumarizar ao fechar servidor. Confiável apenas com graceful shutdown. | |
| Timer background (setInterval) | Verificar periodicamente. Desacoplado, mas complexidade adicional. | |

**User's choice:** Fire-and-forget após cada turn
**Notes:** Usuário pediu análise de vantagens/desvantagens antes de decidir. Escolheu após ver pros/cons.

---

## O que 'sumarizar' faz no SQLite

| Option | Description | Selected |
|--------|-------------|----------|
| DELETE + INSERT | Deletar as 10 rows de messages + inserir 1 row em summaries. Raw messages somem. | ✓ |
| Marcar como summarized | Adicionar coluna 'summarized: boolean'. Sem DELETE. | |
| Mover para tabela archive | Mover msgs para messages_archive antes de deletar. | |

**User's choice:** DELETE + INSERT

### Quem gera o texto (LLM call)

| Option | Description | Selected |
|--------|-------------|----------|
| MemoryManager._runRollingSummary() | Usa this.llm, método privado. Centraliza na classe. | ✓ |
| Classe separada RollingSummarizer | Novo arquivo summarizer.ts, similar ao extractor.ts. | |

**User's choice:** MemoryManager._runRollingSummary()

---

## Como buildContext() acessa o summary

| Option | Description | Selected |
|--------|-------------|----------|
| MemoryManager cacheia internamente | private _latestSummary: string \| null. buildContext usa rollingSum ?? this._latestSummary. Call sites não mudam. | ✓ |
| ChatSession passa explicitamente | ChatSession chama getRollingSummary(convId) e passa para buildContext(). | |

**User's choice:** MemoryManager cacheia internamente

---

## O que conta como '20 mensagens'

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite (convId corrente) | COUNT WHERE conversationId = convId AND role IN ('user','assistant'). | ✓ |
| ChatSession.history (in-memory) | Contar len(history). Inclui SystemMessage/ToolMessages. | |
| Acumulado cross-session | Somar mensagens de todas as conversas. | |

**User's choice:** SQLite (convId corrente)
**Notes:** Usuário perguntou sobre usar in-memory history. Após explicação da diferença, confirmou SQLite.

---

## Claude's Discretion

- Nome exato do método público no MemoryManager
- Se popular _latestSummary no startup buscando do SQLite
- Prompt exato para o LLM ao gerar o sumário
- Estratégia de error handling (recomendado: mesmo padrão silencioso)

## Deferred Ideas

Nenhuma.
