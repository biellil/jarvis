---
phase: 67-jarvis-proativo
plan: "08"
subsystem: proactive-electron-ipc
tags: [electron, sse, notification, ipc, fetch, bearer-auth, tdd, vitest, wave-2]
dependency_graph:
  requires:
    - 67-04 (store.ts getQuietHours/getFolderWatch/getDailySummary + StoreSchema proativo)
    - 67-07 (createProactiveRouter SSE /stream + POST settings endpoints no backend)
  provides:
    - ProactiveSSEConsumer: fetch + ReadableStream loop com Bearer auth, Notification nativa pt-BR, IPC dispatch
    - setupProactiveIpc: 3 handlers ipcMain para apply-quiet-hours/folder-watch/daily-summary
    - pushProactiveConfigToBackend: startup config push para sincronizar electron-store com backend
    - Wiring completo em main/index.ts: setupProactiveIpc + pushProactiveConfigToBackend + startListening
  affects:
    - 67-09 (renderer: handler para proactive:event → TTS + chat bubble)
    - 67-10 (Settings UI: controles de quiet-hours/folder-watch/daily-summary no renderer)
tech_stack:
  added: []
  patterns:
    - fetch + ReadableStream + AbortController para SSE com Bearer auth (EventSource não suporta headers)
    - vi.hoisted() + function keyword para mock de construtores Electron (arrow function não é construtável)
    - dispatchEventForTest() como ponto de teste unitário sem simular loop fetch/ReadableStream
    - Promise.allSettled para startup config push fire-and-forget com log não-fatal por rota
    - pushProactiveConfigToBackend → startListening em cadeia com fallback se push falhar
key_files:
  created:
    - apps/desktop/src/main/proactive-handler.ts
    - apps/desktop/src/main/ipc/proactive.ts
  modified:
    - apps/desktop/src/main/ipc/__tests__/proactive.test.ts
    - apps/desktop/src/main/index.ts
key-decisions:
  - "dispatchEventForTest() exposto na classe para testes unitários sem simular loop SSE — evita servidor HTTP real nos testes de Notification"
  - "vi.hoisted() + function keyword obrigatório para mock de new Notification() — arrow functions não são construtáveis (ES6)"
  - "pushProactiveConfigToBackend → startListening em cadeia com fallback: SSE abre mesmo se config push falhar (non-fatal)"
  - "Promise.allSettled para 3 POSTs de config no startup — log por rota, nunca bloqueia o boot"
  - "setupProactiveIpc chamado com config.backendUrl + config.apiKey de loadBackendConfig() — zero hardcode"
patterns-established:
  - "Padrão constructor mock Vitest: vi.hoisted() + vi.fn().mockImplementation(function(this, opts){ this.show=...; }) para classes instanciadas com new"
  - "SSE com auth em Electron main: fetch + getReader() + TextDecoder ao invés de EventSource (não suporta headers customizados)"
requirements-completed:
  - PROACT-02
  - PROACT-03
duration: 25min
completed: "2026-05-10"
---

# Phase 67 Plan 08: Electron Main SSE Consumer + IPC

**ProactiveSSEConsumer com fetch+ReadableStream Bearer SSE, Notification nativa pt-BR por kind, IPC proactive:event ao renderer, e setupProactiveIpc com validação HH:MM + path absoluto wired em main/index.ts**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-10T23:40:00Z
- **Completed:** 2026-05-10T23:50:00Z
- **Tasks:** 2 (Task 1: TDD RED+GREEN; Task 2: wiring index.ts)
- **Files modified:** 4

## Accomplishments

- `ProactiveSSEConsumer` consome `/api/proactive/stream` via `fetch + ReadableStream` com Bearer auth, parseia blocos SSE `event: proactive:fire`, exibe `Notification` nativa pt-BR por kind (Lembrete / Resumo diário pronto / Novo arquivo em X) e envia `proactive:event` ao renderer via IPC
- `setupProactiveIpc` registra 3 handlers `ipcMain.handle` com validação: HH:MM regex em `apply-quiet-hours`, `path.isAbsolute` + DENIED_PATHS em `apply-folder-watch`, e POST ao backend + broadcast multi-window para cada mudança
- `pushProactiveConfigToBackend` lê store atual e POSTa 3 rotas de settings via `Promise.allSettled` (fire-and-forget, não bloqueia startup)
- `main/index.ts` wiring completo: `setupProactiveIpc` + sequência `pushProactiveConfigToBackend → startListening` com fallback non-fatal

## Task Commits

Cada task commitada atomicamente:

1. **Task 1 RED — testes proactive** - `9f2bacb` (test)
2. **Task 1 GREEN — ProactiveSSEConsumer + setupProactiveIpc** - `86350ea` (feat)
3. **Task 2 — wiring main/index.ts** - `2306368` (feat)

## Files Created/Modified

- `/root/jarvis/apps/desktop/src/main/proactive-handler.ts` — `ProactiveSSEConsumer` com SSE fetch loop, parseAndDispatch, handleProactiveEvent (Notification + IPC), getNotificationCopy pt-BR por kind, dispatchEventForTest para testes
- `/root/jarvis/apps/desktop/src/main/ipc/proactive.ts` — `setupProactiveIpc` com 3 handlers + validações; `pushProactiveConfigToBackend` startup sync
- `/root/jarvis/apps/desktop/src/main/ipc/__tests__/proactive.test.ts` — 15 testes: 6 ProactiveSSEConsumer, 6 setupProactiveIpc, 3 pushProactiveConfigToBackend
- `/root/jarvis/apps/desktop/src/main/index.ts` — imports + wiring após startActionsClient()

## Decisions Made

- `dispatchEventForTest()` exposto na classe como método público para testes unitários, evitando a necessidade de simular o loop `fetch + ReadableStream` completo nos testes de `Notification`
- Mock de construtor Electron `Notification` requer `vi.hoisted()` + `vi.fn().mockImplementation(function(this, opts){ this.show = ...; })` — arrow functions não são construtáveis com `new` em ES6 (mesmo padrão da Phase 67 nos STATE.md decisions)
- Sequência de startup: `pushProactiveConfigToBackend → startListening` em cadeia `.then()/.catch()` com fallback — se config push falhar, SSE abre mesmo assim (ambos são non-fatal)
- `Promise.allSettled` para os 3 POSTs de startup — cada rota falha independentemente, log por rota, nunca bloqueia o boot

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Arrow function não construtável como mock de `new Notification()`**

- **Found during:** Task 1 GREEN — 6 testes falhando com `arrow function is not a constructor`
- **Issue:** `vi.fn((_opts) => ({ show: mock, on: mock }))` usa arrow function; quando o código chama `new Notification(opts)`, o JS lança `TypeError: ... is not a constructor`. Arrow functions não têm `[[Construct]]` por especificação ES6.
- **Fix:** Substituído por `vi.fn().mockImplementation(function(this, opts) { this.show = notificationShowMock; this.on = notificationOnMock; })` — `function` keyword cria função construtável.
- **Files modified:** `apps/desktop/src/main/ipc/__tests__/proactive.test.ts`
- **Verificação:** 15/15 testes passando após a correção
- **Committed in:** `86350ea` (parte do commit de implementação GREEN)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Correção necessária para os testes passarem. Não afeta escopo nem implementação.

## Issues Encountered

- Primeira tentativa de mock com `vi.mock` factory sem `vi.hoisted()` causou "Cannot access before initialization" — resolvido aplicando o padrão `vi.hoisted()` obrigatório da Phase 67 (já documentado no STATE.md)

## Threat Surface Scan

Mitigações do threat model do plano aplicadas:

| Mitigação | Arquivo | Status |
|-----------|---------|--------|
| T-67-02: Bearer token no SSE fetch | proactive-handler.ts | Aplicado — Authorization header em todos os fetches |
| T-67-03: Validação path folder-watch | ipc/proactive.ts | Aplicado — path.isAbsolute + DENIED_PATHS |

Nenhuma nova superfície de ataque introduzida além das especificadas no threat model do plano.

## Known Stubs

Nenhum. Todos os componentes estão implementados e testados end-to-end:
- `ProactiveSSEConsumer.startListening` — implementação real com fetch + ReadableStream
- `setupProactiveIpc` — 3 handlers reais com validação e POST ao backend
- `pushProactiveConfigToBackend` — POST real para as 3 rotas de settings

## Self-Check: PASSED

- FOUND: `/root/jarvis/apps/desktop/src/main/proactive-handler.ts`
- FOUND: `/root/jarvis/apps/desktop/src/main/ipc/proactive.ts`
- FOUND: `class ProactiveSSEConsumer` em proactive-handler.ts (linha 18)
- FOUND: `Lembrete` em proactive-handler.ts (linha 114)
- FOUND: `Resumo diário pronto` em proactive-handler.ts (linha 133)
- FOUND: `webContents.send.*proactive:event` em proactive-handler.ts (linha 103)
- FOUND: `ProactiveSSEConsumer` em main/index.ts (linhas 55, 390)
- FOUND: commit `9f2bacb` (testes RED)
- FOUND: commit `86350ea` (implementação GREEN)
- FOUND: commit `2306368` (wiring index.ts)
- VERIFIED: 15/15 testes passando, 0 falhas no suite proactive

## Next Phase Readiness

- Renderer pode subscrever `proactive:event` via `ipcRenderer.on('proactive:event', handler)` para TTS + chat bubble (Plan 67-09)
- Settings UI pode chamar `ipcRenderer.invoke('proactive:apply-quiet-hours', config)` para aplicar configurações (Plan 67-10)
- Backend já tem os endpoints `/api/settings/quiet-hours`, `/api/settings/folder-watch`, `/api/settings/daily-summary` montados (Plan 67-07)
