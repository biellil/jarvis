---
phase: 51-macos-tray-icon-polish
plan: "01"
subsystem: desktop/tray
tags: [macos, tray-icon, assets, sharp, image-processing]
dependency_graph:
  requires: []
  provides: [iconTemplate.png, iconTemplate@2x.png, generate-tray-template.mjs]
  affects: [apps/desktop/resources/tray, apps/desktop/scripts, apps/desktop/package.json]
tech_stack:
  added: [sharp@^0.34.5]
  patterns: [script-based asset generation, black+alpha PNG template image]
key_files:
  created:
    - apps/desktop/scripts/generate-tray-template.mjs
    - apps/desktop/resources/tray/iconTemplate.png
    - apps/desktop/resources/tray/iconTemplate@2x.png
  modified:
    - apps/desktop/package.json
    - pnpm-lock.yaml
decisions:
  - D-01: Silhueta reutilizada do icon-16x16.png existente — sem redesenho de identidade visual
  - D-02: PNGs ficam em resources/tray/ flat, sem subpasta macos/
  - D-03: Script versionado em apps/desktop/scripts/, on-demand (nao prebuild), PNGs commitados
metrics:
  duration: "168s"
  completed: "2026-05-05"
  tasks: 1
  files: 5
---

# Phase 51 Plan 01: Generate macOS Tray Template PNGs — Summary

**One-liner:** Script Node versionado com sharp que converte icon-16x16.png e icon-32x32.png para black+alpha (RGB forcado #000000, alpha preservado) e gera iconTemplate.png (16x16) e iconTemplate@2x.png (32x32) para a template image API do macOS.

## What Was Built

Script `generate-tray-template.mjs` lê os PNGs de ícone da tray existentes (`icon-16x16.png`, `icon-32x32.png`), extrai os raw pixels RGBA via `sharp().raw()`, zera os canais RGB mantendo o canal alpha intacto, e escreve os novos PNGs no mesmo diretório com o naming convention de template image do macOS (`iconTemplate.png`, `iconTemplate@2x.png`).

Os PNGs resultantes estão commitados no repositório para que nenhuma dependência de `sharp` seja necessária em CI/build. O script fica versionado para regeneração futura caso o ícone base mude.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar script generate-tray-template.mjs e gerar os PNGs template | e4f7632 | apps/desktop/scripts/generate-tray-template.mjs, apps/desktop/resources/tray/iconTemplate.png, apps/desktop/resources/tray/iconTemplate@2x.png, apps/desktop/package.json, pnpm-lock.yaml |

## Verification Results

- `iconTemplate.png`: 129 bytes (>100 — OK)
- `iconTemplate@2x.png`: 171 bytes (>100 — OK)
- Script `generate-tray-template.mjs`: existe e reproduz os PNGs sem erro
- `sharp` listada em devDependencies: `"sharp": "^0.34.5"`
- Script `generate:tray-template` adicionado em scripts do package.json
- Re-execucao idempotente: segundo run produz os mesmos arquivos sem erro

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Note:** `npm install` falhou com EBADPLATFORM em ambiente Windows devido ao `@fugood/node-whisper-darwin-x64`. Substituido por `pnpm --filter @jarvis/desktop add --save-dev sharp` — comando equivalente recomendado pelo monorepo pnpm. Nao e um desvio arquitetural.

## Known Stubs

None. Os PNGs gerados sao assets reais black+alpha prontos para uso. O Plan 02 fara o wiring em `tray.ts` para referenciar `iconTemplate.png` no macOS.

## Self-Check: PASSED

- `apps/desktop/scripts/generate-tray-template.mjs`: FOUND
- `apps/desktop/resources/tray/iconTemplate.png`: FOUND (129 bytes)
- `apps/desktop/resources/tray/iconTemplate@2x.png`: FOUND (171 bytes)
- Commit e4f7632: FOUND
