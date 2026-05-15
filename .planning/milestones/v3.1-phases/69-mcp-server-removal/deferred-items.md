# Deferred Items — Phase 69 MCP Server Removal

Items descobertos durante execução mas **fora do escopo** desta phase. Registrados para triagem posterior.

## Pré-existentes (não introduzidos por Phase 69)

### TS-1: backend-ts typecheck errors pré-existentes

Quatro erros de TypeScript existentes ANTES da Phase 69 — confirmados via grep zero em referências aos arquivos MCP apagados:

1. `apps/backend-ts/src/index.ts:105:37` — `Property 'llm' is private and only accessible within class 'ChatSession'.`
   - Site: `ProactiveScheduler.setLlm(session.llm)` (Phase 67 Plan 07).
   - Causa: campo `llm` é privado em `ChatSession`.

2. `apps/backend-ts/src/proactive/folder-watcher.ts:111:30` — `Argument of type '(err: Error) => void' is not assignable to parameter of type '(err: unknown) => void'.`
   - Phase 67 código pré-existente.

3. `apps/backend-ts/src/proactive/scheduler.ts:195:41` — Drizzle `BetterSQLite3Database` type mismatch com `Record<string, never>`.
   - Phase 67 código pré-existente.

4. `apps/backend-ts/src/routes/__tests__/proactive.route.test.ts:96:17,38` — `Property 'response' does not exist on type 'ErrnoException'.`
   - Phase 67 teste pré-existente.

**Evidência de pré-existência:**
- `grep -rn "mcp/server\|mcp/client-sessions\|mcp/tools/" apps/backend-ts/src/ --include="*.ts"` → 0 matches
- `grep -rn "createMcpServer\|registerMemoryTools\|registerFileActionTools" apps/backend-ts/src/ --include="*.ts"` → 0 matches
- Erros estão todos em arquivos da Phase 67 (proactive/* + ProactiveScheduler.setLlm) e não tocam em nada que a Phase 69 mexeu.

**Apesar dos typecheck errors, a suite de testes completa do backend-ts passa: 57 files, 433 tests passed.** Os erros são de tipos estritos que o Vitest não enforça via ts-loader; `tsc --noEmit` os reporta mas o runtime/test passa.

**Disposição:** Reportar à equipe de Phase 67 (ou abrir Phase de manutenção) — Phase 69 não introduziu nada e tem o escopo restrito à remoção do MCP Server.
