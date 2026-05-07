# Phase 61: Embedding Priority Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 61-embedding-priority-queue
**Areas discussed:** Queue Architecture, saveTurn, Mecanismo de Preempção, AbortController

---

## Queue Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| EmbeddingQueue singleton | Criar embedding-queue.ts separado; vectors.ts chama enqueueEmbed() | ✓ |
| Dentro de vectors.ts | p-queue como campo privado de MemoryVectors | |
| No nível de chat-session.ts | Wrapping apenas dos void calls | |

**User's choice:** EmbeddingQueue singleton (Recomendado)
**Notes:** Separação de responsabilidade, ponto único de controle, fácil de testar.

---

## saveTurn

| Option | Description | Selected |
|--------|-------------|----------|
| saveTurn vira fire-and-forget via queue | void memory.saveTurn() — SQLite permanece imediato dentro de saveTurn | ✓ |
| Manter await, mas só para SQLite | Separar saveTurn: SQLite awaited, embedding fire-and-forget | |
| Manter await completo | Apenas void calls atuais passam pelo queue | |

**User's choice:** saveTurn vira fire-and-forget via queue (Recomendado)
**Notes:** Consistente com os outros void calls. SQLite permanece síncrono dentro de saveTurn antes do enqueue de Chroma.

---

## Mecanismo de Preempção

| Option | Description | Selected |
|--------|-------------|----------|
| queue.pause() / queue.resume() | Antes do LLM call; simples, sem AbortController no hot path | ✓ |
| AbortController por tarefa + abort() | Mais agressivo; exige suporte de AbortSignal em embedText() | |
| Priority-only sem pausa explícita | Chat add com priority 10; sem pausa — pode não cumprir SLA 100ms | |

**User's choice:** queue.pause() / queue.resume() em torno do LLM call (Recomendado)
**Notes:** O pause/resume impede novas tarefas de embed de iniciar durante o LLM call. Tarefas já enfileiradas aguardam.

---

## AbortController com @xenova/transformers

| Option | Description | Selected |
|--------|-------------|----------|
| Investigar suporte + wrapper best-effort | Pesquisador confirma; se não suportar, descarta resultado silenciosamente | ✓ |
| Timeout wrapper fixo | Promise.race com timeout de 5s | |
| Sem AbortController para embedText | AbortController apenas para Map cleanup, não para pipeline | |

**User's choice:** Investigar suporte + wrapper best-effort (Recomendado)
**Notes:** Pesquisador deve verificar se @xenova/transformers pipeline() aceita AbortSignal. Comportamento best-effort se não suportar.

---

## Claude's Discretion

- Nome exato das funções exportadas por embedding-queue.ts
- Concurrency do p-queue (1 por padrão)
- Se saveTurn separa explicitamente SQLite de Chroma ou mantém método intacto
