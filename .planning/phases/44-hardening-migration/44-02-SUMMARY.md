---
phase: 44-hardening-migration
plan: "02"
subsystem: desktop-scripts
tags: [soak-test, memory, always-listening, hardening, release-validation]
dependency_graph:
  requires: []
  provides: [apps/desktop/scripts/soak-test.ts, README soak test docs]
  affects: [AlwaysListeningStrategy validation workflow]
tech_stack:
  added: []
  patterns: [Node.js process.memoryUsage(), --expose-gc, SIGINT handler]
key_files:
  created:
    - apps/desktop/scripts/soak-test.ts
  modified:
    - README.md
decisions:
  - "Script standalone (não parte do CI vitest) — dura 8h por design"
  - "Medir heapUsed E rss (Pitfall 2: native leak não aparece em heapUsed)"
  - "GC opcional via --expose-gc para determinismo, sem obrigatoriedade"
  - "RSS delta threshold 50MB como WARNING (não FAIL) — native leaks são mais toleráveis"
metrics:
  duration: "~5min"
  completed: "2026-04-27T21:31:00Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 44 Plan 02: Soak Test Script — Summary

Script standalone de validação de heap para Always-Listening mode ao longo de 8 horas. Implementa D-07 a D-10 do CONTEXT.md.

## One-liner

Script Node.js standalone `soak-test.ts` com warm-up 30s, baseline capturado, amostras a cada 30min por 8h, GC opcional via `--expose-gc`, PASS/FAIL via `process.exit(0/1)` com delta heapUsed <10MB como critério.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Script soak-test.ts standalone | 6126e78 | apps/desktop/scripts/soak-test.ts |
| 2 | Documentar soak test no README.md (D-10) | 3fc8dd1 | README.md |

## Implementation Details

### apps/desktop/scripts/soak-test.ts

Script Node.js puro (sem imports Electron ou do projeto) que:

1. Imprime header com parâmetros de execução e disponibilidade de GC
2. Aguarda 30s de warm-up (`BASELINE_DELAY_MS = 30_000`)
3. Captura baseline com `process.memoryUsage()` — `heapUsed` e `rss`
4. Configura `setInterval` de 30min (`SAMPLE_INTERVAL_MS = 30 * 60 * 1000`)
5. Em cada amostra: chama `global.gc()` se disponível (`--expose-gc`), lê memória, imprime linha de log
6. Handler SIGINT para relatório gracioso via Ctrl+C
7. Timeout de 8h (`SOAK_DURATION_MS = 8 * 60 * 60 * 1000`) para finalização automática
8. Relatório final: delta heap e RSS, `PASS` se delta <10MB (`HEAP_DELTA_FAIL_THRESHOLD_MB = 10`), `FAIL` caso contrário

Pitfall 2 aplicado: mede `rss` além de `heapUsed` — RSS crescendo com heap estável indica native leak (Whisper.cpp, ONNX). RSS delta >50MB gera `WARNING` (não `FAIL`).

### README.md

Seção "Soak Test (Validação de Release)" adicionada antes de "Licença" com:
- Dois comandos de execução (`--expose-gc` recomendado, `npx tsx` alternativo)
- Critério de PASS documentado (delta <10MB em 8h)
- Explicação de heapUsed vs rss para diagnóstico de native leaks
- Nota explícita: não CI, apenas antes de releases que alterem Always-Listening

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — script é standalone e não depende de dados externos.

## Threat Flags

None — script acessa apenas `process.memoryUsage()` sem PII ou dados de usuário (T-44-06 e T-44-07 revisados no plan: ambos `accept`).

## Self-Check: PASSED

- [x] `apps/desktop/scripts/soak-test.ts` existe (FOUND)
- [x] `README.md` contém `soak-test` (5 ocorrências encontradas)
- [x] Commit `6126e78` existe (feat Task 1)
- [x] Commit `3fc8dd1` existe (docs Task 2)
- [x] Constantes corretas: BASELINE_DELAY_MS=30_000, SAMPLE_INTERVAL_MS=30*60*1000, SOAK_DURATION_MS=8*60*60*1000, HEAP_DELTA_FAIL_THRESHOLD_MB=10
