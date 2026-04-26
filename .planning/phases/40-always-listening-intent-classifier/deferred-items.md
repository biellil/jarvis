# Phase 40 — Deferred Items

Out-of-scope discoveries logged during plan execution. Per GSD scope boundary rules, these are NOT fixed by the current plan but tracked for future work.

## Plan 40-02 (executed 2026-04-26)

### Pre-existing test failures (worktree environment)

Quando rodando `vitest` no worktree paralelo, 8 test files falham por causa de `node_modules` ausentes ou stub incompleto no worktree:

- `src/main/__tests__/integration-chat.test.ts` — falha
- `src/main/__tests__/ipc-chat.test.ts` — falha
- `src/main/__tests__/security.test.ts > setupIpcHandlers is called before createWindow` — falha
- `src/main/__tests__/voiceHandler.test.ts` (5 sub-testes) — falha (Cannot find package '@fugood/whisper.node')
- `src/main/ipc/__tests__/chat-send-audio.test.ts` — falha
- `src/main/voiceInput/__tests__/gpuDetection.test.ts` (3 testes) — falha
- `src/main/voiceInput/__tests__/whisperResources.test.ts` (3 testes) — falha
- `src/main/voiceInput/tts/__tests__/tts-providers.test.ts` — falha

**Causa:** o worktree paralelo (`/root/jarvis/.claude/worktrees/agent-aba9c1c9dea2e7da0`) não tem `node_modules` próprio — testes que importam `@fugood/whisper.node`, `electron`, etc. via dynamic import quebram quando rodados a partir do worktree (mesmo usando o binary do `node_modules` da raiz `/root/jarvis/apps/desktop/node_modules/.bin/vitest`).

**Verificado pre-existente:** após `git stash` das mudanças do Task 2 (apenas Task 1 commit aplicado), as mesmas 5 failures de voiceHandler.test.ts persistem — não foram introduzidas pelo plan 40-02.

**Impacto no plan 40-02:** zero. As verificações do plan focam em `src/main/__tests__/store.test.ts` (25/25 passando) e validação por grep dos novos tipos em `ipc-types.ts` e `whisperResources.ts`.

**Ação recomendada:** quando consolidando worktrees no merge, rodar `pnpm install` e validar suite completa no main worktree antes de marcar Phase 40 como pronta.

### TypeScript module-resolution warnings (worktree)

`tsc --noEmit` no worktree reporta erros como `Cannot find module 'electron-store'`, `Cannot find module 'electron'`, `node:path` etc. Mesma causa raiz acima. Os tipos novos (`AlwaysListeningUtterancePayload`, `VoiceModeDegradedEvent`, `TranscribeResult`, `vadSilenceThresholdMs`) não geram nenhum erro novo — apenas os erros de módulos faltantes pre-existentes.
