# Phase 27: Conversation Quality - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Melhorar a qualidade da conversa garantindo que JARVIS:
1. Sempre responde em português brasileiro (CONV-07)
2. Recupera contexto de conversas anteriores via ChromaDB semântico (CONV-08)
3. A tool `recall_memory` funciona E2E com ChromaDB real (CONV-09)

Não inclui: multi-turn voice (Phase 28), UI changes, novos tools além de recall_memory.

</domain>

<decisions>
## Implementation Decisions

### System Prompt pt-BR (CONV-07)

- **D-01:** Tom casual e amigável — "Just A Rather Very Intelligent System" é referência informal, não executiva/formal
- **D-02:** Instruir explicitamente "Sempre responda em português brasileiro" no system prompt — garante consistência mesmo com input em inglês
- **D-03:** Conteúdo conciso mas completo — identidade ("Você é o JARVIS") + capacidades (memória, ações) + comportamento esperado (prestativo, use tools quando necessário)
- **D-04:** Traduzir prompt atual mantendo mesma estrutura — from "You are JARVIS, a helpful personal assistant..." to pt-BR equivalent

### Memory Recall Strategy (CONV-08)

- **D-05:** TopK dinâmico (3-10 resultados) baseado em qualidade de similarity — retornar todos resultados acima de threshold alto (>0.7), limitado a 10 matches
- **D-06:** Threshold de similarity mantém 0.5 (atual) — balanceado entre recall e precision, já testado
- **D-07:** Formato de contexto — Claude's discretion (pode manter lista markdown atual ou adaptar para mais natural)

### Tool Description & Invocation (CONV-09)

- **D-08:** Descrição da tool `recall_memory` — manter atual ("Busca memórias relevantes de conversas passadas e fatos do perfil do usuário...")
- **D-09:** Esquema de input — manter `query: string` simples, LLM extrai termos relevantes
- **D-10:** Invocação — a critério do agente ReAct, não forçar chamada automática em toda request
- **D-11:** Error handling — manter atual (retornar mensagem pt-BR descritiva, nunca propagar exceções)

### Context Injection Point

- **D-12:** Memórias injetadas via tool response (atual) — agente chama `recall_memory` e recebe ToolMessage, alinhado com ReAct pattern
- **D-13:** Profile facts incluídos no `buildContext()` junto com recall results (atual) — sempre disponíveis quando tool é chamada

### Claude's Discretion

- Formato exato do contexto de memória (D-07) — pode manter markdown ou tornar mais prosáico
- Detalhes de implementação da lógica dinâmica de topK — algoritmo específico para "retornar todos >0.7 até max 10"

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Nenhum spec externo encontrado — todos os requirements estão capturados nas decisões acima.

### Backend Code Context
- `apps/backend-ts/src/session/system-prompt.ts` — system prompt atual (inglês)
- `apps/backend-ts/src/session/tools.ts` — recall_memory tool implementation
- `apps/backend-ts/src/memory/manager.ts` — buildContext() implementation
- `apps/backend-ts/src/memory/vectors.ts` — ChromaDB client configuration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SYSTEM_PROMPT constant** (`system-prompt.ts`) — literal string, fácil tradução
- **createRecallMemoryTool()** (`tools.ts`) — já retorna mensagens em pt-BR (EMPTY_FALLBACK, error messages)
- **MemoryManager.buildContext()** (`manager.ts`) — já implementa busca semântica com topK=5, threshold=0.5
- **MemoryVectors** (`vectors.ts`) — cliente ChromaDB JS funcional, conecta via `config.chromaHost`

### Established Patterns
- System prompt é `const` exportada em arquivo separado — não hardcoded
- Tools têm descrições e responses em pt-BR (RECALL_MEMORY_DESCRIPTION já é pt-BR)
- Error handling swallow exceptions e retornam strings descritivas — nunca throw
- ChromaDB config via env vars (`CHROMA_HOST`, `CHROMA_PORT`) com defaults sensatos

### Integration Points
- `ChatSession.constructor` adiciona `SystemMessage(SYSTEM_PROMPT)` ao history (linha 83)
- `ChatSession.create()` instancia `createRecallMemoryTool(memory)` e passa ao agent
- `recall_memory` tool chama `memory.buildContext(query)` internamente
- `buildContext()` retorna profile facts + semantic recall concatenados

</code_context>

<specifics>
## Specific Ideas

**System Prompt tone reference:** "Just A Rather Very Intelligent System" — referência ao J.A.R.V.I.S. do Homem de Ferro, tom casual/amigável, não corporativo.

**ChromaDB já funcional:** Phase 26 resolveu `ChromaConnectionError` — serviço Docker funciona, sem rework necessário.

**Tool description já pt-BR:** Apenas system prompt precisa tradução — tools, error messages, e buildContext() já em português.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma — discussão permaneceu dentro do escopo da fase.

</deferred>

---

*Phase: 27-conversation-quality*
*Context gathered: 2026-04-12*
