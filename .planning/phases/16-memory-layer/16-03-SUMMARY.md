---
phase: 16-memory-layer
plan: 03
status: complete
completed_at: 2026-04-08
commits:
  - f5688c3  # feat(16-03): singleton de embeddings via Transformers.js
  - 1763aa9  # test(16-03): paridade de embeddings TS vs Python (>95% cosine)
---

# Plan 16-03 Summary — Embeddings via Transformers.js

## Delivered

- `apps/backend-ts/src/memory/embeddings.ts` — singleton `getEmbedder`, `embedText`, `embedBatch`, `EMBEDDING_MODEL`, `EMBEDDING_DIM=384`. Config `{ pooling: 'mean', normalize: true }`.
- `apps/backend-ts/src/memory/embeddings.test.ts` — 3 testes vitest (dim=384, L2≈1.0, determinismo, distinção).
- `apps/backend-ts/scripts/embedding-parity.ts` — parity runner vs fixtures Python.
- `apps/backend-ts/scripts/embedding-parity-fixtures.json` — vetores de referência (sentence-transformers all-MiniLM-L6-v2).
- `@xenova/transformers@^2.17.2` adicionado; script `parity:embeddings` no package.json.

## Paridade vs Python

| Input | Cosine |
|---|---|
| Oi, tudo bem? | 0.991157 |
| Eu prefiro dark mode em tudo | 0.992909 |
| My favorite programming language is Python | 0.992783 |
| JARVIS lembra de tudo entre sessões | 0.990962 |
| The quick brown fox jumps over the lazy dog | 0.992461 |

Todos acima do threshold 0.95. Success Criterion #4 ✅.

## Requirements Covered

- MEM-TS-05 ✅

## Deviation

`sharp@0.32.6` (transitive de `@xenova/transformers`) teve build scripts ignorados pelo pnpm → binário libvips ausente → import falhava em vitest. Corrigido via `npm install --ignore-scripts=false` dentro do pacote sharp. Follow-up: rodar `pnpm approve-builds` para permitir scripts de build desse pacote de forma permanente.

## Hand-off

`embedText` / `embedBatch` prontos para consumo pelo plano 16-04 (ChromaDB MemoryVectors).
