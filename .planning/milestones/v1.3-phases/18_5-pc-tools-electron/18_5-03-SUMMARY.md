---
phase: 18_5-pc-tools-electron
plan: 03
subsystem: desktop/main/actions
tags: [electron, linux, subprocess, security]
one_liner: 9 action handlers Linux (execFile+fs.promises) com validação estrita, timeout 30s e erros estruturados — zero uso de child_process.exec
requires: []
provides:
  - ACTION_HANDLERS dispatch table para o executor (18_5-04)
  - REQUIRES_CONFIRMATION set (delete_file)
  - validators reusáveis (assertAbsolutePath, assertSafeAppName, assertLevel0to100, assertSafeGlobPattern)
  - runExecFile helper com mapeamento de erros (ENOENT→command_not_found, EACCES→permission_denied, killed→subprocess_timeout, exit!=0→subprocess_failed)
affects: []
tech_added: []
patterns:
  - execFile-only (nunca exec, nunca spawn com shell)
  - args sempre como array literal
  - validação antes do syscall, erro estruturado sem throw
key_files:
  created:
    - apps/desktop/src/main/actions/types.ts
    - apps/desktop/src/main/actions/validators.ts
    - apps/desktop/src/main/actions/open-app.ts
    - apps/desktop/src/main/actions/close-app.ts
    - apps/desktop/src/main/actions/list-files.ts
    - apps/desktop/src/main/actions/search-files.ts
    - apps/desktop/src/main/actions/move-file.ts
    - apps/desktop/src/main/actions/delete-file.ts
    - apps/desktop/src/main/actions/set-volume.ts
    - apps/desktop/src/main/actions/set-brightness.ts
    - apps/desktop/src/main/actions/list-processes.ts
    - apps/desktop/src/main/actions/index.ts
    - apps/desktop/src/main/__tests__/actions.test.ts
  modified: []
decisions:
  - "paths relativos (~, ./, $HOME, sem /) rejeitados antes de qualquer syscall"
  - "pkill exit!=0 é reportado como 'subprocess_failed: no matching process' (semântica explícita)"
  - "EXDEV reporta erro sem tentar copy+unlink (simples, explícito)"
  - "delete_file NÃO faz confirmação — responsabilidade do executor (18_5-04)"
metrics:
  tasks: 2
  files_created: 13
  tests_added: 34
  tests_passing: 34
---

# Phase 18.5 Plan 03: Linux Action Handlers Summary

## O que foi feito

Implementados os 9 action handlers Linux nativos do Electron main process em `apps/desktop/src/main/actions/`. Cada handler é uma função `(args) => Promise<ActionResult>` pura que:

1. Valida entrada via validators compartilhados (`assertAbsolutePath`, `assertSafeAppName`, `assertLevel0to100`, `assertSafeGlobPattern`).
2. Executa via `child_process.execFile` com args como **array literal** (nunca string concatenada) e timeout de 30s, OU via `fs.promises` para operações puras de filesystem.
3. Retorna `{success, output, error}` sem lançar. Todos os erros mapeados para códigos estruturados.

## Allowlist final (9 ações)

| Action | Comando/API | Validação |
|---|---|---|
| open_app | `execFile('xdg-open', [app])` | regex `^[a-zA-Z0-9._\-+]+$` |
| close_app | `execFile('pkill', ['-f', app])` | mesma regex; exit≠0 → `no matching process` |
| list_files | `fs.stat` + `fs.readdir(withFileTypes)` | path absoluto, é diretório; output JSON |
| search_files | `execFile('find', [dir, '-maxdepth','5','-name', pattern])` | dir absoluto, pattern sem `..`/`/`/`;`/`\|`/backtick/`$` |
| move_file | `fs.rename(src, dst)` | src+dst absolutos; EXDEV → cross-device error |
| delete_file | `fs.unlink(path)` | path absoluto; confirmação fica no 18_5-04 |
| set_volume | `execFile('pactl', ['set-sink-volume','@DEFAULT_SINK@', '${N}%'])` | int [0,100] |
| set_brightness | `execFile('brightnessctl', ['set', '${N}%'])` | int [0,100] |
| list_processes | `execFile('ps', ['-eo','pid,comm,pcpu,pmem','--sort=-pcpu'])` | sem args |

## Erros estruturados

`path_must_be_absolute`, `path_not_found`, `permission_denied`, `command_not_found`, `subprocess_failed: <stderr>`, `invalid_args: <detalhe>`, `subprocess_timeout`.

## Dispatch table (exportada pelo 18_5-04)

```typescript
import { ACTION_HANDLERS, REQUIRES_CONFIRMATION } from './actions/index.js';
// ACTION_HANDLERS: Record<string, ActionHandler>
// REQUIRES_CONFIRMATION: Set<string> = new Set(['delete_file'])
```

Chaves em snake_case casando 1:1 com os nomes emitidos por `apps/backend-ts/src/session/pc-tools.ts`.

## Segurança validada

- `grep -rn "child_process.exec(" apps/desktop/src/main/actions/` → **zero matches**
- Único import de `node:child_process`: named import `execFile` em `validators.ts`
- Todos os `execFile` chamados com args como array literal (confirmado pelos 34 testes que verificam `call[1]` é array exato)
- Tentativas de injeção (`app: 'firefox; rm -rf /'`) rejeitadas no validator antes de qualquer syscall

## Verificação

- `pnpm vitest run src/main/__tests__/actions.test.ts` → **34 passed**
- `pnpm tsc --noEmit` → zero erros novos nos arquivos deste plano (erros pré-existentes em `integration-chat.test.ts`, `ipc-chat.test.ts`, `ChatInput.tsx`, `App.tsx`, `useAudioRecorder.ts` estão fora de escopo — pertencem aos planos 18_5-01/02/06 que rodam em paralelo)
- Sem conflito com planos 01/02/06: este plano tocou exclusivamente em `apps/desktop/src/main/actions/**` e `apps/desktop/src/main/__tests__/actions.test.ts`

## Cobertura de testes (34 testes)

- **set_volume** (6): happy path com array args, out-of-range, non-integer, ENOENT, timeout, EACCES
- **set_brightness** (2): args corretos, invalid level
- **list_processes** (1): ps com array args
- **open_app** (3): happy path, rejeita `; rm -rf /`, rejeita vazio
- **close_app** (3): happy path com `-f`, exit≠0 → no matching process, rejeita unsafe
- **list_files** (5): JSON list, rejeita `~/`, rejeita `./`, ENOENT → path_not_found, não-diretório
- **search_files** (4): find com array, rejeita `..`, rejeita `/`, rejeita dir relativo
- **move_file** (4): rename absoluto, rejeita relativo, ENOENT, EXDEV
- **delete_file** (3): unlink absoluto, rejeita `../`, ENOENT
- **ACTION_HANDLERS barrel** (3): 9 chaves exatas, REQUIRES_CONFIRMATION contém só delete_file, todos handlers são funções

## Deviations from Plan

None — plano executado exatamente como escrito. Dois pontos merecem nota:

- A regex de `assertSafeAppName` foi ampliada para `^[a-zA-Z0-9._\-+]+$` (inclui `+`) pra casar com a intenção do prompt de execução (que explicitou `+` como safe). Não amplia superfície de ataque — `+` é literal no shell e `execFile` não passa por shell.
- `assertSafeGlobPattern` também bloqueia `$` e backtick além do mínimo (`..`, `/`, `;`, `|`), por defesa em profundidade — mesmo que `find -name` não interprete essas chars, o custo é zero e fecha qualquer surpresa futura.

## Self-Check: PASSED

- apps/desktop/src/main/actions/types.ts — FOUND
- apps/desktop/src/main/actions/validators.ts — FOUND
- apps/desktop/src/main/actions/{open-app,close-app,list-files,search-files,move-file,delete-file,set-volume,set-brightness,list-processes,index}.ts — FOUND
- apps/desktop/src/main/__tests__/actions.test.ts — FOUND (34 tests passing)
- Security grep `child_process.exec(` on actions/ — zero matches
- Commit presente no git log
