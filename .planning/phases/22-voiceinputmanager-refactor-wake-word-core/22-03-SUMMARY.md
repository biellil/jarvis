---
phase: 22-voiceinputmanager-refactor-wake-word-core
plan: 03
subsystem: wake-word-assets
tags: [assets, download, licensing, env-vars, ci, wake-word, envDir]
requirements: [WAKE-09]
status: complete
completed: 2026-04-11
duration_minutes: 15

dependency_graph:
  requires: [22-01]
  provides:
    - apps/desktop/resources/wakeword-models/ (dir estruturado para modelos ONNX)
    - scripts/download-wakeword-models.mjs (download idempotente com SHA-256)
    - scripts/verify-no-banned-wake-word-libs.mjs (CI grep-ban local)
    - apps/desktop/.env.example (defaults VITE_WAKE_WORD_* travados)
    - electron.vite.config.ts envDir fix (Option A — .env de apps/desktop/)
    - .github/workflows/ci-lockfile-ban.yml (CI workflow)
  affects: [apps/desktop/package.json, .gitignore]

tech_stack:
  added:
    - Node.js nativo (node:https, node:crypto, node:fs, node:path, node:url) — zero deps externas
  patterns:
    - Download idempotente com SHA-256 checksum verification
    - Primary + fallback URL strategy (HuggingFace → GitHub releases v0.5.1)
    - Soft mode para postinstall (exit 0 on failure — offline-safe)
    - CI grep-ban via Node script (cross-platform, sem dependência de shell)

key_files:
  created:
    - apps/desktop/resources/wakeword-models/.gitkeep
    - apps/desktop/resources/wakeword-models/LICENSE-models.txt
    - scripts/download-wakeword-models.mjs
    - scripts/download-wakeword-models.sh
    - scripts/verify-no-banned-wake-word-libs.mjs
    - apps/desktop/.env.example
    - .github/workflows/ci-lockfile-ban.yml
  modified:
    - .gitignore
    - apps/desktop/electron.vite.config.ts
    - apps/desktop/package.json
    - .planning/phases/22-voiceinputmanager-refactor-wake-word-core/deferred-items.md

decisions:
  - key: envDir-option-A
    summary: "Vite envDir fixado em path.resolve(__dirname) no renderer block — .env files residem em apps/desktop/ e não em src/renderer/"
    rationale: "Mantém convenção Electron de .env na raiz do app; Plan 22-04 consome vars via import.meta.env.VITE_WAKE_WORD_*"
  - key: github-fallback-as-primary
    summary: "URL primária HuggingFace retorna 404 — fallback GitHub releases v0.5.1 funciona e foi efetivamente usado no download"
    rationale: "Script mantém HF como primary para quando o path for restaurado; fallback garante funcionalidade imediata"
  - key: soft-mode-postinstall
    summary: "Postinstall sempre exit 0 mesmo em falha de download (flag implícita SOFT)"
    rationale: "pnpm install não deve quebrar offline; degradação graceful para PTT-only se modelos ausentes"

metrics:
  tasks_completed: 3
  commits: 3
  files_created: 7
  files_modified: 4
  deviations: 0
---

# Phase 22 Plan 03: Wake Word Assets + CI Ban + envDir Fix Summary

Infraestrutura de assets do wake word criada: diretório `apps/desktop/resources/wakeword-models/` com `.gitkeep` e `LICENSE-models.txt` (CC BY-NC-SA 4.0), download script idempotente Node-nativo (`scripts/download-wakeword-models.mjs`) com verificação SHA-256 dos 4 modelos ONNX (1.1–1.8 MB cada, ~5.5 MB total), `.gitignore` bloqueando `*.onnx`, `apps/desktop/.env.example` com as 4 env vars `VITE_WAKE_WORD_*` nos defaults travados do CONTEXT.md, fix do `envDir` no `electron.vite.config.ts` (Option A — renderer block agora lê `.env*` de `apps/desktop/`), postinstall hook wireado no `apps/desktop/package.json`, e CI grep-ban (`scripts/verify-no-banned-wake-word-libs.mjs` + `.github/workflows/ci-lockfile-ban.yml`) proibindo porcupine/picovoice/bumblebee/snowboy/vosk no lockfile.

## Tasks Executadas

### Task 1 — resources dir + .gitignore + env.example + envDir fix
**Commit:** `67577a7` — `📝 chore(22-03): resources/wakeword-models dir + .gitignore + env.example WAKE + envDir fix`

**Arquivos criados:**
- `apps/desktop/resources/wakeword-models/.gitkeep` (vazio)
- `apps/desktop/resources/wakeword-models/LICENSE-models.txt` (CC BY-NC-SA 4.0 notice + rationale)
- `apps/desktop/.env.example` (4 linhas VITE_WAKE_WORD_*)

**Arquivos modificados:**
- `.gitignore` — adicionado bloco ignorando `*.onnx` no dir, com exceções para `.gitkeep` e `LICENSE-models.txt`
- `apps/desktop/electron.vite.config.ts` — `envDir: path.resolve(__dirname)` no renderer block (Option A locked)

**Verificação:**
- `electron-vite build` roda verde após o fix do envDir (25 modules main, 2 preload, 46 renderer — sem erros)
- `apps/desktop/src/renderer/.env.example` NÃO existe (não foi movido; envDir redireciona para apps/desktop/)

### Task 2 — download script + postinstall hook + smoke test
**Commit:** `ec3dcd2` — `✨ feat(22-03): script idempotente de download dos 4 modelos wake word`

**Arquivos criados:**
- `scripts/download-wakeword-models.mjs` (176 linhas, zero deps, Node nativo)
- `scripts/download-wakeword-models.sh` (thin bash wrapper)

**Estrutura do script:**
- 4 modelos em `EXPECTED_MODELS` com `url` (HuggingFace), `fallbackUrl` (GitHub v0.5.1) e `sha256`
- Flags `--check`, `--force`, `--verbose`
- Soft mode default: falha de rede → exit 0 com warning
- Redirect follow (até 5 hops)
- SHA-256 validado contra expectativa; mismatch dispara redownload

**Smoke test executado:**
- `node scripts/download-wakeword-models.mjs --check` — exit 0, 4 MISSING reportados (estado inicial)
- `node scripts/download-wakeword-models.mjs --verbose` — primary HuggingFace retornou 404 (path mudou), fallback GitHub v0.5.1 baixou com sucesso:
  - `melspectrogram.onnx` — 1 087 958 bytes — `ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f`
  - `embedding_model.onnx` — 1 326 578 bytes — `70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f`
  - `silero_vad.onnx` — 1 807 522 bytes — `a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28`
  - `hey_jarvis_v0.1.onnx` — 1 271 370 bytes — `94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb`
- Checksums inline registrados no `EXPECTED_MODELS` array; nova execução reporta `SKIP (checksum OK)` para todos
- `grep -c "sha256: '[a-f0-9]\{64\}'" scripts/download-wakeword-models.mjs` = **4**

**Postinstall:**
- Field `scripts.postinstall` em `apps/desktop/package.json`: `"node ../../scripts/download-wakeword-models.mjs"`
- (Este campo aparece no HEAD via commit paralelo do Plan 22-02, mas o conteúdo é exatamente o especificado pelo Plan 22-03 — a edição do renderer foi feita nesta execução.)

### Task 3 — CI grep-ban workflow + verifier local
**Commit:** `e054c3e` — `🤖 ci(22-03): grep-ban porcupine/picovoice/bumblebee/snowboy/vosk no pnpm-lock.yaml`

**Arquivos criados:**
- `scripts/verify-no-banned-wake-word-libs.mjs` (43 linhas, Node nativo)
- `.github/workflows/ci-lockfile-ban.yml` (CI workflow)

**Libs banidas:** `@picovoice/porcupine`, `porcupine-node`, `bumblebee-hotword`, `snowboy`, `vosk`

**Script registrado:**
- `apps/desktop/package.json` → `scripts["verify:wake-word-bans"]: "node ../../scripts/verify-no-banned-wake-word-libs.mjs"`

**Execução local:**
- `node scripts/verify-no-banned-wake-word-libs.mjs` → `[ban-check] ✅ no banned wake word libs in pnpm-lock.yaml` — exit 0
- `pnpm --filter @jarvis/desktop run verify:wake-word-bans` → exit 0

**CI workflow:**
- Triggers: PR tocando `pnpm-lock.yaml`/`apps/desktop/package.json`/o próprio verifier + push em main/master
- Runner: `ubuntu-latest` com Node 22
- Step único: `node scripts/verify-no-banned-wake-word-libs.mjs`

## Confirmação do envDir fix (Option A locked)

```ts
renderer: {
  root: 'src/renderer',
  envDir: path.resolve(__dirname), // Phase 22 Plan 03 — .env* em apps/desktop/
  plugins: [react(), tailwindcss()],
  ...
}
```

- `grep "envDir: path.resolve(__dirname)" apps/desktop/electron.vite.config.ts` → **1 linha**
- `test ! -f apps/desktop/src/renderer/.env.example && echo OK` → **OK** (env NÃO foi movido para dentro do renderer)
- Build smoke test passou: 25/2/46 modules (main/preload/renderer), zero erros

## Status dos 4 modelos (download executado)

| Arquivo | Tamanho | SHA-256 | Origem |
|---------|--------:|---------|--------|
| `melspectrogram.onnx` | 1 087 958 B | `ba2b0e0f...76f` | GitHub v0.5.1 (fallback) |
| `embedding_model.onnx` | 1 326 578 B | `70d16429...c1f` | GitHub v0.5.1 (fallback) |
| `silero_vad.onnx` | 1 807 522 B | `a35ebf52...f28` | GitHub v0.5.1 (fallback) |
| `hey_jarvis_v0.1.onnx` | 1 271 370 B | `94a13cfe...2cb` | GitHub v0.5.1 (fallback) |

Nota: a URL primária do HuggingFace (`davidscripka/openwakeword/resolve/main/*.onnx`) retornou HTTP 404 — o repositório provavelmente foi restruturado. O script detecta falha e tenta o `fallbackUrl` (GitHub releases v0.5.1), que retornou HTTP 200 + payload válido. Após primeira execução os checksums foram registrados inline no script, então toda execução futura valida offline sem repetir download.

## Resultado do verify-no-banned-wake-word-libs.mjs

```
[ban-check] ✅ no banned wake word libs in pnpm-lock.yaml
```

Exit code **0** contra o estado atual do `pnpm-lock.yaml`. Plan 22-02 só adicionou `onnxruntime-web@1.24.3` (permitido), nenhuma das libs banidas.

## Deviations from Plan

**Nenhuma deviation significativa.** O plano executou fiel ao especificado. Duas observações menores:

1. **URL primary HuggingFace está 404** (não é deviation — é o que o `fallbackUrl` foi desenhado para cobrir). O script seguiu o fluxo esperado: tentou primary → falhou → tentou fallback → sucesso. Registrado neste SUMMARY para futura investigação do path correto no HuggingFace (se necessário). Os modelos da v0.5.1 são os mesmos que o openwakeword documenta como estáveis.

2. **Plan 22-02 em paralelo já tinha colocado `postinstall` em `apps/desktop/package.json`** (commit `cf985cc` durante minha execução). A linha que eu editei acabou absorvida por aquele commit. O conteúdo é exatamente o especificado pelo Plan 22-03 — zero conflito real. Adicionei posteriormente `verify:wake-word-bans` ao mesmo scripts field (Task 3), committed em `e054c3e`.

## Deferred Issues

Nenhuma issue nova. 4 test files já falhavam no baseline antes do Plan 22-03 — documentados em `deferred-items.md`:

- `integration-chat.test.ts` (preexistente)
- `tray.test.ts` (preexistente)
- `Orb.test.tsx` (preexistente, Phase 23 candidato)
- `WakeWordEngine.test.ts` (Plan 22-02 TDD Wave 0 — failing esperado, verde em Plan 22-04)

**Plan 22-03 introduziu zero regressões.**

## Próximos passos

- **Plan 22-04:** Integração live do `useWakeWord` hook + packaging (`extraResources` do electron-builder, runtime path resolver via `app.isPackaged`, IPC `wakeWord:toggle`, TTS player wrap, OrbContext gate). Consome as vars `import.meta.env.VITE_WAKE_WORD_*` que dependem do envDir fix aplicado aqui.

## Self-Check: PASSED

Arquivos criados verificados:
- `apps/desktop/resources/wakeword-models/.gitkeep` — FOUND
- `apps/desktop/resources/wakeword-models/LICENSE-models.txt` — FOUND
- `scripts/download-wakeword-models.mjs` — FOUND
- `scripts/download-wakeword-models.sh` — FOUND
- `scripts/verify-no-banned-wake-word-libs.mjs` — FOUND
- `apps/desktop/.env.example` — FOUND
- `.github/workflows/ci-lockfile-ban.yml` — FOUND

Commits verificados em `git log`:
- `67577a7` (Task 1) — FOUND
- `ec3dcd2` (Task 2) — FOUND
- `e054c3e` (Task 3) — FOUND

envDir fix verificado:
- `grep "envDir: path.resolve(__dirname)" apps/desktop/electron.vite.config.ts` → 1 linha — FOUND

Checksums verificados:
- `grep -c "sha256: '[a-f0-9]\{64\}'" scripts/download-wakeword-models.mjs` → 4 — CORRECT

Ban-check verificado:
- `node scripts/verify-no-banned-wake-word-libs.mjs` → exit 0 — PASSED
