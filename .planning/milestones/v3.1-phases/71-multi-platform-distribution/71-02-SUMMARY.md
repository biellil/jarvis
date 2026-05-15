---
phase: 71
plan: "02"
subsystem: packaging
tags:
  - electron-builder
  - packaging
  - config
  - wave-0-validator
dependency_graph:
  requires:
    - "71-01 (envPath resolver — .env.example bundle usada pelo first-run copy)"
  provides:
    - "electron-builder.yml multi-target config (DIST-01..04)"
    - "Wave 0 validator script (scripts/validate-electron-builder.mjs)"
    - "Validator test suite (7 tests)"
  affects:
    - "71-03 (preflight-dist.mjs pode re-executar este validator)"
    - "71-04 (Linux AppImage build silently depends on this yml)"
    - "71-05 (Windows NSIS+portable build depends on this yml)"
tech_stack:
  added:
    - "yaml@2.9.0 (devDependency raiz — usado pelo validator script)"
  patterns:
    - "extraResources pattern (15º bloco: .env.example bundle)"
    - "Wave 0 validator pattern: spawnSync fixtures + real-yml smoke test"
key_files:
  created:
    - "scripts/validate-electron-builder.mjs"
    - "scripts/__tests__/validate-electron-builder.test.mjs"
    - "scripts/vitest.config.mjs"
  modified:
    - "apps/desktop/electron-builder.yml"
    - "package.json"
    - "pnpm-lock.yaml"
decisions:
  - "D-06 (targets corrigidos): mac usa arch: [universal] em vez de arch: [arm64, x64] — produce 1 DMG fat universal, não 2 separados (Pitfall 1 do research)"
  - "D-09 (.env.example bundle): extraResources entry adicionado para first-run copy consumir em Phase 71-01"
  - "D-11 + D-12 (whisper filter): apenas ggml-base.bin + ggml-medium.bin bundled; tiny/large-v3 removidos — pós-Phase 68 UI model list"
  - "Pitfall 6 (sharp cross-platform): darwin-arm64, darwin-x64, linux-x64 prebuilds adicionados — sem eles DMG/AppImage crash no require('sharp')"
  - "yaml@2.9.0 adicionado como devDependency raiz (necessário para validator script que roda fora do workspace dos apps)"
  - "vitest.config.mjs criado em scripts/ para descobrir .mjs test files (desktop vitest config só inclui src/**/__tests__/*.ts)"
metrics:
  duration: "~25 minutos"
  completed_date: "2026-05-12"
  tasks_completed: 2
  files_changed: 6
  tests_added: 7
---

# Phase 71 Plan 02: electron-builder.yml Multi-Target Config Summary

**One-liner:** electron-builder.yml atualizado com 4 edits cirúrgicos (win NSIS+portable, mac DMG universal, linux AppImage+Utility, .env.example bundle, sharp cross-platform prebuilds, whisper filter base+medium) + Wave 0 validator script com 7 testes.

## What Was Built

### Task 1: electron-builder.yml — 4 edits aplicados

**Edit 1 — Whisper filter (D-11, D-12):**
Substituído o bloco de filtro whisper: removidos `ggml-tiny.bin` e `ggml-large-v3.bin`, adicionado `ggml-medium.bin`. Resultado: apenas `base + medium` bundled (~1.7 GB total). Alinha com a UI de Settings pós-Phase 68 que removeu `large-v3` e substituiu por `large-v3-turbo` (on-demand).

**Edit 2 — .env.example bundle (D-09):**
Adicionado entry `{ from: "../../.env.example", to: ".env.example" }` imediatamente após o bloco whisper. Runtime path: `path.join(process.resourcesPath, '.env.example')`. Consumido pelo first-run copy de Phase 71-01.

**Edit 3 — Sharp cross-platform prebuilds (Pitfall 6):**
Inseridos 3 novos blocos após `@img/sharp-win32-x64`:
- `@img/sharp-darwin-arm64` — Apple Silicon, necessário para DMG universal
- `@img/sharp-darwin-x64` — Intel Mac, necessário para DMG universal  
- `@img/sharp-linux-x64` — Linux x64, necessário para AppImage

Sem estes, o build gera artefatos que crasham ao `require('sharp')` no vision pipeline.

**Edit 4 — Targets (D-06 com correção de research):**

| Target | Antes | Depois |
|--------|-------|--------|
| `win:` | `target: nsis` | `target: [nsis, portable]` |
| `mac:` | `target: dmg` | `target: [{ target: dmg, arch: [universal] }]` |
| `linux:` | `target: AppImage` | `target: AppImage` + `category: Utility` |

**Correção crítica (Pitfall 1):** O CONTEXT.md D-06 original especificava `arch: [arm64, x64]` — isso geraria **2 DMGs separados**. A correção aplicada usa `arch: [universal]` com `mergeASARs: true` (default), que gera **1 DMG fat universal** conforme critério DIST-03.

### Task 2: Wave 0 Validator + Testes (TDD)

**`scripts/validate-electron-builder.mjs`** — script Node ESM executável (`chmod +x`):
- Verifica 6 invariantes do `electron-builder.yml`
- Aceita path como `process.argv[2]` ou usa default `apps/desktop/electron-builder.yml`
- Exit 0 = all checks pass; exit 1 = lista de falhas com mensagens acionáveis

**`scripts/__tests__/validate-electron-builder.test.mjs`** — 7 testes vitest ESM:
- Test 1: yml válido → exit 0 com "OK"
- Test 2: `portable` ausente → exit 1 com "portable"
- Test 3: `universal` ausente → exit 1 com "universal"
- Test 4: `.env.example` bundle ausente → exit 1 com ".env.example"
- Test 5: `ggml-tiny.bin` no filter → exit 1 com "ggml-tiny"
- Test 6: `sharp-linux-x64` ausente → exit 1 com "sharp-linux-x64"
- Test 7: smoke contra yml real pós-Task-1 → exit 0

**`scripts/vitest.config.mjs`** — config vitest para descobrir `.mjs` em `scripts/__tests__/`.

**Dependency adicionada:** `yaml@2.9.0` como devDependency raiz (o pacote não estava instalado — electron-builder o usa internamente mas não expõe via hoisting).

## Decisions Made

1. **mac.target arch: [universal]** em vez de `arch: [arm64, x64]` — única forma de gerar 1 DMG universal. A sintaxe alternativa produziria 2 artefatos separados, violando DIST-03.

2. **yaml@2.9.0 devDependency raiz** — o validator precisa de `import yaml from 'yaml'` e o pacote não estava disponível em `node_modules/` raiz (electron-builder o usa apenas em seu próprio workspace). Adicionado explicitamente.

3. **`scripts/vitest.config.mjs` separado** — o vitest do desktop só inclui `src/**/__tests__/*.ts`. Criar config próprio em `scripts/` é mais limpo do que copiar testes `.mjs` para dentro de `apps/desktop/src/`.

4. **Validator mensagem `ggml-tiny.bin should not be in filter (post-D-12)`** — incluída no texto do erro para que o CI e reviewer saibam o contexto histórico sem procurar no CONTEXT.md.

## Deviations from Plan

### Auto-added: yaml devDependency (Rule 2 — missing critical functionality)

**Found during:** Task 2 setup
**Issue:** `import yaml from 'yaml'` falhava com `ERR_MODULE_NOT_FOUND` — o pacote não estava em `node_modules/` raiz mesmo sendo transitive dep do electron-builder (pnpm hoist isolation).
**Fix:** `yaml@2.9.0` adicionado como `devDependencies` em `package.json` raiz + `pnpm install`.
**Files modified:** `package.json`, `pnpm-lock.yaml`
**Commit:** `44369d6`

### Auto-added: scripts/vitest.config.mjs (Rule 3 — blocking issue)

**Found during:** Task 2 verification
**Issue:** `pnpm -F @jarvis/desktop test` não descobria `.mjs` em `scripts/__tests__/` — o vitest config do desktop usa `include: ['src/**/__tests__/**/*.test.ts']`.
**Fix:** Criado `scripts/vitest.config.mjs` minimal para executar os testes `.mjs` corretamente.
**Files modified:** `scripts/vitest.config.mjs` (novo)
**Commit:** `506f232`

## Threats Addressed

| Threat | Disposition | Status |
|--------|-------------|--------|
| T-71-04: path traversal em extraResources `from` | accept | Build host é trusted; `from` paths definidos estaticamente no yml pelo developer |
| T-71-08: build falha se sharp prebuilds ausentes | mitigate | Validator (este plan) captura entradas ausentes no yml; 71-03 preflight verificará presença física em `node_modules/` |
| T-71-02: `.env.example` com API keys reais | defer | Bundle entry adicionada neste plan; validação de conteúdo fica com 71-03 preflight-dist.mjs |

## Known Stubs

Nenhum stub identificado. O yml é configuração pura — não há rendering de dados para UI. O validator é completo e testado.

## Self-Check: PASSED

Verificações executadas após criação do SUMMARY:
- `apps/desktop/electron-builder.yml` — FOUND, YAML parse OK, todas as 6 assertions do validator passam
- `scripts/validate-electron-builder.mjs` — FOUND, executável, exit 0 contra yml real
- `scripts/__tests__/validate-electron-builder.test.mjs` — FOUND, 7 testes passam
- Commit `44369d6` — FOUND (Task 1)
- Commit `506f232` — FOUND (Task 2)
