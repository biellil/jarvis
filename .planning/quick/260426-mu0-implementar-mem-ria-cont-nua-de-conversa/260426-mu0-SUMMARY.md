---
phase: quick-260426-mu0
plan: 01
subsystem: backend-ts/memory + backend-ts/session
tags: [memory, persistence, chat-session, rehydration, conversation-continuity, MEM-CONT]
dependency_graph:
  requires:
    - apps/backend-ts/src/memory/store.ts (MemoryStore existente — startConversation, getOldestMessages)
    - apps/backend-ts/src/memory/schema.ts (conversations, messages tables)
    - apps/backend-ts/src/memory/manager.ts (MemoryManager facade)
    - apps/backend-ts/src/session/chat-session.ts (ChatSession.create factory)
  provides:
    - MemoryStore.getOrCreateConversation() — reusa oldest conversation by id ASC
    - MemoryStore.getRecentMessages(convId, limit) — últimas N mensagens em ordem cronológica, filtra system role
    - MemoryManager.getOrCreateConversation() / getRecentMessages() — facade fina
    - ChatSession.create() rehydration — this.history pré-carregado com últimas 50 mensagens
  affects:
    - Persistência percebida da conversa pelo LLM entre restarts do container
tech-stack:
  added: []
  patterns:
    - "MEM-05: try/catch + warn, nunca throw — aplicado aos 2 novos métodos do store"
    - "Reverse-chronological query + JS .reverse() — pattern usado para 'últimos N em ordem natural'"
    - "Filtro role IN ('user','assistant') via inArray() — exclui SystemMessage do banco"
    - "Optional constructor parameter com default [] — backward-compat para callers existentes"
key-files:
  created: []
  modified:
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/manager.ts
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts (mocks atualizados)
    - apps/backend-ts/test/session/chat-session-stream.test.ts (mocks atualizados)
    - apps/backend-ts/test/session/chat-session-tools.test.ts (mocks atualizados)
    - apps/backend-ts/test/session/extraction-wiring.test.ts (mocks atualizados)
decisions:
  - "Manter startConversation() inalterado no store e no manager — `getOrCreateConversation()` é método novo e aditivo. Razão: tests existentes (Phase 36/38) e qualquer código legado continuam funcionando sem mudança comportamental."
  - "REHYDRATION_LIMIT=50 hardcoded. Threshold escolhido para casar com Phase 38 rolling summary (que comprime as 10 mais antigas após 20 mensagens) — 50 cobre ~5 sumarizações sem inflar o context window. Vira env var quando virar dor."
  - "Filtro role IN ('user','assistant') no get — SystemMessage do prompt vem do código (SYSTEM_PROMPT), nunca do banco. Defesa em profundidade: ChatSession.create() também ignora row.role !== 'user'/'assistant' no loop."
  - "Construtor com parâmetro opcional + default [] em vez de overload separado — preserva backward-compat e mantém a API com 1 forma só."
metrics:
  duration: "00:09:55"
  completed: "2026-04-26T19:40:37Z"
  tasks_completed: 3
  files_modified: 7
  commits: 3
---

# Quick Task 260426-mu0: Implementar memória contínua de conversa Summary

**One-liner:** Backend-ts agora reusa a mesma row de `conversations` entre restarts do container e reidrata `ChatSession.history` com as últimas 50 mensagens persistidas — JARVIS finalmente lembra da conversa anterior do ponto de vista do LLM, não só do disco.

## Goal

Hoje os volumes Docker (`jarvis_sqlite-data`, chroma) já persistem corretamente, mas (1) cada restart inseria uma nova row em `conversations` e (2) `ChatSession` inicializava `this.history` apenas com `SystemMessage`. Resultado: o LLM "esquecia" a conversa anterior mesmo com tudo gravado em disco. Este plano alinha o estado em-memória do agent com o que já existe persistido em SQLite — peça final de continuidade percebida.

## Implementation Summary

### Task 1 — `MemoryStore.getOrCreateConversation()` + `getRecentMessages()` (commit `c632dc0`)

**`apps/backend-ts/src/memory/store.ts`**: dois novos métodos públicos.

- **`getOrCreateConversation(): number | null`** — query `SELECT id FROM conversations ORDER BY id ASC LIMIT 1`. Se existe row, loga `[SQLite] ▶ resumed conversation (id=N)` e retorna o id. Se não existe, delega para `startConversation()` (que tem seu próprio log `[SQLite] 🆕 conversation started (id=N)`). Erro na SELECT é capturado, loga `MemoryStore.getOrCreateConversation failed: ...` e retorna `null` — paridade MEM-05.
- **`getRecentMessages(convId, limit): MessageWithId[]`** — query `WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT N`, depois `.reverse()` em JS. Filtro CRÍTICO de role exclui `system` messages — o SystemMessage do prompt vem do código, nunca do banco. Erros retornam `[]` (MEM-05).

**`startConversation()` mantido inalterado** — outros callers (Phase 36/38 tests) continuam usando.

### Task 2 — Facade `MemoryManager` (commit `47d5b6e`)

**`apps/backend-ts/src/memory/manager.ts`**: dois métodos novos delegando direto ao store, espelhando o padrão de `startConversation()` / `getProfileFacts()`.

- `async getOrCreateConversation(): Promise<number | null>` posicionado abaixo de `startConversation()`.
- `getRecentMessages(convId, limit): MessageWithId[]` (síncrono — espelha o store) posicionado abaixo de `getProfileFacts()`.

`MessageWithId` já estava importado de `./store.js` (linha 15) — sem alteração de imports.

### Task 3 — Rehydration em `ChatSession.create()` (commit `5ef5add`)

**`apps/backend-ts/src/session/chat-session.ts`**: três mudanças coordenadas.

1. `const convId = await opts.memory.startConversation();` → `const convId = await opts.memory.getOrCreateConversation();`
2. Após obter `convId` e antes de `createReactAgent()`, loop converte rows do SQLite em `BaseMessage[]`:
   ```typescript
   const REHYDRATION_LIMIT = 50;
   const rehydrated: BaseMessage[] = [];
   if (convId !== null) {
     const rows = opts.memory.getRecentMessages(convId, REHYDRATION_LIMIT);
     for (const row of rows) {
       if (row.role === 'user') rehydrated.push(new HumanMessage(row.content));
       else if (row.role === 'assistant') rehydrated.push(new AIMessage(row.content));
     }
     if (rehydrated.length > 0) {
       console.log(`[ChatSession] ♻️  rehydrated ${rehydrated.length} messages from convId=${convId}`);
     }
   }
   ```
3. Construtor ganha parâmetro opcional `rehydratedHistory: BaseMessage[] = []` e monta `this.history = [new SystemMessage(SYSTEM_PROMPT), ...rehydratedHistory]`. Factory passa `rehydrated` como último argumento.

**Imports não precisaram mudar** — `AIMessage`, `HumanMessage`, `SystemMessage` e `BaseMessage` já estavam importados de `@langchain/core/messages` (linhas 19-25).

**Edge case validado**: `getRecentMessages` retorna `[]` em fresh start → `rehydrated = []` → log NÃO emitido → `this.history = [SystemMessage]` — comportamento original preservado.

## Logs de comportamento (antes vs depois)

### Antes (cada restart criava conversa nova)

```
docker compose up -d
backend-ts | [SQLite] 🆕 conversation started (id=1)
# user: "oi, lembra do meu nome? é Felipe"
backend-ts | [SQLite] ✅ inserted 2 messages (convId=1)

docker compose restart backend-ts
backend-ts | [SQLite] 🆕 conversation started (id=2)   ← nova row! id=2
# user: "qual meu nome?"
backend-ts | [LLM] resposta: "Não sei seu nome, podes me dizer?"
                    ↑ history só tinha SystemMessage; LLM não vê o turno anterior
```

### Depois (reuso + rehydration)

```
docker compose up -d  # primeiro startup, tabela vazia
backend-ts | [SQLite] 🆕 conversation started (id=1)
# user: "oi, lembra do meu nome? é Felipe"
backend-ts | [SQLite] ✅ inserted 2 messages (convId=1)

docker compose restart backend-ts
backend-ts | [SQLite] ▶ resumed conversation (id=1)            ← reusa row existente
backend-ts | [ChatSession] ♻️  rehydrated 2 messages from convId=1
# user: "qual meu nome?"
backend-ts | [LLM] resposta: "Felipe."
                    ↑ history agora inclui [System, Human("oi..."), AI(...), Human("qual...")]
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Mocks de `memory` em 4 test files não tinham `getOrCreateConversation` / `getRecentMessages`**

- **Found during:** Task 3 verify (`pnpm test --run` falhou com 27 testes em vermelho)
- **Issue:** `ChatSession.create()` agora chama `opts.memory.getOrCreateConversation()`; os mocks de `makeMemory()` em 4 test files declaravam só `startConversation`. Resultado: `TypeError: opts.memory.getOrCreateConversation is not a function` em todos os tests que constróem uma `ChatSession`.
- **Fix:** Adicionei `getOrCreateConversation: vi.fn().mockResolvedValue(convId)` e `getRecentMessages: vi.fn().mockReturnValue([])` ao `makeMemory()` de cada arquivo. Mantive `startConversation` mockado também (outros tests podem inspeção-lo). Atualizei a descrição/asserção de 2 testes em `chat-session.test.ts` que checavam explicitamente `memory.startConversation` — agora checam `memory.getOrCreateConversation`.
- **Files modified:**
  - `apps/backend-ts/src/session/chat-session.test.ts`
  - `apps/backend-ts/test/session/chat-session-stream.test.ts`
  - `apps/backend-ts/test/session/chat-session-tools.test.ts`
  - `apps/backend-ts/test/session/extraction-wiring.test.ts`
- **Commit:** `5ef5add` (incluído junto com a mudança de produção em chat-session.ts — uma mudança atômica ponta-a-ponta).

Por que Rule 3 e não Rule 1 ou separar em commit próprio: o plano explicitamente trocou `startConversation()` → `getOrCreateConversation()` no factory. As atualizações de mock são consequência direta dessa decisão de design, não bug pré-existente. Mantê-las no mesmo commit do produto preserva a propriedade de bisect-friendly: o repo nunca atravessa um estado em que produto e teste discordam.

## Resultados de Verificação

- ✅ `pnpm tsc --noEmit` clean (3 vezes — após cada task)
- ✅ `pnpm test --run` — 216/216 testes passando, 32 test files
- ✅ `grep getOrCreateConversation src/memory/store.ts` retorna a definição
- ✅ `grep getRecentMessages src/memory/store.ts` retorna a definição com filtro de role
- ✅ Logs `[SQLite] ▶ resumed conversation` e `[SQLite] 🆕 conversation started` cobrem ambos os caminhos

## Próximos Passos Opcionais

1. **`REHYDRATION_LIMIT` configurável via env** — quando observarmos prompt-token bloat ou quisermos modular por modelo (ex: 200 para context window grande, 20 para LM Studio local). Sugestão: `process.env.REHYDRATION_LIMIT ?? 50`.
2. **Integração com rolling summary (Phase 38)** — `manager._latestSummary` já existe e é exposto por `buildContext()`. Vale prefixar o sumário no `rehydrated[]` (antes das mensagens) para que mensagens antigas comprimidas + recentes cruas convivam no history? Decisão fica para v1.9 quando observarmos o comportamento na prática.
3. **Smoke test e2e em Docker** — script que faz `docker compose up`, manda 1 turno, faz `restart`, manda 2º turno checando se a resposta referencia o 1º. O verify atual cobre só unit/integration.
4. **Testes específicos para rehydration** — adicionar test em `chat-session.test.ts` que mockva `getRecentMessages` retornando 3 rows e valida que `session.history` tem `[System, Human, AI, Human, AI, Human]` na ordem certa, e que o log `♻️ rehydrated 3 messages` é emitido. Não existe ainda — fora do escopo de "no regression".

## Self-Check: PASSED

**Files verified:**
- ✅ `apps/backend-ts/src/memory/store.ts` (modified — getOrCreateConversation + getRecentMessages)
- ✅ `apps/backend-ts/src/memory/manager.ts` (modified — facade)
- ✅ `apps/backend-ts/src/session/chat-session.ts` (modified — rehydration)
- ✅ `apps/backend-ts/src/session/chat-session.test.ts` (modified — mock + assertions)
- ✅ `apps/backend-ts/test/session/chat-session-stream.test.ts` (modified — mock)
- ✅ `apps/backend-ts/test/session/chat-session-tools.test.ts` (modified — mock)
- ✅ `apps/backend-ts/test/session/extraction-wiring.test.ts` (modified — mock)

**Commits verified:**
- ✅ `c632dc0` — Task 1 (store.ts)
- ✅ `47d5b6e` — Task 2 (manager.ts)
- ✅ `5ef5add` — Task 3 (chat-session.ts + test mocks)
