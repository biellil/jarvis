---
phase: 71
plan: "03"
subsystem: build-tooling
tags:
  - scripts
  - build
  - preflight
  - tooling
  - security
dependency_graph:
  requires:
    - 71-02 (electron-builder config — build:dist:* scripts in desktop/package.json)
  provides:
    - pnpm dist / dist:win / dist:mac / dist:linux root-level convenience scripts
    - preflight-dist.mjs validator (D-17)
    - download-whisper-model.mjs extended with 'medium' model (D-13)
  affects:
    - 71-04 (Linux AppImage build — uses pnpm dist:linux)
    - 71-05 (Windows NSIS build — uses pnpm dist:win)
tech_stack:
  added: []
  patterns:
    - Node ESM script with shebang for CLI tooling
    - spawnSync child_process for sequential validation checks
    - Fast-fail ordering: platform gate before expensive model downloads
    - Regex secret pattern detection for supply-chain safety
key_files:
  created:
    - scripts/preflight-dist.mjs
    - scripts/__tests__/preflight-dist.test.mjs
  modified:
    - scripts/download-whisper-model.mjs
    - package.json
decisions:
  - "Platform gate (mac/darwin check) moved to position 2, before .env.example and whisper checks — fast-fail avoids triggering 1.5GB model download on incompatible host"
  - "download-whisper-model.mjs medium entry uses permanent HuggingFace URL (not AWS-signed) — no signed URL exists for medium model"
  - "T-71-02 uses 5 SECRET_PATTERNS regexes matching sk-*, sk-ant-*, AIza*, ghp_*, xoxb-* — production build gate against accidental secret commit"
  - "Wine test uses process.execPath dir + /usr/bin:/bin as PATH — ensures node is reachable while wine is excluded; avoids ENOENT spawn failure"
metrics:
  duration: "~12 min"
  completed_date: "2026-05-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 71 Plan 03: Preflight Build Script + Root Dist Scripts Summary

**One-liner:** Preflight validator (5 checks + T-71-02 secret detection) + 4 root dist scripts + download-whisper-model extended with 'medium' model entry.

## What Was Built

### Task 1: download-whisper-model.mjs + root package.json

- `scripts/download-whisper-model.mjs`: novo entry `medium` inserido entre `base` e `large` com URL permanente HuggingFace (`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin`, 1.5 GB). AWS-signed URLs para tiny/base/large foram mantidos sem alteração (fora de escopo neste plano).
- `package.json` (root): 4 scripts adicionados — `dist`, `dist:win`, `dist:mac`, `dist:linux` — cada um invoca `node scripts/preflight-dist.mjs <target>` antes de delegar ao workspace filter `@jarvis/desktop`.

### Task 2: preflight-dist.mjs + test suite (TDD)

`scripts/preflight-dist.mjs` implementa 6 verificações sequenciais:

1. **Target whitelist** — aceita `win | mac | linux | auto`; `auto` mapeia `process.platform` para target. Exit 1 com "target must be one of" se inválido.
2. **Platform gate** — `mac` em host não-darwin → exit 1 imediato com mensagem de macOS 12+. Posicionado antes das verificações de modelo para evitar download desnecessário de 1.5 GB.
3. **.env.example placeholder-only (T-71-02)** — verifica existência + aplica 5 regex patterns (`sk-*`, `sk-ant-*`, `AIza*`, `ghp_*`, `xoxb-*`). Exit 1 com mensagem actionable se detectado.
4. **Whisper models bundle** — verifica `ggml-base.bin` e `ggml-medium.bin` em `apps/desktop/resources/models/whisper/`. Se ausente, invoca `scripts/download-whisper-model.mjs --model {id}` via `spawnSync`.
5. **Wine gate (win cross-build)** — `target=win` em host não-Windows: verifica `wine --version` (obrigatório) e `mono --version` (warning). Mensagem inclui `sudo apt install wine wine32 wine64`.
6. **Linux smoke** — sem deps adicionais, log confirmativo.

**Test suite** (`scripts/__tests__/preflight-dist.test.mjs`, 7 testes, todos passando):
- invalid target → exit 1 + "target must be one of"
- mac em Linux → exit 1 + "macOS DMG"
- win sem wine (PATH sem wine) → exit 1
- auto → stdout com "auto-detected target="
- .env.example com sk-AAAA... → exit 1 + "secret"
- clean linux + models presentes → exit 0 + "preflight OK" (skip se ggml-medium ausente)
- sem args → exit 1 + "target must be one of"

## Decisions Made

| # | Decisão | Razão |
|---|---------|-------|
| 1 | Platform gate em posição 2 (antes do whisper) | Fast-fail — não faz sentido tentar download 1.5 GB se plataforma já inviabiliza o build |
| 2 | URL permanente HuggingFace para medium | AWS-signed URL expirada não existe para medium; HuggingFace canonical URL é mais confiável |
| 3 | 5 SECRET_PATTERNS abrangentes | Cobertura dos principais providers usados no projeto (OpenAI, Anthropic, Google, GitHub, Slack) |
| 4 | process.execPath dir no PATH do teste wine | Garante que node seja encontrado pelo spawnSync enquanto wine é excluído do PATH |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Platform gate reposicionada**
- **Found during:** Task 2 verification
- **Issue:** Ordem original colocava .env.example + whisper checks antes do mac gate, causando tentativa de download de 1.5 GB em hosts Linux ao rodar `pnpm dist:mac`
- **Fix:** Mac platform gate movida para posição 2 (logo após target validation), antes de qualquer operação de I/O
- **Files modified:** scripts/preflight-dist.mjs
- **Commit:** b46d5b8

**2. [Rule 1 - Bug] Teste wine com PATH mínimo causava ENOENT**
- **Found during:** Task 2 test execution
- **Issue:** PATH `/usr/bin:/bin` não incluía diretório do node (em `/root/.nvm/`), causando `spawnSync ENOENT` em vez de exit code 1
- **Fix:** PATH do teste inclui `path.dirname(process.execPath)` para garantir que node seja encontrado enquanto wine é excluído
- **Files modified:** scripts/__tests__/preflight-dist.test.mjs
- **Commit:** b46d5b8

## Known Stubs

Nenhum. O preflight-dist.mjs implementa lógica funcional completa para todos os 5 checks descritos em D-17.

## Threat Flags

Nenhum novo surface além do que o `<threat_model>` do plano já registrou (T-71-02 mitigado, T-71-05 e T-71-10 documentados).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| scripts/preflight-dist.mjs exists | FOUND |
| scripts/__tests__/preflight-dist.test.mjs exists | FOUND |
| 71-03-SUMMARY.md exists | FOUND |
| commit b46d5b8 exists | FOUND |
| commit b12cb40 exists | FOUND |
| SECRET_PATTERNS in preflight-dist.mjs | OK |
| medium entry in download-whisper-model.mjs | OK |
| 4 dist scripts in package.json | OK |
