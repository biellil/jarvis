---
phase: 71
plan: 04
type: deferred
status: deferred
deferred_at: 2026-05-12
deferred_reason: User opted to skip Wave 2 (Linux smoke test) during /gsd-execute-phase 71 — checkpoint plan requires manual GUI smoke validation
requirements_blocked:
  - DIST-04
must_haves_unverified:
  - pnpm dist:linux gera AppImage em apps/desktop/release-v2/
  - Launch do AppImage abre janela JARVIS
  - Tray icon aparece e menu funciona
  - First-run copy do .env cria ~/.config/JARVIS/.env com permissão 0o600 (T-71-01)
how_to_resume:
  - Rodar `pnpm dist:linux` no host Linux
  - Launch do AppImage gerado
  - Validar checklist do PLAN.md (3 tasks de smoke)
  - Criar 71-04-SUMMARY.md ou re-rodar /gsd-execute-phase 71 --wave 2
---

# Plan 71-04 — Deferred (Linux smoke test pendente)

## Por que foi deferred

Plan 71-04 é `autonomous: false` — exige execução de `pnpm dist:linux` (build ~5-10 min, ~3GB de assets) + smoke test manual de GUI Electron + validação do first-run copy do `.env` com permissão POSIX 0o600.

Durante `/gsd-execute-phase 71`, o usuário optou por pular Wave 2 (deferred) para executar em sessão futura quando tiver tempo de validar manualmente a GUI.

## Estado da configuração (não bloqueia)

A config para o build Linux está pronta:
- ✓ `apps/desktop/electron-builder.yml` tem `linux: target=AppImage, category=Utility` (entregue por 71-02)
- ✓ `scripts/preflight-dist.mjs` valida ambiente (entregue por 71-03)
- ✓ `pnpm dist:linux` script no root package.json (entregue por 71-02)
- ✓ `resolveEnvPath()` + `ensureUserEnvFile()` com `chmod 0o600` (entregue por 71-01)

O que falta: **execução** do `pnpm dist:linux` + **validação manual** dos 3 must_haves.

## Como retomar

```bash
pnpm dist:linux
# build deve gerar apps/desktop/release-v2/JARVIS-<version>.AppImage
chmod +x apps/desktop/release-v2/JARVIS-*.AppImage
./apps/desktop/release-v2/JARVIS-*.AppImage --no-sandbox

# após primeira execução:
ls -la ~/.config/JARVIS/.env       # arquivo deve existir
stat -c '%a' ~/.config/JARVIS/.env  # deve ser '600'
```

Se passar, criar `71-04-SUMMARY.md` com o checklist marcado.
