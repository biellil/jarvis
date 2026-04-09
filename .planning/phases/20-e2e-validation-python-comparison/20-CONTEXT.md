# Phase 20: E2E Validation & Python Comparison — Context

**Gathered:** 2026-04-09
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 20 (interativo)

<domain>
## Phase Boundary

Validar que o backend TypeScript produz outputs equivalentes ao Python para os mesmos inputs. Dois entregáveis principais:

1. **E2E comparison script** — envia inputs idênticos para Python (8000) e TypeScript (8001) e compara outputs com relatório PASS/FAIL.
2. **Gateway feature flag** — middleware que roteia `X-Backend-Version: ts` para o backend TypeScript.

**Dentro de escopo:**
- Script standalone `scripts/e2e-compare.ts` (roda com `tsx`, comando `pnpm e2e`)
- Validação de: respostas de texto (VAL-01/02), tool calls (VAL-03), SQLite state (VAL-04), ChromaDB embeddings (VAL-05), performance (VAL-06)
- Gateway middleware para `X-Backend-Version: ts` → `backendTsUrl` (VAL-07)
- Relatório final colorido com PASS/FAIL por categoria

**Fora de escopo:**
- Voice/audio comparison — providers são diferentes por design (nodejs-whisper vs faster-whisper, Speecht5 vs kokoro). Documenta como known limitation.
- Cutover de tráfego (Phase 21)
- Novos endpoints ou features
</domain>

<decisions>
## Implementation Decisions

### Q1 — Voice no E2E
**Pular voice validation.**

Voice usa providers diferentes por design (nodejs-whisper vs faster-whisper, Speecht5 vs kokoro). Comparar outputs seria comparar implementações diferentes, não bugs. Documenta como known limitation no relatório do E2E.

Impacto: VAL-01 valida apenas text chat inputs (20 mensagens de texto).

---

### Q2 — ChromaDB: shared ou separado
**Cada backend tem seu próprio ChromaDB.**

Python backend usa seu caminho de ChromaDB, TypeScript backend usa o caminho configurado em `CHROMA_PATH`. Para comparação (VAL-05): envia os mesmos textos para ambos e compara os vetores gerados via cosine similarity. Não compartilham dados.

---

### Q3 — Tool calls: escopo de comparação
**Comparar todas as tools do Python vs TypeScript.**

Se alguma tool existir no Python e não no TypeScript → marca como `FAIL` no relatório. O suite **não para** (continua os outros testes). Summary final mostra PASS/FAIL por categoria.

Racional: queremos visibilidade total de gaps. Parar no primeiro FAIL esconderia outros problemas.

---

### Q4 — Comparação de texto (VAL-02)
**Embedding cosine similarity com threshold >0.85.**

Usa `@xenova/transformers` (all-MiniLM-L6-v2) — já instalado no backend-ts. Vetoriza as duas respostas e compara cosine similarity. Se similarity ≥ 0.85 → PASS. Se < 0.85 → FAIL com log das duas respostas.

Threshold padrão: 0.85 (configurável via env `TEXT_SIM_THRESHOLD`).

---

### Q5 — Comportamento em falha
**Reporta e continua.**

Cada assertion produz PASS/FAIL individual. Suite roda até o fim independente de falhas. Relatório final:
```
===== E2E COMPARISON REPORT =====
Text Similarity: 18/20 PASS (2 FAIL)
Tool Calls:      20/20 PASS
SQLite State:    20/20 PASS  
ChromaDB:        19/20 PASS (1 FAIL)
Performance:     20/20 PASS (avg TS/Python ratio: 1.04)
=================================
Overall: 97/100 (97%) — THRESHOLD: 90%
```
Exit code 0 se ≥ 90% geral, 1 se < 90%.

---

### Q6 — Arquitetura do test suite
**Script standalone `scripts/e2e-compare.ts`.**

- Localização: `/root/jarvis/scripts/e2e-compare.ts`
- Runtime: `tsx` (já disponível via pnpm)
- Comando: `pnpm e2e` (adicionado ao root `package.json`)
- Requer: ambos backends rodando (`pnpm dev:backend` + Python FastAPI)
- Não integra ao vitest — é validação pontual, não CI contínuo
- Output: colorido no terminal com emojis ✅/❌

---

### Q7 — Gateway feature flag (VAL-07)
**Middleware por header `X-Backend-Version: ts`.**

Implementação no gateway (`apps/gateway/src/middleware/`):
```typescript
// Se header X-Backend-Version: ts estiver presente → roteia para backendTsUrl
// Caso contrário → comportamento padrão (fastapiUrl)
```

- `config.backendTsUrl` já existe em `apps/gateway/src/config.ts`
- Sem mudar comportamento padrão — Python backend continua sendo o default
- Aplica a todos os endpoints: `/chat`, `/chat/stream`, `/chat/audio`
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — VAL-01 a VAL-07 (requirements desta fase)
- `.planning/ROADMAP.md` — Phase 20 success criteria
- `apps/gateway/src/config.ts` — backendTsUrl e fastapiUrl já configurados
- `apps/gateway/src/app.ts` — onde adicionar middleware de routing
- `apps/gateway/src/routes/chat.ts` — rotas que precisam do routing condicional
- `apps/backend-ts/src/` — endpoints TypeScript a serem validados
- `apps/backend-ts/src/memory/` — ChromaDB e embedding code para reusar no script
</canonical_refs>

<deferred>
## Deferred Ideas

- **Streaming de áudio TTS comparison** — deferido para v1.4 (backend gera tudo de uma vez atualmente)
- **CI integration** — integrar e2e-compare.ts ao GitHub Actions (não é objetivo de v1.3)
- **LLM-as-judge** para comparação de texto — mais preciso mas adiciona latência; embedding similarity é suficiente para v1.3
- **Env var global `ACTIVE_BACKEND`** — não implementado nesta fase; header por request cobre o caso de uso de validação
</deferred>
