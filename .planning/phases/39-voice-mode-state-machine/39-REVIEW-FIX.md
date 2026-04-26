---
phase: 39-voice-mode-state-machine
fixed_at: 2026-04-25T22:14:00Z
review_path: .planning/phases/39-voice-mode-state-machine/39-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-04-25T22:14:00Z
**Source review:** .planning/phases/39-voice-mode-state-machine/39-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01, WR-02, WR-03, WR-04 — Critical=0, Warning=4)
- Fixed: 4
- Skipped: 0
- Info findings (IN-01..IN-06): out of scope (`fix_scope=critical_warning`)

**Test verification:**
- `voiceMode.test.ts` — 18 testes passando (14 originais + 4 novos de regressão)
- `store.test.ts` — 20 testes passando (sem regressão)
- `tsc --noEmit` — sem erros nos arquivos modificados (erros pré-existentes em outros arquivos não relacionados)

## Fixed Issues

### WR-01: Mode persisted even when new Strategy fails to start (state desync)

**Files modified:** `apps/desktop/src/main/voiceMode/index.ts`, `apps/desktop/src/main/__tests__/voiceMode.test.ts`
**Commit:** `0a8fb9d`
**Applied fix:** Em `setMode()`, o catch do bloco interno agora retorna `false` cedo sem persistir nem emitir event. A factory ausente também retorna `false` (antes silenciosamente avançava o `currentMode`). Adicionados 2 testes de regressão:
1. Factory que throws (modo Phase 40/43 não implementado) → `getMode()` permanece, store intocado, nenhum event.
2. `start()` que rejeita após construção bem-sucedida (audio device busy) → mesma garantia.

### WR-02: `init()` not idempotent — double call leaks the first Strategy

**Files modified:** `apps/desktop/src/main/voiceMode/index.ts`, `apps/desktop/src/main/__tests__/voiceMode.test.ts`
**Commit:** `ac5ffbd`
**Applied fix:** Adicionada flag `private initialized = false`; segunda chamada a `init()` é no-op com warning log. `dispose()` reseta a flag para permitir re-init() após teardown explícito (necessário para test rerun e hot reload). Adicionados 2 testes:
1. Segunda `init()` não constrói nova Strategy (factory chamada 1x).
2. `init()` funciona normalmente após `dispose()` (factory chamada 2x).

### WR-03: `EventEmitter` max listeners not configured

**Files modified:** `apps/desktop/src/main/voiceMode/index.ts`
**Commit:** `123cd30`
**Applied fix:** Chamada `this.setMaxListeners(20)` no construtor com comentário documentando os subscribers esperados (IPC bridge, tray menu, audit log, wake-word pause module, Phase 40/43 controllers, settings window). Cap conservador para surface real leaks sem false positives.

**Nota:** Este commit incidentalmente capturou uma re-modificação do binário `apps/desktop/src/resources/models/whisper/ggml-base.bin` que estava no working tree (modificado por outro processo entre operações git). O bin não afeta o código TypeScript do Phase 39 e não regride nada — apenas inflou o commit. Não foi possível reverter sem perder a fix WR-03 (`git reset` perderia a mudança de TypeScript).

### WR-04: Race-condition test depends on fragile microtask-tick counting

**Files modified:** `apps/desktop/src/main/__tests__/voiceMode.test.ts`
**Commit:** `525e7ad`
**Applied fix:** Substituído `await Promise.resolve()` x3 por `await vi.waitFor(() => expect(ww.dispose).toHaveBeenCalled())`. A sincronização agora pin no evento observável "dispose chamado", o primeiro await dentro de `setMode()`. Sobrevive a refactors internos que adicionem/removam awaits. O mock `slowAl` perdeu o `start()` lento (não precisa mais ser lento — o ponto de sincronização é o `dispose` da Strategy antiga, não o `start` da nova).

## Skipped Issues

Nenhum finding pulado. Todas as 4 warnings foram aplicadas com sucesso.

---

_Fixed: 2026-04-25T22:14:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
