# Phase 54: LLM Actions — Channel & Security — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 54-llm-actions-channel-security
**Areas discussed:** Audit log, LLM → ação, Schema WS, Timeout toast, LangGraph tool, Reconexão, Whitelist

---

## Audit Log

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway chama backend-ts | POST interno para backend-ts /internal/actions-log | ✓ |
| Backend-ts hospeda o WebSocket | Move WS para porta 8001, Electron conecta direto | |
| Gateway loga em arquivo/memória | JSON flat file ou memória no gateway | |

**User's choice:** Gateway chama backend-ts
**Notes:** Mantém separação de responsabilidades — gateway = canal, backend = persistência.

---

## LLM → Ação

| Option | Description | Selected |
|--------|-------------|----------|
| LangGraph tool | Tool `request_file_action` no LangGraph | ✓ |
| ChatSession intercepta JSON | Parse de JSON especial no texto do LLM | |
| Endpoint HTTP separado | Usuário confirma, frontend chama HTTP | |

**User's choice:** LangGraph tool
**Notes:** Segue o padrão de tools existentes no LangGraph.

---

## Schema WS

| Option | Description | Selected |
|--------|-------------|----------|
| Com requestId | `{type, requestId, action, path, model}` ↔ `{requestId, status}` | ✓ |
| Simples sem correlação | `{action, path}` ↔ `{action, status}` | |

**User's choice:** Com requestId
**Notes:** Necessário para correlacionar ACK com requisição no toast de confirmação.

---

## Timeout Toast

| Option | Description | Selected |
|--------|-------------|----------|
| Electron controla | setTimeout 10s no Electron, manda ACK timeout | ✓ |
| Backend controla | Promise.race(ack, timeout) no backend | |
| Ambos com timer próprio | Timer independente em cada lado | |

**User's choice:** Electron controla

---

## LangGraph Tool — Comportamento

| Option | Description | Selected |
|--------|-------------|----------|
| Bloqueia até ACK | await ACK com timeout 12s | ✓ |
| Fire-and-forget | Manda mensagem e retorna imediatamente | |

**User's choice:** Bloqueia até ACK (12s = 10s toast + 2s folga)

---

## Reconexão WebSocket

| Option | Description | Selected |
|--------|-------------|----------|
| Backoff exponencial | 1s → 2s → 4s → 8s → máx 30s | ✓ |
| Intervalo fixo | Tenta a cada 5s indefinidamente | |

**User's choice:** Backoff exponencial

---

## Whitelist de Paths

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway resolve | Validação Zod no gateway, rejeições auditadas | ✓ |
| Electron resolve | Gateway passa tudo, Electron valida localmente | |

**User's choice:** Gateway resolve
**Notes:** Rejeições por whitelist também geram entrada no audit log.

---

## Deferred Ideas

- Múltiplos Electron clients simultâneos — já out-of-scope em v2.2
- Execução real de ações no OS — Phase 55
