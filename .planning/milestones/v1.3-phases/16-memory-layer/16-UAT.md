---
phase: 16-memory-layer
date: 2026-04-08
status: passed
verdict: 5/5 success criteria passed
---

# Phase 16 — UAT Results

## Success Criteria

| # | Critério | Método | Resultado |
|---|---|---|---|
| 1 | MemoryManager salva mensagem no SQLite e ela persiste após restart | `scripts/uat-16-persist.ts` (manual) | ✅ PASS |
| 2 | Semantic search retorna mensagens relevantes com threshold configurável | `scripts/uat-16-search.ts` (manual) | ✅ PASS |
| 3 | Schema TypeScript Drizzle idêntico ao Python | vitest `store.test.ts` | ✅ PASS |
| 4 | Embeddings Xenova/all-MiniLM-L6-v2 com >95% cosine similarity vs Python | `scripts/embedding-parity.ts` | ✅ PASS (5/5 inputs >0.99) |
| 5 | User profile persiste e é injetado no contexto | `scripts/uat-16-profile.ts` (manual) | ✅ PASS |

## Test Logs

### Teste 1 — Persistência

- Sessão A criou conversa #1, salvou turn (user "minha cor favorita é roxo" + assistant).
- Sessão B (novo `MemoryManager`, mesmo arquivo SQLite) leu via Drizzle direto da tabela `messages`.
- Ambas as mensagens reapareceram com timestamps preservados.

### Teste 2 — Semantic Search

Query "qual cor eu gosto?" sobre 3 docs:
- m1: "Adoro programar em TypeScript"
- m2: "Minha cor favorita é roxo"
- m3: "Pizza de calabresa é a melhor"

Resultados (sim cosseno):
- m2 sim=0.464 (top)
- m3 sim=0.391
- m1 não rankeou no topo

Threshold 0.4 → mantém m2. Threshold 0.4 sobre query irrelevante "matemática quântica" → 0 resultados. Threshold funciona.

### Teste 3 — User Profile

- Inserido fato `cor_favorita=roxo` no `user_profile`.
- Novo `MemoryManager` chamou `buildContext("o que eu gosto?")`.
- Output incluiu seção `### User profile` com `- cor_favorita: roxo` E recall semântico das mensagens passadas. Critério 5 ✅.

## Follow-ups (não-bloqueantes)

1. **`MemoryVectorsOptions` não aceita `collection`** — nome de coleção hardcoded em `COLLECTION_NAME`. Impede isolamento entre instâncias/usuários/testes. Fix recomendado antes de Fase 17 (ChatSession multiusuário).
