---
phase: 71
plan: "01"
subsystem: electron-main
tags:
  - electron
  - main-process
  - tray
  - env-path
  - security
dependency_graph:
  requires:
    - "Phase 70 D-01 (deferred): .env path em packaged app"
  provides:
    - "resolveEnvPath() — single source of truth, consumido por 71-02 onwards"
    - "ensureUserEnvFile() — first-run copy idempotente"
    - "Tray 'Abrir .env' item — UX zero-friction para editar config"
  affects:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/tray.ts
tech_stack:
  added: []
  patterns:
    - "dev vs packaged path resolver (app.isPackaged → userData, else monorepo root)"
    - "idempotent first-run copy com existsSync guard"
    - "POSIX chmod 0o600 para API keys (T-71-01)"
    - "shell.showItemInFolder para tray menu items"
key_files:
  created:
    - apps/desktop/src/main/envPath.ts
    - apps/desktop/src/main/firstRunEnv.ts
    - apps/desktop/src/main/__tests__/envPath.test.ts
    - apps/desktop/src/main/__tests__/firstRunEnv.test.ts
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/__tests__/tray.test.ts
decisions:
  - "D-07: resolveEnvPath() em arquivo separado (não inline em index.ts) — permite ser importado por tray.ts e firstRunEnv.ts sem duplicação"
  - "D-08: first-run copy como função separada ensureUserEnvFile() — testável isoladamente, chamada no boot antes de loadEnvFile"
  - "D-10: tray item 'Abrir .env' chama shell.showItemInFolder (não shell.openPath) — abre explorador com arquivo já selecionado"
  - "T-71-01 mitigation: chmod 0o600 só em POSIX; Windows skipped (NTFS ACL do %APPDATA% já é user-scoped)"
metrics:
  duration: "~25 min"
  completed: "2026-05-12"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 71 Plan 01: envPath Resolver + First-Run Copy + Tray Menu Summary

**One-liner:** `resolveEnvPath()` como single source of truth (dev→monorepo root, packaged→userData) com first-run copy idempotente de `.env.example` e tray item "Abrir .env" para zero-friction config.

## O Que Foi Feito

Este plan resolve o deferral de Phase 70 D-01: o `.env` em packaged app era inacessível porque o resolver usava `import.meta.dirname + '../../../../.env'` que, em packaged app, aponta para dentro do ASAR (read-only) em vez de `userData`.

### Task 1: envPath.ts + firstRunEnv.ts (TDD)

**RED → GREEN:**

- `envPath.ts`: `resolveEnvPath()` — `app.isPackaged ? app.getPath('userData')/.env : monorepo_root/.env`
- `firstRunEnv.ts`: `ensureUserEnvFile()` — copia `.env.example` → `userData/.env` se não existir, com `chmod 0o600` em POSIX
- `envPath.test.ts`: 3 testes (packaged/dev/purity) — todos passando
- `firstRunEnv.test.ts`: 6 testes (dev no-op, idempotent, copy, no-template-warn, posix-chmod, win32-no-chmod) — todos passando

### Task 2: index.ts + tray.ts + tray.test.ts

**Boot sequence atualizada em `index.ts`:**
```
resolveEnvPath()     → caminho correto dev/packaged
ensureUserEnvFile()  → cria .env no primeiro run (antes de qualquer leitura)
process.loadEnvFile(envPath) → carrega vars de ambiente
```

**Tray menu atualizado:**
- Import `shell` do electron + import `resolveEnvPath` de `./envPath.js`
- Novo item "Abrir .env" após "Configurações", antes de "Configurar Atalho"
- Click handler: `shell.showItemInFolder(resolveEnvPath())`

**5 novos testes em `tray.test.ts`** (describe Phase 71 D-10):
1. imports `shell` from electron
2. imports `resolveEnvPath` from `./envPath.js`
3. has `"Abrir .env"` label
4. click handler calls `shell.showItemInFolder(resolveEnvPath())`
5. position assertion: after "Configurações", before "Configurar Atalho"

## Decisões Feitas

| Decisão | Razão |
|---------|-------|
| `envPath.ts` em arquivo separado | tray.ts, firstRunEnv.ts e index.ts precisam importar — arquivo separado evita circular import |
| `firstRunEnv.ts` como função separada | Testável com mocks de `node:fs`; chamada no boot antes do loadEnvFile |
| `shell.showItemInFolder` (não `shell.openPath`) | Abre o explorador de arquivos com o `.env` já selecionado — melhor UX |
| `chmod 0o600` só em POSIX | Windows NTFS: `%APPDATA%\JARVIS\` criado pelo Electron já é user-scoped por ACL |

## Threats Addressed

| Threat | Mitigação |
|--------|-----------|
| T-71-01: `.env` com API keys legível por outros usuários do OS | `firstRunEnv.ts`: `fs.chmodSync(envPath, 0o600)` após cópia em POSIX |
| T-71-07: tray "Abrir .env" abrindo arquivo arbitrário | `shell.showItemInFolder(resolveEnvPath())` — path é função computada, sem input do usuário |

## Integração Downstream

- **Plan 71-02** (electron-builder.yml): vai adicionar `.env.example` via `extraResources` → `firstRunEnv.ts` lê de `process.resourcesPath/.env.example`. Os dois planos se conectam: 71-01 consome, 71-02 provisiona.
- **migrateLlmConfigToEnv** (Phase 70): quando reimplementada, deve usar `resolveEnvPath()` importado de `envPath.ts` — sem duplicação de lógica.

## Testes Pré-existentes com Falha (Out of Scope)

`tray.platform.test.ts` tem 2 falhas pré-existentes (buscam `label: 'Quit'` mas o tray usa `label: 'Sair'` em pt-BR desde Phase 41). Não causadas por este plan.

## Desvios do Plano

**Sem desvios** — o plan executou exatamente como especificado.

Nota: o `index.ts` nesta worktree não tinha `runLlmConfigMigration` (pasta `migrations/` foi removida em phases anteriores incorporadas ao estado base). A sequência foi adaptada para: `resolveEnvPath → ensureUserEnvFile → process.loadEnvFile` sem o bloco de migration (já não existe).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `apps/desktop/src/main/envPath.ts` | FOUND |
| `apps/desktop/src/main/firstRunEnv.ts` | FOUND |
| `apps/desktop/src/main/__tests__/envPath.test.ts` | FOUND |
| `apps/desktop/src/main/__tests__/firstRunEnv.test.ts` | FOUND |
| `.planning/phases/71-multi-platform-distribution/71-01-SUMMARY.md` | FOUND |
| Commit `42181e7` (Task 1: envPath + firstRunEnv TDD) | FOUND |
| Commit `e5e7961` (Task 2: index.ts + tray.ts + tray.test.ts) | FOUND |
