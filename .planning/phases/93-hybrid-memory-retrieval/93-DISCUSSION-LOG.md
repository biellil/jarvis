# Phase 93: Hybrid Memory Retrieval - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 93-hybrid-memory-retrieval
**Areas discussed:** FTS5 target, Estrutura RRF, Benchmark NDCG, FTS5 + Drizzle

---

## FTS5 target

| Option | Description | Selected |
|--------|-------------|----------|
| typed_memories | Indexar conteúdo das memórias extraídas — mesmo espaço que Chroma opera | ✓ |
| messages (raw) | Indexar histórico bruto de mensagens como HMEM-02 descreve literalmente | |
| Ambos | FTS5 em typed_memories + messages como fonte secundária | |

**User's choice:** typed_memories
**Notes:** buildContext() já opera sobre typed_memories via Chroma — manter keyword search no mesmo espaço evita mapeamento extra

---

## Estrutura RRF

| Option | Description | Selected |
|--------|-------------|----------|
| Pool único | Todos os tipos mesclados num ranking único | ✓ |
| Per-type RRF | RRF aplicado separadamente dentro de cada tipo | |

**User's choice:** Pool único

### Output format do pool único

| Option | Description | Selected |
|--------|-------------|----------|
| Seção única '### Memórias' | Substitui as 3 seções separadas | ✓ |
| Manter seções separadas com label | Compatível com formato atual | |

**User's choice:** Seção única `### Memórias`

---

## Benchmark NDCG

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture de teste | 50 queries + ground truth como dados estáticos, integrado ao CI | ✓ |
| Script standalone | Script separado, não bloqueia ship automaticamente | |

**User's choice:** Fixture de teste integrado ao CI

### Ground truth format

| Option | Description | Selected |
|--------|-------------|----------|
| IDs hardcoded | relevant_ids por query — binário (relevante/não) | |
| Graded {id, relevance: 0-3} | NDCG graduado — distingue graus de relevância | ✓ |

**User's choice:** Graded com `{ id, relevance: 0 | 1 | 2 | 3 }`

---

## FTS5 + Drizzle

| Option | Description | Selected |
|--------|-------------|----------|
| Raw SQL no MemoryStore constructor | IF NOT EXISTS + triggers — idempotente | ✓ |
| Arquivo de migração SQL dedicado | Integra no drizzle-kit migrate | |
| Script de setup separado | Passo manual, não automático | |

**User's choice:** Raw SQL no MemoryStore constructor

### Colunas FTS5

| Option | Description | Selected |
|--------|-------------|----------|
| content only | Simples — keyword search vai contra o texto das memórias | ✓ |
| content + type | Permite queries como 'episodic:viagem' | |

**User's choice:** content only

---

## Claude's Discretion

- Número de resultados top-K no pool unificado
- Implementação do cálculo NDCG (lib ou inline)
- Constante `k` do RRF (padrão literatura: 60)
