---
phase: 41
plan: 03
subsystem: voice-mode
tags: [voice-mode, state-machine, gap-closure, tray]
type: gap-closure
gap_closure: true
requires:
  - phase-39 VoiceModeManager state machine (D-01, D-04)
  - phase-40 AlwaysListeningStrategy lifecycle (stop()/dispose() idempotente)
  - phase-41-01 tray submenu radio (broadcastModeSwitch)
  - phase-41-02 tray voice-mode wiring
provides:
  - "VoiceModeManager.setMode() funcional durante 'capturing'/'processing' — apenas guard re-entrante \`transitioning\` permanece"
  - "Testes invertidos cobrem novo contrato: capturing/processing → setMode succeeds + dispose() na strategy antiga"
affects:
  - apps/desktop/src/main/voiceMode/index.ts
  - apps/desktop/src/main/__tests__/voiceMode.test.ts
  - .planning/phases/41-tray-menu-mode-switch-ux/41-HUMAN-UAT.md
tech-stack:
  added: []
  patterns:
    - "Gap closure via remoção cirúrgica de gate over-conservativo (~4 LOC)"
    - "TDD inverso: RED inverte expectativas existentes (false→true) antes da remoção do gate"
key-files:
  created: []
  modified:
    - apps/desktop/src/main/voiceMode/index.ts (gate D-02 removido + JSDoc atualizado)
    - apps/desktop/src/main/__tests__/voiceMode.test.ts (2 testes invertidos + docstring de gap closure)
    - .planning/phases/41-tray-menu-mode-switch-ux/41-HUMAN-UAT.md (Test #6 issue → pass; Gaps → Closed Gaps)
decisions:
  - "Manter o guard \`transitioning\` (D-01) — esse é o controle correto contra cliques concorrentes; tem teste dedicado 'Race condition guard' que continuou verde."
  - "Trade-off Option A do debug: utterance in-flight no momento do mode switch é descartada via early-return em processUtterance (status==='idle'). Aceitável v1.9 — utterance é a ação que dispara o switch."
  - "Não criar mecanismo de force-stop separado — dispose() já chama stop() idempotente e drena o pipeline de áudio."
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 3
  loc_removed: 4
  loc_added_in_index: 6  # JSDoc updated; 4 LOC do gate removidas
  loc_added_in_tests: 21
  commits: 2
  tests_passing: 18
  tests_failing: 0
  completed: 2026-04-26
commits:
  - "463c7ef ✅ test(41-03): inverter testes de status guard para esperar sucesso (gap closure RED)"
  - "8c98c8e 🐛 fix(41-03): remover gate D-02 para destravar troca de modo durante captura ativa"
---

# Phase 41 Plan 03: Gap Closure — destravar troca de modo durante captura ativa Summary

Remover o gate `getStatus() !== 'idle'` em `VoiceModeManager.setMode()` que bloqueava silenciosamente toda troca de voice mode via tray enquanto `AlwaysListeningStrategy` estava em estado permanente `'capturing'` por design. Apenas o guard re-entrante `transitioning` permanece — `dispose()` já drena a strategy antiga via `stop()` idempotente, então o gate era redundante e prejudicial à UX.

## Contexto

**Origem:** Phase 41 UAT Test #6 reportou regressão major:
> `[VoiceModeManager] setMode('wake-word') blocked — active strategy status: capturing`

**Root cause** (debug session `41-mode-switch-blocked-during-capture.md`): `AlwaysListeningStrategy.start()` flipa `status='capturing'` no fim e só volta a `'idle'` em `stop()`. Logo, durante uso normal do Always-Listening o status é permanentemente `'capturing'` (ou brevemente `'processing'` durante uma utterance), e qualquer click no tray submenu falhava no gate D-02 com warn silencioso (Phase 42 toast ainda não shipped).

**Por que o gate era seguro de remover:** `dispose()` (linha ~194 do `voiceMode/index.ts`) já chama `stop()` da strategy antiga, e `AlwaysListeningStrategy.stop()` (`alwaysListening.ts:159-179`) é idempotente — remove `ipcMain.off(ALWAYS_LISTENING_UTTERANCE)`, sinaliza renderer com `ALWAYS_LISTENING_STOP`, e flips status para `'idle'`. O gate apenas duplicava preconditions de teardown que já são garantidas mais abaixo.

## Mudanças

### Task 1 — RED: inverter testes de status guard

**Arquivo:** `apps/desktop/src/main/__tests__/voiceMode.test.ts`

Os 2 testes do bloco `describe('VMODE-01: transition guards (D-01, D-02)')` foram renomeados e invertidos:

- `"setMode() blocked when ... 'capturing' — returns false"` → `"setMode() succeeds when active strategy is 'capturing' — old strategy is disposed (gap closure 41-03)"`
- `"setMode() blocked when ... 'processing' — returns false"` → `"setMode() succeeds when active strategy is 'processing' — old strategy is disposed (gap closure 41-03)"`

Ambos agora esperam: `result === true`, `manager.getMode()` aponta para o novo modo, e `oldStrategy.dispose` foi chamado 1x.

Docstring do arquivo recebeu nota de gap closure Phase 41 Plan 03 referenciando que o status guard D-02 foi removido.

**Commit:** `463c7ef`
**Estado pós-Task 1:** RED esperado — exatamente 2 falhas com `expected false to be true`, todos os outros 16 testes passando.

### Task 2 — GREEN: remover gate D-02

**Arquivo:** `apps/desktop/src/main/voiceMode/index.ts`

Removido o bloco (linhas 183-187 anteriores):
```typescript
// D-02: bloqueia se Strategy ativa não está idle
if (this.activeStrategy && this.activeStrategy.getStatus() !== 'idle') {
  console.warn(`[VoiceModeManager] setMode('${newMode}') blocked — active strategy status: ${this.activeStrategy.getStatus()}`);
  return false;
}
```

JSDoc do `setMode()` atualizado para documentar a remoção e referenciar Phase 41 Plan 03 como gap closure. Guard `transitioning` (D-01, linhas 178-181) preservado intacto.

**Commit:** `8c98c8e`
**Estado pós-Task 2:** 18/18 testes verdes em `voiceMode.test.ts`. Suite tray.test.ts mantém baseline 21 passed | 9 skipped.

## Verificação

| Critério | Resultado |
|----------|-----------|
| `pnpm vitest run src/main/__tests__/voiceMode.test.ts --no-coverage` | 18 passed, 0 failed |
| `grep -c "getStatus() !== 'idle'" apps/desktop/src/main/voiceMode/index.ts` | 0 (gate removido) |
| `grep -c "if (this.transitioning)" apps/desktop/src/main/voiceMode/index.ts` | 1 (guard preservado) |
| `pnpm vitest run src/main/__tests__/tray.test.ts --no-coverage` | 21 passed, 9 skipped (baseline mantido) |
| `pnpm tsc --noEmit` | Sem erros novos em arquivos modificados (erros pré-existentes do renderer fora do escopo) |
| Race condition test continua verde | ✓ (Race condition guard - transitioning flag) |

## Threat Model Outcome

Todas as mitigações documentadas no plano permanecem válidas:

| Threat ID | Status | Verificação |
|-----------|--------|-------------|
| T-41-03-01 (Tampering — utterance pós-stop) | mitigated | `ipcMain.off()` em `alwaysListening.ts:170` é executado antes do flip de status; comportamento já existente, não introduzido por esta mudança. |
| T-41-03-02 (DoS — cliques rápidos) | mitigated | Guard `transitioning` preservado; teste 'Race condition guard' continua verde. |
| T-41-03-03 (Repudiation — utterance perdida) | accepted | Trade-off Option A documentado; processUtterance early-return em `status === 'idle'`. |
| T-41-03-04 (Info Disclosure — leak de recursos) | mitigated | `dispose()` → `stop()` idempotente; sem mudança nesta zona. |
| T-41-03-05 (Elevation of Privilege) | accepted | Mudança não atravessa boundary de privilégio. |

## Deviations from Plan

None — plan executed exactly as written. RED → GREEN executou em 2 commits limpos, ~4 LOC removidas em `voiceMode/index.ts`, 2 testes invertidos + docstring atualizado em `voiceMode.test.ts`. Output spec do plan (atualizar 41-HUMAN-UAT.md) executado: Test #6 marcado como `pass` com nota de closure, gap movido de `## Gaps` para `## Closed Gaps`.

## Trade-offs

- **Utterance in-flight perdida em mode switch mid-capture (Option A):** se o usuário clica em outro modo enquanto uma utterance está sendo processada, o WAV é descartado pelo early-return em `processUtterance` (`status === 'idle'` set por `stop()`). Trade-off documentado no debug session — utterance é geralmente a ação que dispara o switch (usuário disse algo, percebeu modo errado, troca), então perder essa utterance específica é aceitável v1.9.
- **Phase 42 toast ainda desejável:** continua mantendo `broadcastModeSwitch({ success })` para confirmar sucesso futuramente; no longer used to surface "blocked" since the gate goes away.

## Closed Gaps

- **41-HUMAN-UAT Gap "Usuário consegue trocar de modo via tray menu sem precisar parar a captura de áudio":** fechado por commit `8c98c8e`. UAT atualizada: Test #6 `issue` → `pass`, gap movido de `## Gaps` para `## Closed Gaps`.

## Links

- Root cause analysis: `.planning/debug/41-mode-switch-blocked-during-capture.md`
- UAT: `.planning/phases/41-tray-menu-mode-switch-ux/41-HUMAN-UAT.md` (Test #6 + Closed Gaps)
- Plan source: `.planning/phases/41-tray-menu-mode-switch-ux/41-03-PLAN.md`
- Phase 39 contract this revisits: D-02 (status guard) — explicitly relaxed; D-01 (transitioning guard) preserved.

## Self-Check: PASSED

- File `apps/desktop/src/main/voiceMode/index.ts`: FOUND, gate D-02 ausente (grep retornou 0 ocorrências de `getStatus() !== 'idle'`), guard `transitioning` preservado (1 ocorrência).
- File `apps/desktop/src/main/__tests__/voiceMode.test.ts`: FOUND, 2 testes invertidos com `expect(result).toBe(true)` + `dispose toHaveBeenCalledOnce()`, docstring com nota de gap closure.
- Commit `463c7ef`: FOUND in `git log`.
- Commit `8c98c8e`: FOUND in `git log`.
- Tests: `pnpm vitest run src/main/__tests__/voiceMode.test.ts --no-coverage` → 18/18 passed (success criterion atingido).
- Tray baseline preservado: 21 passed | 9 skipped.
