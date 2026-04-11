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
