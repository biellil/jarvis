# Phase 94: Per-Speaker Memory Isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 94-per-speaker-memory-isolation
**Areas discussed:** Retrieval scope, ChromaDB backfill, Orphan propagation, speaker_id format, Cross-speaker recall capability
**Mode:** Advisor mode (full_maturity tier), advisor model = sonnet

---

## Retrieval Scope

| Option | Description | Selected |
|--------|-------------|----------|
| A — Strict | Known speaker sees only own; unknown sees only unknown. Compliant with criteria 1 & 2. | ✓ |
| B — Semi-open | Known sees own + unknown ambient. Violates criterion 2 as written. | |
| C — Owner opt-in | Strict default + `ambient_access` flag per speaker. | |

**User's choice:** A (Estrito).
**Notes:** Aplica-se ao contexto automático (`buildContext`). Combinado com a capacidade de recall cruzado explícito (abaixo), que NÃO contradiz o isolamento automático.

---

## ChromaDB Backfill

| Option | Description | Selected |
|--------|-------------|----------|
| A — Query-time only | No migration; filter treats missing metadata as unknown. Brittle missing-key semantics. | |
| B — Metadata patch | One-time idempotent `collection.update(ids, {speaker_id:"unknown"})`, no re-embed; SQLite backfill. | ✓ |
| C — Full re-index | Delete + re-embed all. Slow, destructive. | |

**User's choice:** B (patch de metadados).
**Notes:** Ênfase do usuário — "não é para apagar os dados, os Desconhecidos ficam como Desconhecido". Confere com B: marca como `unknown`, preserva tudo.

---

## Orphan Propagation (profile deletion)

| Option | Description | Selected |
|--------|-------------|----------|
| d — Behavioral/implicit | Don't touch memories; recovery automatic via `speaker_id == name` re-enrollment. No stored flag. | ✓ |
| a — Explicit endpoint | `POST /memory/speaker/:id/orphan` on delete; stored flag. Literal PSPK-05. | |
| c — Reconciliation sync | desktop-py sends active set at startup; backend orphans rest. | |

**User's choice:** d (comportamental/implícito).
**Notes:** Conflito de interpretação de PSPK-05 ("marked orphan_speaker") foi sinalizado ao usuário. Escolha = leitura comportamental (recuperável por re-enrollment). Endpoint explícito (a) documentado como upgrade path em CONTEXT.md D-16.

---

## speaker_id Format

| Option | Description | Selected |
|--------|-------------|----------|
| A — Raw verbatim | Store header string as-is. Works today (pre-sanitized) but brittle. | |
| B — Backend re-normalizes | Re-apply `_safe_profile_name` (trim + space→underscore, NO lowercase). Block "unknown". | ✓ |
| C — Surrogate UUID | Mapping table. Over-engineered; fights PSPK-05 name-based recovery. | |

**User's choice:** B (backend re-normaliza).
**Notes:** Header já carrega o stem sanitizado; B adiciona guarda defensiva. Sem lowercase (pois `_NAME_RE` é case-sensitive). "unknown" reservado, bloqueado no enrollment.

---

## Cross-Speaker Recall Capability (raised by user)

User requirement: JARVIS deve PODER cruzar dados sob demanda ("o que a Maria me pediu?"), mas sem misturar automaticamente.

### A) Quem pode pedir o cruzamento?
| Option | Description | Selected |
|--------|-------------|----------|
| A1 — Só o dono | Apenas dono reconhecido cruza. | |
| A2 — Qualquer reconhecido | Qualquer falante reconhecido cruza; unknown fica estrito. | ✓ |
| A3 — Qualquer um | Inclui unknown. | |

### B) Como a IA decide cruzar?
| Option | Description | Selected |
|--------|-------------|----------|
| B1 — Menção explícita | Só quando o usuário menciona a pessoa nominalmente. Sem menção = estrito. | ✓ |
| B2 — Comando/ferramenta dedicada | Acionada de propósito. | |

### C) Escopo na Phase 94?
| Option | Description | Selected |
|--------|-------------|----------|
| C1 — Fundação + recall nesta fase | Construir isolamento + expor recall cruzado agora. | ✓ |
| C2 — Só fundação | Tool de cruzamento vira fase própria. | |

**User's choice:** A2, B1, C1.
**Notes:** Caminho separado do automático. Exposto via `recall_memory` estendido. Critérios 1 e 2 referem-se ao contexto automático (interpretação D-08).

## Claude's Discretion

- Mecanismo do filtro ChromaDB (`where`), estrutura do RRF, assinatura de `retrieve()`, disparo da migração de backfill, índice SQLite, resolução nome→speaker_id no recall cruzado.

## Deferred Ideas

- Endpoint explícito de orphan; purge por tempo; re-attribution de memórias unknown; comando `/memory`.
