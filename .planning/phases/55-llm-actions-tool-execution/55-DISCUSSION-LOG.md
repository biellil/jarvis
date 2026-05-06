# Phase 55: LLM Actions — Tool Execution — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-05-06
**Phase:** 55-llm-actions-tool-execution
**Areas discussed:** viewContent delivery, closeFile/closeFolder approach, LangGraph→gateway bridge, execution trigger

---

## viewContent — Como o conteúdo chega ao LLM

| Option | Description | Selected |
|--------|-------------|----------|
| A — Electron lê + ACK estendido | Electron lê arquivo, envia content no ACK via WS | ✓ |
| B — backend-ts lê diretamente | backend-ts usa fs.readFile após 'confirmed' | |
| C — IPC separado | Electron lê, envia via IPC nova ao backend-ts | |

**User's choice:** Opção A (Electron lê + ACK estendido), com acréscimo: o conteúdo deve ir para o gateway (não direto para backend-ts). Fluxo: Electron → WS ACK → gateway → LangGraph tool.

---

## closeFile / closeFolder — Quão fundo vamos

| Option | Description | Selected |
|--------|-------------|----------|
| A — Kill por processo | taskkill (Windows) / pkill (macOS/Linux) por nome de processo | ✓ |
| B — Window manager | Enumera janelas, fecha só a correspondente ao path | |
| C — Simplificar MVP | Mesma coisa que A, com documentação da limitação | |

**User's choice:** Opção A — kill por processo.
**Notes:** Fecha todas as janelas do processo, não só a específica. Limitação aceitável para MVP.

---

## LangGraph tool → Gateway bridge

| Option | Description | Selected |
|--------|-------------|----------|
| A — Gateway expõe endpoint interno | POST /internal/dispatch-action, backend-ts faz fetch | ✓ |
| B — Shared monorepo module | Extrai sendActionRequest para package compartilhado | |

**User's choice:** Opção A — endpoint `/internal/dispatch-action`.
**Notes:** Segue o padrão já existente de `/internal/actions-log`.

---

## Execution trigger no Electron

| Option | Description | Selected |
|--------|-------------|----------|
| A — Execute → ACK | Main executa, resultado determina o ACK (confirmed/denied) | ✓ |
| B — ACK → Execute | Renderer manda ACK imediato, depois executa | |

**User's choice:** Recomendação de Claude aceita — Opção A (Execute → ACK).
**Notes:** ACK reflete o que realmente aconteceu no OS. Falha de execução → ACK 'denied'.

---

## Claude's Discretion

- Schema Zod exato do novo endpoint interno
- Mecanismo de passagem do `clientId` para a LangGraph tool
- Mapeamento processo↔extensão para `closeFile`
- Nome dos novos IPC channels

## Deferred Ideas

- Fechar janela específica (window manager API) — complexidade alta, pós-MVP
