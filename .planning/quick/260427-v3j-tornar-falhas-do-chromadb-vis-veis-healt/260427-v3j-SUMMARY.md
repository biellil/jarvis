---
phase: quick-260427-v3j
status: complete
date: 2026-04-28
commits:
  - df6bbe8
  - cf0d1c1
  - 6f78615
---

# Summary — Quick Task 260427-v3j

**Goal:** Tornar falhas do ChromaDB visíveis em três pontos cirúrgicos — health check no boot, log honesto em saveTurn, bump da imagem do server.

## Trigger

Volume `chroma-data` reportou 0 bytes na máquina remota mas o log dizia que tudo foi indexado — falha silenciosa em `vectors.addMemory()` mascarada por log mentiroso em `manager.saveTurn()`.

## Changes

| File | Diff | What |
|------|------|------|
| `apps/backend-ts/src/index.ts` | +12 | Try/catch chamando `memory.vectors.init()` antes de `ChatSession.create` — imprime `✅ ChromaDB connected` ou `❌ ChromaDB unreachable: <reason>` (não fatal). |
| `apps/backend-ts/src/memory/vectors.ts` | +14/-3 | `addMemory` e `addTypedMemory` retornam `Promise<boolean>` (`true` no upsert OK, `false` no catch). |
| `apps/backend-ts/src/memory/manager.ts` | +11/-4 | `saveTurn` captura `okUser`/`okAsst` e só imprime `[Chroma] 🧠 indexed memory` quando ambos são `true`; senão imprime `[Chroma] ⚠️ failed to index memory (convId=..., user=..., assistant=...)`. `saveTypedMemory` imprime warning específico quando vector upsert falha. |
| `docker-compose.yml` | 1 linha | `chromadb/chroma:1.0.12` → `1.0.15`. |
| `docker-compose.gpu.yml` | 1 linha | `chromadb/chroma:1.0.12` → `1.0.15`. |
| `apps/backend-ts/src/memory/vectors.test.ts` | +1/-1 | Atualização de assertions para o novo contrato `Promise<boolean>` (deviation Rule 1). |
| `apps/backend-ts/src/memory/manager.test.ts` | +2/-2 | Atualização de mocks/assertions para o novo contrato (deviation Rule 1). |

## Antes vs depois (logs)

**Antes (mentiroso):**
```
[DB] 💾 saveTurn start (convId=1, user=10c, assistant=200c)
[Chroma] 🧠 indexed memory (convId=1)         <-- mente: addMemory pode ter falhado
```

**Depois (honesto):**

Caminho feliz no boot:
```
✅ ChromaDB connected
🚀 Backend-TS listening on port 8001
```

Caminho triste no boot:
```
❌ ChromaDB unreachable: connect ECONNREFUSED chromadb:8000
   Memory persistence will fail silently per-turn until Chroma is reachable.
   Check: CHROMA_HOST=chromadb CHROMA_PORT=8000
```

Por turno, com Chroma fora:
```
[DB] 💾 saveTurn start (convId=1, user=10c, assistant=200c)
[vectors] Failed to add memory conv-1-user-...: <real error>
[vectors] Failed to add memory conv-1-assistant-...: <real error>
[Chroma] ⚠️ failed to index memory (convId=1, user=false, assistant=false)
```

## Verification

- `npx tsc --noEmit` → exit 0, sem erros.
- Grep confirmou: `chromadb/chroma:1.0.15` em ambos os compose files; nenhuma referência remanescente a `1.0.12`.
- Health check exposto antes de `app.listen` — falha visível ao iniciar o container.
- Smoke test (deploy real com Docker) **NÃO executado** neste ambiente — fica para deploy na máquina remota. Esperado: após uma conversa, `docker exec jarvis-chromadb du -sh /chroma/chroma` deve reportar > 0 bytes.

## Filosofia preservada

Falha de Chroma **não derruba o app** (paridade MEM-05 — memória nunca é fatal). Apenas torna a falha gritante o suficiente para diagnosticar via log.

## Deviations

1 auto-fix (Rule 1) — atualização dos testes existentes (`vectors.test.ts`, `manager.test.ts`) para o novo contrato `Promise<boolean>`. Incluído no commit `cf0d1c1` para manter a suíte verde.
