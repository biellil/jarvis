# Phase 9: Electron Scaffold - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar `apps/desktop` no monorepo pnpm com a arquitetura de segurança Electron correta — contextIsolation ativo, nodeIntegration desativado, preload tipado com contextBridge — pronto para receber código de feature sem herdar falhas estruturais.

</domain>

<decisions>
## Implementation Decisions

### IPC Architecture
- **D-01:** Handlers IPC centralizados em `src/main/ipc/` organizados por feature (ex: `ipc/chat.ts` com `setupChatHandlers()`)
- **D-02:** Tipos compartilhados em `src/shared/ipc-types.ts` — interfaces Request/Response por canal, importadas pelo preload e renderer
- **D-03:** Handlers retornam Result type `{ success: boolean, data?: T, error?: string }` — nunca throw exceptions pela barreira IPC
- **D-04:** `window.jarvis.sendText('teste')` implementado como handler funcional que loga no main — prova IPC end-to-end sem integração com gateway ainda

### React Setup
- **D-05:** React puro + react-router-dom — sem frameworks adicionais (sem Vite SPA standalone, sem TanStack)
- **D-06:** State management via Context API + useState/useReducer — built-in React suficiente para widget
- **D-07:** Componentes organizados por feature desde o início — `src/renderer/components/Orb/`, `src/renderer/components/Chat/`

### Build & Dev Workflow
- **D-08:** Scripts package.json seguem padrão do gateway — `dev`, `build`, `start` (consistência no monorepo: `pnpm --filter desktop dev`)
- **D-09:** Hot reload split — renderer com HMR, main com restart ao mudar (padrão electron-vite)
- **D-10:** Sourcemaps inline em dev, desabilitados em prod — debug TypeScript original em dev, bundle otimizado em prod

### Claude's Discretion
- Configuração exata do electron-vite.config.ts (otimizações, aliases)
- Estrutura interna de pastas em cada feature de componente
- Naming convention para handlers IPC (sufixo Handler, prefix setup)
- Se adicionar .env reader ou usar process.env direto no main

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Electron Security
- Nenhum spec externo — requirements DESK-01 define explicitamente: `contextIsolation: true`, `nodeIntegration: false`, preload com contextBridge tipado

### API Integration
- `.planning/REQUIREMENTS.md` §Desktop App — DESK-01 define estrutura obrigatória (electron-vite, React, TS, três entry points)
- `.planning/PROJECT.md` §Constraints — "Sem UI obrigatória: JARVIS funciona 100% em terminal; UI é opcional"

### Monorepo Patterns
- `apps/gateway/package.json` — referência para naming (@jarvis/desktop), scripts (dev/build/start), structure (src/)
- `pnpm-workspace.yaml` — apps/desktop será adicionado ao pattern 'apps/*' existente

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Monorepo pnpm:** `pnpm-workspace.yaml` já configurado com `apps/*` — desktop se adiciona automaticamente
- **TypeScript config:** `apps/gateway/tsconfig.json` e root `tsconfig.json` como referência para config Node 22
- **Vitest setup:** Gateway usa Vitest — desktop pode seguir mesmo padrão se adicionar testes unitários

### Established Patterns
- **Package naming:** `@jarvis/*` — desktop será `@jarvis/desktop`
- **Scripts padrão:** `dev`, `build`, `start` — gateway estabeleceu convenção
- **Type-safe config:** Gateway usa Zod para validação — IPC pode usar shared types sem Zod (overhead desnecessário para IPC local)

### Integration Points
- **Gateway API:** `http://localhost:3000/api/chat` — main process fará fetch para isso (Phase 12, não agora)
- **Monorepo deps:** Desktop compartilhará root `node_modules` via pnpm hoisting — dependências comuns (TypeScript, etc) não duplicam

</code_context>

<specifics>
## Specific Ideas

- "Seguir padrão do gateway" — consistência de naming, scripts e estrutura com `apps/gateway` existente
- "sendText funcional que loga no main" — handler real provando IPC, não stub/mock. Base para integração posterior.
- "Componentes por feature desde o início" — evitar refactor quando adicionar Orb (Phase 11) e Chat (Phase 12)

</specifics>

<deferred>
## Deferred Ideas

- **Packaging (electron-builder):** Script `package` para gerar executável — fora do escopo da Phase 9 (scaffold apenas)
- **Testes E2E (Playwright):** Testing strategy discutido mas não selecionado — adicionar quando precisar validar flows completos
- **Zod validation no IPC:** Gateway usa Zod para validação HTTP; IPC é local e tipado — overhead desnecessário por enquanto

</deferred>

---

*Phase: 09-electron-scaffold*
*Context gathered: 2026-04-06*
