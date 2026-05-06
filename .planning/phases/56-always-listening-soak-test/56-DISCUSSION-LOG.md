# Phase 56: Always-Listening Soak Test — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 56-always-listening-soak-test
**Areas discussed:** AudioContext counting, Event loop measurement, Report format, Soak test setup

---

## AudioContext Counting

| Option | Description | Selected |
|--------|-------------|----------|
| A — IPC bridge | Renderer expõe count via IPC; script coleta programaticamente | ✓ |
| B — Manual/DevTools | Documentado no script como passo manual de verificação | |
| C — Indireta via singleton | Script não mede AudioContext diretamente; vazamento apareceria no heap | |

**User's choice:** A — IPC bridge automático
**Notes:** Automático, mensurável sem intervenção manual durante as 8h.

---

## Event Loop Measurement Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 1 — Main process | `perf_hooks.monitorEventLoopDelay()` nativo, direto no script | ✓ |
| 2 — Renderer via IPC | Renderer mede seu próprio loop com performance.now() drift e reporta via IPC | |
| 3 — Ambos | Script coleta main process + renderer via IPC | |

**User's choice:** Delegado ao Claude — recomendação aceita (opção 1)
**Notes:** Medir renderer via IPC contaminaria a medição; main process é suficiente para detectar travamentos que afetam Always-Listening.

---

## Report / Graph Format

| Option | Description | Selected |
|--------|-------------|----------|
| 1 — ASCII chart | Sparklines no terminal, zero dependência | |
| 2 — HTML com Chart.js CDN | Arquivo .html gerado ao final, gráfico interativo | ✓ |
| 3 — JSON + markdown table | Tabela de amostras + pass/fail, sem gráfico real | |

**User's choice:** Delegado ao Claude — recomendação aceita (opção 2)
**Notes:** 16+ amostras em 8h ficam ilegíveis em ASCII; HTML com CDN não adiciona dependência ao build.

---

## Soak Test Setup / Execution Environment

| Option | Description | Selected |
|--------|-------------|----------|
| 1 — Electron --inspect-brk | Script externo conecta via WebSocket debug | |
| 2 — Script embutido no Electron main | Módulo carregado com flag --soak-test | |
| 3 — Endpoint HTTP /internal/diagnostics | Script externo faz polling HTTP; segue padrão /internal/ já estabelecido | ✓ |

**User's choice:** Delegado ao Claude — recomendação aceita (opção 3)
**Notes:** Reutiliza padrão já estabelecido nas Phases 54/55; sem refatoração do Electron; script externo simples.

---

## Claude's Discretion

- Nome exato do IPC channel renderer→main para AudioContext count
- Push vs pull para métricas no gateway
- Resolução do `monitorEventLoopDelay()` e cálculo incremental de p99

## Deferred Ideas

Nenhuma.
