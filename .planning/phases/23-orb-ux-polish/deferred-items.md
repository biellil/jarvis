# Phase 23 Deferred Items

## Pre-existing TypeScript errors (out of scope for 23-01)

Descobertos durante verificação do plan 23-01 via `tsc --noEmit -p tsconfig.json`.
Nenhum está em arquivo tocado pelo plano 23-01. Registrados aqui para auditoria.

| File | Line | Error | Origem |
|------|------|-------|--------|
| `src/main/__tests__/integration-chat.test.ts` | 76 | TS2554: expected 1 argument, got 0 | pré-22 |
| `src/main/index.ts` | 108 | TS2367: `'audioCapture'` fora do enum de permission | pré-22 |
| `src/main/index.ts` | 121 | TS2367: `'audioCapture'` fora do enum de permission | pré-22 |
| `src/renderer/components/ChatInput/ChatInput.tsx` | 231 | TS2353: `WebkitAppRegion` não existe em CSSProperties | pré-22 |
| `src/renderer/components/ChatInput/ChatInput.tsx` | 250 | TS2353: `WebkitAppRegion` não existe em CSSProperties | pré-22 |
| `src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts` | 34 | TS2322: Mock tipagem incompatível com `() => void` | Phase 22 |

Plan 23-01 touched apenas `OrbContext.tsx`, `Orb.tsx`, `OrbContext.test.tsx`,
`Orb.test.tsx`, `tailwind.config.ts` e `globals.css`. Todos esses compilam
e testam limpos (30/30 tests passing).

## Pre-existing test failures (out of scope for 23-02)

Descobertos durante verificação do plan 23-02 rodando a suite completa do
desktop. Confirmados como pre-existentes via `git stash + checkout` do base
commit 71eb33f — ainda falham 8/8 no WakeWordEngine e 1/1 no modelLoader.

| File | Tests failing | Error | Origem |
|------|---------------|-------|--------|
| `src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` | 8/8 | `ReferenceError: document is not defined` em `WakeWordEngine.start` (`document.baseURI`) | Phase 22 gap fix f693537 — document não existe no test env happy-dom |
| `src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts` | 1/1 | Import falha (module resolution) | Phase 22 |

**Recomendação:** criar test setup que stub `document.baseURI` via happy-dom
config global, ou migrar os testes pra `vi.mock('../WakeWordEngine', ...)`.
Plan 23-02 não toca esses arquivos e não causa as falhas.

Plan 23-02 touched: store.ts, ipc-types.ts, preload/index.ts, ipc/settings.ts,
tray.ts, useWakeWord.ts + 4 arquivos de teste. Todos esses passam limpos
(52/52 tests passing para os arquivos do plan).
