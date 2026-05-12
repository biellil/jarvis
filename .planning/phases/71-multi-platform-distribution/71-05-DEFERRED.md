---
phase: 71
plan: 05
type: deferred
status: deferred
deferred_at: 2026-05-12
deferred_reason: User opted to skip 71-05 during /gsd-execute-phase 71 — checkpoint plan requires physical Windows PC for NSIS + portable UAT
requirements_blocked:
  - DIST-01
  - DIST-02
must_haves_unverified:
  - wine + mono-devel (opt) + libfuse2t64 instalados no host Linux dev
  - pnpm dist:win gera NSIS installer + portable em apps/desktop/release-v2/
  - NSIS installer roda em PC Windows físico, instala em %APPDATA%\Local\Programs\JARVIS\
  - Menu Iniciar tem atalho JARVIS
  - Painel de Controle → Apps & Features mostra entrada "JARVIS"
  - Portable .exe roda sem admin em qualquer pasta
how_to_resume:
  - Linux host setup (Ubuntu 24.04 Noble — ver pré-requisitos no README.md §Build & Install)
  - `sudo dpkg --add-architecture i386 && sudo apt update && sudo apt install -y wine wine32 wine64 mono-devel libfuse2t64`
  - `pnpm dist:win` para gerar NSIS + portable
  - Transferir os 2 .exe para PC Windows físico (USB, scp, etc.)
  - Smoke test conforme checklist do PLAN.md
  - Criar 71-05-SUMMARY.md ou re-rodar /gsd-execute-phase 71 --wave 3
---

# Plan 71-05 — Deferred (Windows cross-build + PC físico pendente)

## Por que foi deferred

Plan 71-05 é `autonomous: false` — exige:
1. Instalação de deps de cross-build no host Linux (wine + opt mono-devel + libfuse2t64)
2. Execução de `pnpm dist:win` (build ~10-15 min via wine, ~2GB de assets)
3. Transferência dos binários para PC Windows físico
4. UAT manual no Windows real: SmartScreen bypass, NSIS installer flow, entrada no Painel de Controle, portable sem admin

Durante `/gsd-execute-phase 71`, o usuário optou por deferir junto com 71-04 — ambos exigem hardware/GUI manual.

## Estado da configuração (não bloqueia)

A config para o build Windows está pronta:
- ✓ `apps/desktop/electron-builder.yml` tem `win: target=[nsis, portable]` (entregue por 71-02)
- ✓ `scripts/preflight-dist.mjs` valida wine antes do build (entregue por 71-03)
- ✓ `pnpm dist:win` script no root (entregue por 71-02)
- ✓ README documenta workflow SmartScreen bypass exato (entregue por 71-06)

O que falta: instalar wine + executar `pnpm dist:win` + UAT manual em PC Windows.

## Como retomar

```bash
# 1. Setup cross-build deps (Ubuntu 24.04 Noble)
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine wine32 wine64 mono-devel libfuse2t64
wine --version  # esperado wine-9.x

# 2. Build
pnpm dist:win
# deve gerar:
#   apps/desktop/release-v2/JARVIS Setup <version>.exe
#   apps/desktop/release-v2/JARVIS <version>.exe (portable)

# 3. Transferir os 2 .exe para PC Windows físico

# 4. UAT no Windows:
#   - Duplo-clique no NSIS → SmartScreen "More info" → "Run anyway"
#   - Verificar atalho no Menu Iniciar
#   - Verificar entrada em Apps & Features
#   - Duplo-clique no portable → SmartScreen bypass → executar sem admin
```

Se passar, criar `71-05-SUMMARY.md` com o checklist marcado.
