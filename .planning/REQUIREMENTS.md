# Requirements: JARVIS v1.8 Memory Intelligence

**Defined:** 2026-04-19
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v1.8 Requirements

### Memory Writer

- [ ] **MEMW-01**: Sistema extrai fatos/eventos importantes após cada resposta LLM de forma assíncrona (fire-and-forget, zero impacto no pipeline de voz)
- [ ] **MEMW-02**: Extração usa `withStructuredOutput()` com Zod discriminated union para garantir JSON estruturado
- [ ] **MEMW-03**: Falha de extração é silenciosa — loga o erro, pula persistência, conversa continua sem interrupção

### Typed Memory

- [ ] **MTYPE-01**: Memórias salvas em 3 coleções ChromaDB separadas: `semantic`, `episodic`, `procedural`
- [ ] **MTYPE-02**: `semantic` armazena fatos estáveis sobre o usuário e preferências ("Biel prefere respostas diretas")
- [ ] **MTYPE-03**: `episodic` armazena eventos com timestamp ("ontem falamos sobre bug X")
- [ ] **MTYPE-04**: `procedural` armazena how-tos e fluxos de resolução de problemas
- [ ] **MTYPE-05**: Schema Drizzle com tabela `typed_memories` (type, content, confidence, extracted_at, source_id)

### Context Builder

- [ ] **MCTX-01**: `buildContext()` usa ordem tiered: system prompt → rolling summary → semantic (top-5) → episodic (top-5) → mensagens recentes
- [ ] **MCTX-02**: Retrieval top-k=5 por tipo sem threshold fixo — remove o 0.7 hardcoded
- [ ] **MCTX-03**: Queries para os 3 tipos executadas em paralelo (não sequencial), latência total <200ms
- [ ] **MCTX-04**: `buildContext()` mantém compatibilidade com todos os call sites existentes (streaming SSE, voice handler, CLI)

### Rolling Summarization

- [ ] **MSUM-01**: A cada 20 mensagens, sumariza as 10 mais antigas e substitui por entry de summary no SQLite
- [ ] **MSUM-02**: Trigger de sumarização ocorre apenas no fim de sessão ou em background — nunca inline durante conversa de voz
- [ ] **MSUM-03**: Rolling summary injetado no `buildContext()` na camada correta (entre system prompt e memórias typed)

### Reliability

- [ ] **REL-01**: Memory Writer sempre chamado via `void extractAndWriteMemoriesAsync()` — fire-and-forget sem await no caminho crítico
- [ ] **REL-02**: Escritas em SQLite e ChromaDB usam `source_id` compartilhado para consistency check na inicialização

## Future Requirements

### Memory Updates (v1.9+)

- **MUPD-01**: Sistema atualiza memórias existentes em vez de apenas append (requer entity resolution)
- **MUPD-02**: Entity resolution: "Portland office", "Portland", "Pine building" → mesma entidade

### Memory UI (v1.9+)

- **MUI-01**: Usuário pode visualizar memórias salvas por tipo
- **MUI-02**: Usuário pode editar ou deletar memórias individualmente

### Memory Decay (v2)

- **MDECAY-01**: Memórias antigas decaem por fórmula exponencial (semantic: 1 ano, episodic: 3 meses)
- **MDECAY-02**: Recuperação de memória reforça score de relevância (reinforcement learning)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reranking com cross-encoder | Top-k=5 suficiente para MVP; adicionar só se qualidade <0.65 |
| Threshold fixo de similarity | Anti-feature — substituído por top-k=5 por tipo |
| Extração síncrona | Anti-feature — adiciona 2–3s ao pipeline de voz |
| Coleção única com metadata filtering | Degrada em escala (50k+ docs); usar 3 coleções separadas |
| Memory updates + entity resolution | Complexidade alta; deferred v1.9+ |
| PTT hotkey macOS/Linux | Deferred para milestone posterior |
| Settings extras (LM Studio URL, provider) | Deferred para milestone posterior |
| Performance STT <500ms p95 | Deferred para milestone posterior |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MTYPE-05 | Phase 35 | Pending |
| REL-02 | Phase 35 | Pending |
| MEMW-01 | Phase 36 | Pending |
| MEMW-02 | Phase 36 | Pending |
| MEMW-03 | Phase 36 | Pending |
| MTYPE-01 | Phase 36 | Pending |
| MTYPE-02 | Phase 36 | Pending |
| MTYPE-03 | Phase 36 | Pending |
| MTYPE-04 | Phase 36 | Pending |
| REL-01 | Phase 36 | Pending |
| MCTX-01 | Phase 37 | Pending |
| MCTX-02 | Phase 37 | Pending |
| MCTX-03 | Phase 37 | Pending |
| MCTX-04 | Phase 37 | Pending |
| MSUM-01 | Phase 38 | Pending |
| MSUM-02 | Phase 38 | Pending |
| MSUM-03 | Phase 38 | Pending |

**Coverage:**
- v1.8 requirements: 17 total
- Mapped to phases: 17 ✓
- Unmapped: 0

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-19 — traceability mapped after roadmap creation*
