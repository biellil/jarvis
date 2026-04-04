# Phase 2: Memory - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Sistema de memória em dois níveis para o JARVIS: SQLite como sistema de registro (conversas, mensagens, perfil do usuário) + ChromaDB como índice de recuperação semântica. O MemoryManager coordena os dois tiers e injeta contexto relevante no ChatSession antes de cada resposta. Ao final da fase, o JARVIS lembra de fatos do usuário entre sessões automaticamente.

O `MemoryStore` SQLite (plano 02-01) já está implementado com tabelas: conversations, messages, summaries, user_profile.

</domain>

<decisions>
## Implementation Decisions

### Arquitetura de Memória
- **D-01:** Dois tiers separados — SQLite é o sistema de registro (source of truth), ChromaDB é o índice de recuperação. Não usar classes de memória do LangChain (ConversationBufferMemory etc.) — explicitamente proibido.
- **D-02:** Embeddings usam `sentence-transformers` com modelo `all-MiniLM-L6-v2` (22 MB, 384-dim, offline, CPU). Sem OpenAI embeddings — privacidade local-first.

### Injeção de Contexto
- **D-03:** `MemoryManager.load_context()` injeta apenas os fatos do `user_profile` (SQLite) no system prompt do ChatSession. ChromaDB retrieval não entra na injeção por enquanto — keep it simple.
- **D-04:** O contexto é injetado augmentando o system prompt (não como mensagens separadas no histórico). O usuário não vê, o LLM recebe como parte da instrução base.

### Ciclo de Vida da Sessão
- **D-05:** Mensagens são salvas incrementalmente no SQLite em tempo real — cada mensagem persistida imediatamente após envio/recebimento. Não esperar o fim da sessão para salvar (proteção contra crash).
- **D-06:** O encerramento gracioso da sessão ocorre via Ctrl+C — SIGINT capturado no loop CLI chama `session.end()` antes de sair. Nenhum comando de texto ("sair", "exit") necessário no v1.

### Claude's Discretion
- Trigger de embedding para ChromaDB (quando embeddar sessões — ao encerrar, em background, ou por threshold)
- Extração de fatos para user_profile (LLM-driven ou keyword-based — planner decide)
- Token budget e trim_messages() — estratégia de truncagem quando histórico ficar longo
- API design do MemoryManager (métodos, assinatura, async vs sync)
- Número máximo de fatos de perfil injetados no system prompt

</decisions>

<specifics>
## Specific Ideas

- O `MemoryStore` já tem `upsert_profile(key, value, source)` onde `source` é `'implicit'` ou `'explicit'` — planner deve usar isso para distinguir fatos extraídos automaticamente vs declarados pelo usuário.
- O `ChatSession.send()` usa `self.history` como lista de mensagens LangChain — a injeção de contexto deve augmentar `SYSTEM_PROMPT` ou substituir o `SystemMessage` no início do histórico, não adicionar mensagens ao meio.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Implementação existente (leitura obrigatória)
- `src/jarvis/memory/store.py` — MemoryStore SQLite já implementado: schema completo, todos os métodos. Planner deve construir sobre isso, não duplicar.
- `src/jarvis/core/session.py` — ChatSession com `send()`, `history` list, SystemMessage. É onde MemoryManager será wired (plano 02-04).
- `src/jarvis/config.py` — Settings com `sqlite_path` e `chroma_path` já configurados.

### Restrições do projeto
- `CLAUDE.md` — Constraints obrigatórias: abstração multi-LLM, sem hardcode de provider, sem UI obrigatória.

### Planejamento
- `.planning/REQUIREMENTS.md` — MEM-01 a MEM-05: critérios de aceite para esta fase.
- `.planning/ROADMAP.md` — Phase 2: goal, success criteria, planos 02-01 a 02-04.
- `.planning/research/STACK.md` — versões recomendadas: chromadb 1.5.5, sentence-transformers 3.x.
- `.planning/research/PITFALLS.md` — Armadilhas de memória: context window exhaustion, ChromaDB async, SQLite threading.

</canonical_refs>

<deferred>
## Deferred Ideas

- Extração automática de perfil com LLM pass dedicado — pode vir em milestone futuro se a extração simples for insuficiente
- Sumarização de sessão antes de embeddar — deferred para milestone futuro (MEM-06 no v2)
- Recuperação semântica via ChromaDB no load_context() — D-03 é simples por ora; ChromaDB entra na fase de wiring (02-03/02-04) mas sem injeção de resultados no prompt ainda

</deferred>

---

*Phase: 02-memory*
*Context gathered: 2026-04-04 via /gsd:discuss-phase 2*
