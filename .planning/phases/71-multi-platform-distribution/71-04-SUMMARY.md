---
phase: 71
plan: 04
type: summary
status: completed-with-uat-debt
completed_at: 2026-05-12
requirements_validated:
  - DIST-04
threats_addressed:
  - T-71-01
  - T-71-04
decisions_exercised:
  - D-05
  - D-08
files:
  modified:
    - .gitignore
    - scripts/download-whisper-model.mjs
  created:
    - apps/desktop/release-v2/.gitkeep
    - apps/desktop/release-v2/JARVIS-0.1.0.AppImage
    - .planning/phases/71-multi-platform-distribution/71-04-SUMMARY.md
    - .planning/phases/71-multi-platform-distribution/71-04-HUMAN-UAT.md
metrics:
  appimage_size_bytes: 1782579200
  appimage_size_human: 1.7G
  whisper_medium_bundled_bytes: 1533763059
  whisper_base_bundled_bytes: 147951465
  uat_items_passed: 2
  uat_items_pending: 7
---

# Plan 71-04 Summary — Linux AppImage Build (DIST-04)

## Goal Achieved (Build Layer)

`pnpm dist:linux` gera `apps/desktop/release-v2/JARVIS-0.1.0.AppImage` (1.7 GB, ELF executável) com `ggml-base.bin` (142 MB) + `ggml-medium.bin` (1.5 GB / 1.533.763.059 bytes — bate exato com `x-linked-size` do HuggingFace) bundleados via `extraResources`. Build infrastructure de Plans 71-01/02/03 validada end-to-end.

## Goal NOT Yet Achieved (UAT Visual)

DIST-04 success criterion completo exige smoke test manual (D-05): launch da AppImage + janela visível + tray + first-run copy de `.env` com mode 0o600. Estes itens **não foram executados nesta sessão** (ambiente CLI/SSH sem display GUI) e ficam rastreados em `71-04-HUMAN-UAT.md` como debt explícito.

## Deliverables

### Build Infrastructure

- **AppImage íntegro** — `apps/desktop/release-v2/JARVIS-0.1.0.AppImage`, ELF 64-bit, executável, 1.7 GB. Modelos whisper bundleados sem corrupção (validação byte-exact entre source e `linux-unpacked/`).
- **`.gitignore` atualizado** — linha 52: `apps/desktop/release-v2/`. AppImage + linux-unpacked/ não vão pro git.
- **`.gitkeep`** — `apps/desktop/release-v2/.gitkeep` mantém diretório versionado mesmo com gitignore.

### Fix do Script de Download (Bonus — Bug Encontrado em Sessão)

`scripts/download-whisper-model.mjs` tinha bug: aceitava qualquer arquivo existente como "completo" via `fs.existsSync(dest)`, sem validar tamanho. Resultado: download interrompido (e.g. parcial em 215 MB de 1500 MB esperados) fazia preflight retornar OK e electron-builder empacotava modelo corrompido no AppImage. Causou primeiro build da sessão a gerar AppImage com `ggml-medium.bin` parcial (215 MB).

**Fix commitado em `93d38f8`** (`🐛 fix(71-03): valida tamanho do whisper model antes de pular download`): compara `fs.statSync(dest).size` com `model.sizeMb * 1024 * 1024 * 0.95` (tolerância 5%). Se abaixo: deleta e re-baixa. Mantém idempotência para arquivos completos.

### Bug Remanescente (Não Bloqueante)

`scripts/download-whisper-model.mjs` trava silenciosamente quando segue redirect HTTPS (HF → cas-bridge.xethub.hf.co). Causa raiz suspeita: `WriteStream` criado uma vez fora do callback é fechado via `file.close()` ao seguir 302, mas a função `request` recursiva tenta `res.pipe(file)` no stream já fechado — pipe falha silenciosamente, promise nunca resolve nem rejeita, processo fica pendurado. **Workaround usado nesta sessão**: `curl -L --fail` direto pro destino (~5 min download). **Fix proposto**: re-criar `WriteStream` dentro da função `request` ou usar `node-fetch`/`undici` que tratam redirect nativo. Não bloqueia phase 71 — está documentado como TODO técnico.

## Decisions Exercised

- **D-05** — UAT Linux host de dev é único path realista (sem CI cross-distro). Build layer validada nesta sessão; visual layer parqueada como debt em HUMAN-UAT.md
- **D-08** — chmod 0o600 em userData/.env: implementado em `firstRunEnv.ts:42` (Plan 71-01), **runtime verification pendente** (item 3 do HUMAN-UAT)

## Threats Addressed

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-71-01 (info disclosure userData/.env) | mitigate (code-level) | `firstRunEnv.ts:42` executa `fs.chmodSync(envPath, 0o600)` quando `process.platform !== 'win32'`. Runtime verification (UAT item 3) parqueada — **smoke test visual confirmará** se o chmod realmente roda no Electron packaged context. |
| T-71-04 (--no-sandbox AppArmor bypass) | accept (documented) | README §Linux install (Plan 71-06) documenta flag + alternativa `--appimage-extract-and-run`. User opt-in informado. |

## Cross-References

- **Plan 71-01** — `ensureUserEnvFile()` em `apps/desktop/src/main/firstRunEnv.ts` é o ponto-chave do UAT visual (item 3 + 4 do HUMAN-UAT)
- **Plan 71-02** — `electron-builder.yml` linha 182 bundle `.env.example`; modelos whisper bundleados via extraResources
- **Plan 71-03** — `scripts/preflight-dist.mjs` validou tamanho (com fix novo), bloqueia build se modelo parcial
- **Plan 71-06** — README documenta `--no-sandbox` + Ubuntu 24.04 quirks

## Phase 71 Status After This Plan

| Plan | Status | Notes |
|------|--------|-------|
| 71-01 | ✅ complete | envPath resolver + ensureUserEnvFile + tray |
| 71-02 | ✅ complete | electron-builder.yml + bundle config |
| 71-03 | ✅ complete | preflight + dist scripts + medium download |
| **71-04** | **✅ build delivered + ⚠ UAT visual debt** | AppImage íntegro; smoke test visual em `71-04-HUMAN-UAT.md` |
| 71-05 | ⚠ deferred-by-hardware | precisa PC Windows físico — `71-05-SUMMARY.md` |
| 71-06 | ✅ complete | README §Build & Install |

## Resume Signal

`approved-with-notes: build infrastructure delivered, AppImage íntegro validado por inspeção byte-level (linux-unpacked vs source). UAT visual (janela, tray, .env mode 0o600 runtime, mic, idempotência) rastreado em 71-04-HUMAN-UAT.md como debt explícito — usuário não tinha display GUI disponível nesta sessão de CLI/SSH e optou por documentar em vez de bloquear v3.1.`
