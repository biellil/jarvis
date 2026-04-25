# Phase 37: Context Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 37-context-builder
**Areas discussed:** Formato tiered do contexto, Profile facts — manter ou fundir, Slot do rolling summary, Estratégia de teste de latência

---

## Formato tiered do contexto

| Option | Description | Selected |
|--------|-------------|----------|
| Seções separadas por tipo | `### Semantic memories` / `### Episodic memories` / `### Procedural memories` — sempre presente | |
| Bloco unificado com label inline | `### Retrieved memories` com [semantic]/[episodic]/[procedural] por linha | |
| Seções separadas, omitir vazias | Igual primeira opção, mas seção não aparece se vazia | ✓ |

**User's choice:** Seções separadas, omitir vazias
**Notes:** Headers escolhidos em português ("Memórias semânticas" etc.) para consistência com o system prompt do JARVIS.

---

## Profile facts — manter ou fundir

| Option | Description | Selected |
|--------|-------------|----------|
| Manter ambos | Profile facts + typed memories coexistem no contexto | ✓ |
| Remover profile, usar só semantic | Eliminar `getProfileFacts()` do buildContext() | |
| Manter + deprecar gradualmente | Manter com TODO de migração para v1.9 | |

**User's choice:** Manter ambos
**Notes:** Profile facts e typed memories são fontes complementares — profile vem de aprendizado explícito/implícito anterior à v1.8; semantic vem de extração LLM da v1.8+.

---

## Slot do rolling summary

| Option | Description | Selected |
|--------|-------------|----------|
| Parâmetro opcional no buildContext | `buildContext(userText, rollingSum?: string)` — Phase 38 só passa o valor | ✓ |
| Phase 38 insere depois | Phase 37 não mexe na assinatura, Phase 38 modifica buildContext() novamente | |
| Retornar objeto estruturado | buildContext() retorna partes separadas — quebra call sites | |

**User's choice:** Parâmetro opcional no buildContext
**Notes:** Call sites atuais (tools.ts) não precisam mudar — parâmetro é opcional e backward-compatible.

---

## Estratégia de teste de latência

| Option | Description | Selected |
|--------|-------------|----------|
| Mock com timing real | Mock com delay simulado, assert total < 200ms | ✓ |
| Teste de integração com ChromaDB real | ChromaDB real em CI — lento e com dependência de infra | |
| Apenas estrutural — sem assert de latência | Verificar Promise.all() sem medir ms | |

**User's choice:** Mock com timing real — 50ms por coleção, assert < 200ms
**Notes:** Planner deve considerar aumentar para 80ms para que teste só passe se paralelo (50ms × 3 = 150ms sequencial ainda fica abaixo de 200ms).

---

## Claude's Discretion

- Nomes internos de variáveis e helpers em buildContext()
- Se extrair função privada `_buildTypedMemoriesContext()` ou deixar inline
- Formato de fallback quando todas as seções estão vazias

## Deferred Ideas

Nenhuma.
