# Plan 22-GAP-01: Wake Word Path Resolver Fix — Summary

**Status:** ✅ Complete
**Date:** 2026-04-11
**Requirements:** WAKE-09 (runtime prerequisite)

## O que foi consertado

Off-by-one no `getWakeWordModelPaths()` em dev mode — resolvia para `apps/resources/wakeword-models/` ao invés de `apps/desktop/resources/wakeword-models/`.

**Bug observado:**
```
Error occurred in handler for 'wakeWord:load-models':
ENOENT: no such file or directory, open
'C:\jarvis\apps\resources\wakeword-models\embedding_model.onnx'
```

**Root cause:** `path.join(__dirname, '../../../resources/wakeword-models')` na [resources.ts:43](apps/desktop/src/main/voiceInput/resources.ts#L43).

Runtime: `__dirname = apps/desktop/dist/main/` → três níveis acima = `apps/` (errado, deveriam ser dois para chegar em `apps/desktop/`).

## Commits

| # | Hash | Descrição |
|---|------|-----------|
| 1 | `7e47868` | 📝 docs(22-gap): cria gap plan |
| 2 | `9916cf3` | 🐛 fix(22-gap): off-by-one corrigido + 3 testes de regressão |

## Arquivos

**Modificado:**
- `apps/desktop/src/main/voiceInput/resources.ts` — `'../../../resources/wakeword-models'` → `'../../resources/wakeword-models'`

**Criado:**
- `apps/desktop/src/main/__tests__/voiceInput-resources.test.ts` — 3 testes:
  1. Path math correto (`../../` de `dist/main/` chega em `apps/desktop/resources/`)
  2. Off-by-one documentado como wrong (detecta regressão a `../../../`)
  3. Source file grep — lock da string `'../../resources/wakeword-models'`

## Verificação

- `grep "'../../resources/wakeword-models'"` → 1 match ✓
- `grep "'../../../resources/wakeword-models'"` → 0 matches ✓
- `pnpm --filter @jarvis/desktop test --run voiceInput-resources` → **3/3 pass** ✓
- `pnpm --filter @jarvis/desktop build` → exit 0, zero TS errors ✓

## Próximo passo

Usuário precisa re-rodar `pnpm dev`, confirmar que `wakeWord:load-models` não dá mais ENOENT, e retomar as 7 verificações manuais do checkpoint Phase 22 (ver `.planning/.continue-here.md`).
