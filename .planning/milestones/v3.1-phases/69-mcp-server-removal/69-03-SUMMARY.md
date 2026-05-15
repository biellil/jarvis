---
phase: 69-mcp-server-removal
plan: 03
subsystem: ui
tags: [electron, renderer, react, settings-ui, mcp, typescript]

# Dependency graph
requires:
  - phase: 69-mcp-server-removal/01
    provides: backend-ts MCP server stdio apagado (Wave 0)
  - phase: 69-mcp-server-removal/02
    provides: shared/ipc-types sem MCP_TOGGLE/MCP_GET_CONNECTED_CLIENTS/McpClientInfo/SettingsData.mcpServerEnabled; preload window.mcp sem toggle/getConnectedClients; store sem mcpServerEnabled schema/accessors
provides:
  - "McpSection.tsx self-contained (zero props), apenas sub-block Cliente MCP"
  - "SettingsLayout.tsx sem state hooks/handlers/JSX-props do MCP Server"
  - "JSX case 'mcp-server' renderiza <McpSection /> sem props"
  - "Renderer compila contra os types pós-Wave 1 (zero refs dangling a símbolos do MCP Server)"
  - "MCP-RM-01 atomicamente completo: backend + Electron main/preload/shared + renderer livres do MCP Server"
  - "MCP-RM-02 validado: gate e2e-mock-server.test.ts (3 testes) verde — MCP Client intacto"
affects: [70 (eventual remoção de section key 'mcp-server' + label 'Servidor MCP' do nav)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deleção em camadas (renderer Wave 2 após types/preload Wave 1) — renderer alinha aos contratos limpos sem refs dangling"
    - "Componente self-contained pós-strip: McpSection lê via window.mcp diretamente em useEffect (em vez de receber props de SettingsLayout)"
    - "Preservar surface UX intermediária (section key + label no nav) para Phase 70 limpar junto com a section LLM — evita disturbar layout sidebar duas vezes"

key-files:
  created: []
  modified:
    - apps/desktop/src/renderer/src/settings/sections/McpSection.tsx
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts  # Rule 1 — bug residual do Plan 02 limpo aqui
  deleted: []

key-decisions:
  - "Manter section key 'mcp-server' e label 'Servidor MCP' no nav (D-13, D-14) — Phase 70 remove junto com a section LLM"
  - "McpSection vira self-contained (zero props) — sub-block Cliente lê via window.mcp em useEffect, eliminando acoplamento com SettingsLayout"
  - "Limpar bug residual do Plan 02 (Rule 1): 2 expectations `mcpServerEnabled: false` em settings.test.ts + 1 mock `getMcpServerEnabled` — descobertos durante Task 3 validation, sem os quais a suite/test agregado falhariam"

patterns-established:
  - "Auto-fix de bug residual de plan upstream (Plan 02 declarou Task 6 implicitamente resolvida via c428196 mas 3 refs sobreviveram) — Plan 03 valida runtime e aplica fix em vez de bloquear"
  - "Renderer ↔ preload bridge: componente pode ler diretamente via window.<api> em useEffect, evitando prop-drilling quando o sub-block é uma feature local"

requirements-completed:
  - MCP-RM-01

# Metrics
duration: ~13min
completed: 2026-05-11
---

# Phase 69 Plan 03: Renderer Settings UI MCP Server Cleanup — Summary

**Remoção cirúrgica de state hooks, handlers e JSX relacionados ao MCP Server no renderer Electron Settings UI, mantendo intacto o sub-block "Cliente MCP" do componente McpSection. Phase 69 completa: MCP-RM-01 atomicamente entregue + MCP-RM-02 validado pelo gate de regressão.**

## Performance

- **Duration:** ~13 min (2026-05-11T00:12:21Z → 00:25:21Z)
- **Tasks:** 3 (2 commits + 2 fix commits Rule 1)
- **Files modified:** 0 created, 3 modified, 0 deleted

## Accomplishments

- `McpSection.tsx` reduzido a 109 linhas (era 149) — apenas sub-block Cliente MCP, zero props, importa só `McpClientStatus` de shared/ipc-types
- `SettingsLayout.tsx` purgado de state hooks (`mcpEnabled`, `mcpClients`, `mcpToggling`), handler (`handleMcpToggle`), import `McpClientInfo`, load do `data.mcpServerEnabled`; JSX case `'mcp-server'` virou `<McpSection />` sem props
- Section key `'mcp-server'` + label "Servidor MCP" no NAV_ITEMS PERMANECEM (D-13, D-14) — Phase 70 limpa
- Sub-block "Cliente MCP" 100% intacto: `formatClientStatusLabel`, `McpWindowApi`, state hooks `clientStatus`/`reloading`, `useEffect` com `getClientStatus + onClientStatusChanged`, `handleReconnect`, JSX `Field` com botão Reconectar
- Bug residual do Plan 02 limpo (Rule 1): 2 `mcpServerEnabled: false` expectations + 1 mock `getMcpServerEnabled` em `settings.test.ts` — sem essa limpeza, o gate agregado do Plan 03 Task 3 falharia
- Grep agregado em `apps/` por `createMcpServer|registerMemoryTools|registerFileActionTools|MCP_TOGGLE|MCP_GET_CONNECTED_CLIENTS|getMcpServerEnabled|setMcpServerEnabled|mcpServerEnabled` → **0 matches**
- Grep agregado em `apps/` por `McpClientInfo` → **0 matches**

## Task Commits

Cada task foi commitada atomicamente com `--no-verify` (worktree do Wave 2):

1. **Task 1 — Limpar McpSection.tsx removendo sub-block Servidor MCP e props** — `412d4d9` (refactor)
   - JSDoc atualizado (Phase 69: server-side sub-block removed)
   - Import de `McpClientInfo` removido (mantém apenas `McpClientStatus`)
   - Interface `McpSectionProps` apagada (4 props)
   - Assinatura: `export function McpSection()` (zero props)
   - 3 linhas (statusText, clientCount, comentário "Phase 64 — Servidor MCP") removidas
   - Bloco JSX `<Field>` do Servidor MCP (24 linhas: botão Habilitar/Desabilitar + status text + counter de clientes) removido
   - 1 file, 8 insertions, 43 deletions
2. **Task 2 — Limpar SettingsLayout.tsx removendo state/handlers/JSX do MCP Server** — `b84db3f` (refactor)
   - Import `McpClientInfo` removido da lista de shared/ipc-types
   - 4 linhas (comentário + 3 useState hooks) removidas
   - 2 linhas no useEffect de load (`setMcpEnabled(data.mcpServerEnabled ?? false)`) removidas
   - Função `handleMcpToggle` (24 linhas) removida
   - JSX case `'mcp-server'`: reduzido de 8 linhas (`<McpSection enabled={...} ... />`) para 1 linha (`<McpSection />`)
   - 1 file, 2 insertions, 40 deletions
3. **Task 3 — Validar typecheck + suite + gate MCP-RM-02** — sem commit principal (verificação)
   - 2 commits fix Rule 1 emitidos durante a validação:
     - `24fc8fd` (fix): remover 2 expectations residuais `mcpServerEnabled: false` em `settings.test.ts` (deixadas pelo Plan 02 Task 6)
     - `a9eef97` (fix): remover mock residual `getMcpServerEnabled: () => false` em `settings.test.ts` (deixado pelo Plan 02 Task 3)

## Files Created/Modified

- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — 149 → 109 linhas; props removidas; JSDoc atualizado; bloco JSX Servidor MCP apagado; sub-block Cliente MCP intacto (Task 1)
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — import sem `McpClientInfo`; sem state hooks `mcpEnabled`/`mcpClients`/`mcpToggling`; sem `handleMcpToggle`; sem load de `mcpServerEnabled`; JSX `<McpSection />` zero props (Task 2)
- `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — sem 2 expectations `mcpServerEnabled: false` + sem mock `getMcpServerEnabled` (Task 3 — Rule 1 residual do Plan 02)

## Decisions Made

- **D-13/D-14 honrados:** section key `'mcp-server'` e label "Servidor MCP" no `NAV_ITEMS` preservados. UX intencionalmente intermediária: usuário clica em "Servidor MCP" mas vê apenas o sub-block Cliente MCP. Phase 70 remove a section inteira junto com a migração LLM (evita disturbar layout sidebar duas vezes).
- **Componente self-contained pós-strip:** `McpSection` agora lê `window.mcp.getClientStatus()` e subscribe a `onClientStatusChanged` em `useEffect` em vez de receber props. Reduz acoplamento renderer ↔ container a zero — `SettingsLayout` agora monta `<McpSection />` igual `<PttSection />`/`<TtsSection />` etc.
- **Rule 1 auto-fix de bug residual do Plan 02:** Plan 02 declarou Task 6 satisfeita implicitamente em `c428196`, mas 3 refs sobreviveram (`mcpServerEnabled: false` × 2 expectations + `getMcpServerEnabled: () => false` × 1 mock). Aplicado fix imediato durante Task 3 validation — sem ele, `pnpm --filter desktop test src/main/ipc/__tests__/settings.test.ts` falharia 2 testes e o grep agregado falharia o critério 7 do success_criteria. Não bloqueante: é exatamente o tipo de "issue carregada do plan anterior" que Rule 1 cobre.

## Deviations from Plan

**Auto-fixed durante Task 3 validation (Rule 1 - Bug residual do Plan 02):**

1. **[Rule 1 - Bug] Remover 2 expectations `mcpServerEnabled: false` em `settings.test.ts`**
   - **Found during:** Task 3, durante `npx vitest run src/main/ipc/__tests__/settings.test.ts`
   - **Issue:** Plan 02 Task 6 (mocks e expectations) marcada como satisfeita implicitamente em commit `c428196`, mas duas linhas `mcpServerEnabled: false` sobreviveram nos blocos `toEqual` dos testes "returns persisted settings" e "returns defaults when store has no overrides" — provocando 2 falhas
   - **Fix:** Remover as duas linhas (settings.test.ts L302 e L337)
   - **Files modified:** `apps/desktop/src/main/ipc/__tests__/settings.test.ts`
   - **Commit:** `24fc8fd`

2. **[Rule 1 - Bug] Remover mock residual `getMcpServerEnabled` em `settings.test.ts`**
   - **Found during:** Task 3, durante o grep agregado final
   - **Issue:** Plan 02 Task 3 apagou `getMcpServerEnabled`/`setMcpServerEnabled` de `store.ts`, mas o mock `vi.mock('../../store', ...)` em `settings.test.ts` ainda exportava `getMcpServerEnabled: () => false` — apesar de não quebrar a suite (mock fica órfão), deixava 1 match no grep agregado `createMcpServer|...|getMcpServerEnabled|...`, falhando o critério 7 do success_criteria
   - **Fix:** Remover a linha 87 e comentário associado
   - **Files modified:** `apps/desktop/src/main/ipc/__tests__/settings.test.ts`
   - **Commit:** `a9eef97`

Ambos são "bugs carregados de Plan upstream" que o Plan 03 expôs ao validar runtime. Sem eles, a suite/grep agregado falhariam. Sem desvios funcionais no escopo das Tasks 1 e 2.

## Issues Encountered

- **Worktree branch base diferente do target:** Branch worktree estava em `e0da0b6` (commits sobre v3.1 main) em vez de `f9cbbfa` (Phase 69 pós-Wave 1). Executei `git reset --hard f9cbbfa7acf47180603dbf068902cefeddb98705` antes de começar. Plano `69-03-PLAN.md` (untracked) copiado do main repo (`/root/jarvis/.planning/phases/69-mcp-server-removal/69-03-PLAN.md`) para o worktree após o reset.
- **node_modules ausente no worktree:** Worktree não tinha dependências instaladas. Rodei `pnpm install --frozen-lockfile --prefer-offline` para habilitar typecheck e testes. ~4 min (download de wake-word models incluído).
- **Sem script `typecheck` no `apps/desktop/package.json`:** Plano espera `pnpm --filter desktop typecheck` — adaptei para `cd apps/desktop && npx tsc --noEmit` (mesmo comando que o script faria). Apenas erros pré-existentes (125 total) — zero relacionados ao MCP/arquivos editados. Mesma situação do Plan 01 (também documentou erros pré-existentes em deferred-items.md, fora do escopo).
- **Suite completa do desktop tem falhas pré-existentes** (15 arquivos / 36 testes): electron mock sem `app`/`dialog` exports (kokoroResources, alwaysListening, voiceHandler, actionsClient, file-actions), tray.platform regex assertion, vramDetection, whisper-gpu-detection, MicVAD types — todos do v3.0/Phase 67 e anteriores. Zero relacionados ao MCP Server. Confirmado via grep: `npx vitest run | grep -iE "mcp|McpClient|mcpServer"` → 0 matches.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

**Typecheck (renderer files editados):**
```
$ cd apps/desktop && npx tsc --noEmit 2>&1 | grep -E "SettingsLayout|McpSection|McpClientInfo|mcpServerEnabled"
(empty — zero errors in edited files)
```

**Suite settings.test.ts (alvo principal do gate):**
```
$ cd apps/desktop && npx vitest run src/main/ipc/__tests__/settings.test.ts
 Test Files  1 passed (1)
      Tests  39 passed (39)
```

**Gate MCP-RM-02 (critério 3 do ROADMAP §Phase 69):**
```
$ cd apps/backend-ts && npx vitest run src/mcp/client/__tests__/e2e-mock-server.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Backend-ts full suite:**
```
$ cd apps/backend-ts && npx vitest run
 Test Files  57 passed (57)
      Tests  433 passed | 1 skipped | 1 todo (435)
```

**Grep agregado (critério 7 do success_criteria):**
```
$ grep -rn --include="*.ts" --include="*.tsx" \
  "createMcpServer\|registerMemoryTools\|registerFileActionTools\|MCP_TOGGLE\|MCP_GET_CONNECTED_CLIENTS\|getMcpServerEnabled\|setMcpServerEnabled\|mcpServerEnabled" apps/
(empty — 0 matches)

$ grep -rn --include="*.ts" --include="*.tsx" "McpClientInfo" apps/
(empty — 0 matches)
```

**Estado dos arquivos editados:**
```
McpSection.tsx — McpSectionProps refs: 0
McpSection.tsx — Servidor MCP refs: 0
McpSection.tsx — Cliente MCP refs: 4 (preservado)
McpSection.tsx — reloadClient|getClientStatus|onClientStatusChanged refs: 8 (preservado)
SettingsLayout.tsx — mcpEnabled|mcpClients|mcpToggling|handleMcpToggle|setMcpEnabled|McpClientInfo refs: 0
SettingsLayout.tsx — <McpSection /> refs: 1 (zero props)
SettingsLayout.tsx — Servidor MCP refs: 1 (label no NAV_ITEMS, preservado per D-14)
SettingsLayout.tsx — 'mcp-server' refs: 3 (SectionKey union + nav item + case, preservado per D-13)
```

## Next Phase Readiness

- **Phase 69 atomicamente completa:** MCP-RM-01 entregue em 3 planos (backend + Electron main/preload/shared + renderer). MCP-RM-02 validado pelo gate de regressão (`e2e-mock-server.test.ts` verde).
- **Phase 70 (LLM `.env` migration + remoção da section LLM):** Pronto para começar. Phase 70 deve também remover a section key `'mcp-server'` + label "Servidor MCP" do `NAV_ITEMS` (intencionalmente preservados por D-13/D-14) — coordenar com o cleanup da section LLM para não disturbar o sidebar layout duas vezes.
- **Phase 71 (distribuição electron-builder):** Pronto após Phase 70 — evita rebuild duplo se MCP/LLM cleanup ficar pendente.
- **Sem blockers** — Phase 69 é self-contained e mergeable isoladamente.

## Self-Check: PASSED

**Created files:**
- FOUND: /root/jarvis/.claude/worktrees/agent-a021d5a8f122dfd44/.planning/phases/69-mcp-server-removal/69-03-SUMMARY.md

**Commits verified (worktree branch `worktree-agent-a021d5a8f122dfd44`):**
- FOUND: 412d4d9 — Task 1 (♻️ refactor(69-03): limpar McpSection.tsx removendo sub-block Servidor MCP)
- FOUND: b84db3f — Task 2 (♻️ refactor(69-03): limpar SettingsLayout.tsx removendo state/handlers do MCP Server)
- FOUND: 24fc8fd — Task 3 fix Rule 1 (🐛 fix(69-03): remover expectations residuais mcpServerEnabled de settings.test.ts)
- FOUND: a9eef97 — Task 3 fix Rule 1 (🐛 fix(69-03): remover mock residual getMcpServerEnabled em settings.test.ts)

**Files modified verified:**
- FOUND: apps/desktop/src/renderer/src/settings/sections/McpSection.tsx (109 linhas, McpSectionProps removida, <Field> Servidor MCP removido)
- FOUND: apps/desktop/src/renderer/src/settings/SettingsLayout.tsx (sem mcpEnabled/mcpClients/mcpToggling/handleMcpToggle, <McpSection /> zero props)
- FOUND: apps/desktop/src/main/ipc/__tests__/settings.test.ts (sem refs a mcpServerEnabled ou getMcpServerEnabled)

**Aggregate grep verification:**
- `grep -rn ... apps/` por símbolos do MCP Server → 0 matches
- `grep -rn "McpClientInfo" apps/` → 0 matches

---
*Phase: 69-mcp-server-removal*
*Plan: 03*
*Completed: 2026-05-11*
