---
phase: 71
plan: 06
type: summary
status: completed
completed_at: 2026-05-12
requirements_validated:
  - DIST-05
threats_addressed:
  - T-71-03
  - T-71-04
  - T-71-14
decisions_exercised:
  - D-18
  - D-19
  - D-20
files:
  modified:
    - README.md
  created:
    - .planning/phases/71-multi-platform-distribution/71-06-SUMMARY.md
metrics:
  sections_added: 1
  bullets_added: 1
  tests_added: 0
---

# Plan 71-06 Summary — README Build & Install (DIST-05)

## Goal Achieved

DIST-05 (último success criterion do roadmap): README documenta build local (`pnpm dist:*`) e instalação per OS (Windows NSIS+portable, macOS DMG, Linux AppImage) em pt-BR, com workflows precisos para SmartScreen e Gatekeeper bypass.

## Deliverables

### Task 1: §Pré-requisitos bullet adicional

Bullet inserido após "Linux (Mac/Windows funcionam...)":

> **Para gerar binários Windows em Linux:** `wine` + `mono-devel` + `libfuse2t64` (Ubuntu 24.04 Noble: habilitar i386 antes via `sudo dpkg --add-architecture i386 && sudo apt update`). Veja §Build & Install para instalação completa.

§Pré-requisitos agora tem 7 bullets (era 6), com forward-link para §Build & Install.

### Task 2: §Build & Install nova seção

Seção `## Build & Install` inserida entre §Estrutura do projeto e §Problemas comuns (README.md:225). 6 sub-blocos:

1. **Build local** — comandos `pnpm dist`, `pnpm dist:linux`, `pnpm dist:win`, `pnpm dist:mac` + bloco de pré-requisitos Ubuntu 24.04 com `dpkg --add-architecture i386` + nota macOS-only para DMG
2. **Onde os binários ficam** — tabela em `apps/desktop/release-v2/` cobrindo 4 targets (NSIS, portable, DMG universal, AppImage)
3. **Windows install** — NSIS + portable workflows; SmartScreen bypass exato "More info → Run anyway"; per-user install em `%APPDATA%\Local\Programs\JARVIS\`; portable shareando config com installed
4. **macOS install** — Gatekeeper bypass per versão: Sequoia 15+ usa System Settings → Privacy & Security → Open Anyway; Monterey/Ventura/Sonoma usa right-click → Open → Open; permissão microfone
5. **Linux install** — AppImage `--no-sandbox` para Ubuntu 24.04+ (AppArmor 4.0 hardening); `libfuse2t64` fix para `libfuse.so.2 not found`; alternativa `--appimage-extract-and-run` sem FUSE
6. **Configuração pós-install (.env)** — tabela de paths per OS (Windows `%APPDATA%\JARVIS\.env`, macOS `~/Library/Application Support/JARVIS/.env`, Linux `~/.config/JARVIS/.env` com XDG_CONFIG_HOME); permissão `0o600` POSIX; tray menu "Abrir .env"; restart literal (sem hot-reload)
7. **Limitações conhecidas (v3.1)** — unsigned binaries (DIST-FUT-02 deferido v3.2), no auto-update (DIST-FUT-01 deferido v3.2), DMG só macOS host, bundle ~2-2.5GB

## Decisions Exercised

- **D-18** — Section structure: 6 sub-blocos + Limitações; position antes de §Problemas comuns; sem screenshots; tabela para .env paths
- **D-19** — pt-BR com termos técnicos em inglês: NSIS, SmartScreen, Gatekeeper, AppImage, FUSE, ASAR, AppArmor mantidos em inglês; narrativa toda em pt-BR
- **D-20** — Pré-requisitos bullet: novo bullet linkando §Build & Install para descoberta progressiva

## Threats Addressed

| Threat ID | Disposition | Mitigation |
|-----------|-------------|------------|
| T-71-03 (unsigned installer repudiation) | accept (documented) | README warning explícito + workflow de bypass passo-a-passo. User opt-in informado. DIST-FUT-02 deferido v3.2. |
| T-71-04 (--no-sandbox AppArmor bypass) | accept (documented) | README documenta necessidade da flag em Ubuntu 24.04+ + alternativa `--appimage-extract-and-run`. User opt-in. |
| T-71-14 (info disclosure) | reviewed | README só contém paths OS-públicos (%APPDATA%, ~/Library, ~/.config). Sem API keys, sem URLs internos. |

## Cross-References

- **Plan 71-01** — chmod 0o600 hardening referenced in §Configuração pós-install
- **Plan 71-02** — DMG universal arch + sharp prebuilds bundle implícito (DMG single-file fat)
- **Plan 71-03** — `scripts/preflight-dist.mjs` referenced explicitly em §Build local
- **Plans 71-04 + 71-05** — DEFERRED nesta sessão (user request: Linux smoke + Windows physical PC tests não executados). README assumiu workflows do plan files; smoke validation manual fica pendente.

## Phase 71 Completion Checklist

- ✅ DIST-01 (Windows NSIS installer) — config em 71-02
- ✅ DIST-02 (Windows portable) — config em 71-02
- ⚠️ DIST-03 (macOS DMG) — config em 71-02; build em macOS host fica para futura sessão
- ⚠️ DIST-04 (Linux AppImage) — config em 71-02; build + smoke validation deferred (71-04)
- ⚠️ DIST-05 (README + workflows) — docs entregue (este plan); smoke validation real depende de 71-04/05

## Self-Check: PASSED

| Acceptance Criterion | Status |
|----------------------|--------|
| `wine.*mono-devel.*libfuse2t64` bullet em §Pré-requisitos | ✓ |
| `## Build & Install` header presente | ✓ |
| SmartScreen "More info" + "Run anyway" | ✓ |
| Gatekeeper Sequoia 15+ "Open Anyway" workflow | ✓ |
| macOS 12-14 `right-click → Open` alternative | ✓ |
| Linux `libfuse2t64` mention | ✓ |
| Linux `--no-sandbox` mention | ✓ |
| `--appimage-extract-and-run` fallback | ✓ |
| `%APPDATA%`, `Library/Application Support/JARVIS`, `~/.config/JARVIS` paths | ✓ |
| "Abrir .env" tray reference | ✓ |
| `0o600` permission callout | ✓ |
| `DIST-FUT-01` (auto-update) + `DIST-FUT-02` (code-signing) deferred mentions | ✓ |
| Build & Install antes de Problemas comuns (linha 225 < 335) | ✓ |
| Sem screenshots adicionados | ✓ |

## Suggested Next Steps (v3.2 seeds)

- Screenshots do SmartScreen e Gatekeeper workflows (se README virar público)
- markdownlint config no repo
- GitHub Releases manual upload workflow doc
- Plant-seeds DIST-FUT-01 (auto-update) + DIST-FUT-02 (code-signing) já criados em backlog v3.1
