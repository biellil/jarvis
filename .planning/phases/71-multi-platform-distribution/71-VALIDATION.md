---
phase: 71
slug: multi-platform-distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (apps/desktop) |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm -F @jarvis/desktop test --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~60s (desktop suite) / ~120s (full monorepo) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @jarvis/desktop test --run` (apenas escopo desktop muda nesta phase)
- **After every plan wave:** Run `pnpm test` (monorepo full)
- **Before `/gsd-verify-work`:** Full suite must be green + manual UAT items checked
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Filled in by gsd-planner from PLAN.md tasks. Skeleton below — planner replaces with real task IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | DIST-03/04 | — | resolveEnvPath usa userData em packaged | unit | `pnpm -F @jarvis/desktop test --run envPath` | ❌ W0 | ⬜ pending |
| 71-02-01 | 02 | 1 | DIST-01/02/03/04 | — | electron-builder.yml validado | unit | `node scripts/validate-electron-builder.mjs` | ❌ W0 | ⬜ pending |
| 71-03-01 | 03 | 1 | DIST-01..04 | — | preflight-dist detecta host/deps | unit | `pnpm -F @jarvis/desktop test --run preflight` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner: substitua linhas acima por uma linha por task real do PLAN.md, mantendo o mapeamento DIST-XX → automated command.*

---

## Wave 0 Requirements

- [ ] `apps/desktop/src/main/__tests__/envPath.test.ts` — unit test do resolveEnvPath (dev vs packaged paths)
- [ ] `apps/desktop/src/main/__tests__/firstRunEnv.test.ts` — copy idempotência + atomic write
- [ ] `scripts/__tests__/preflight-dist.test.mjs` (ou `tests/preflight-dist.test.mjs`) — testa detection wine/mono + missing models + host OS gate
- [ ] `scripts/validate-electron-builder.mjs` — script que carrega electron-builder.yml, valida (a) targets corretos, (b) extraResources sharp prebuilds cross-platform presentes, (c) whisper filter alinhado com bundle (base+medium), (d) `.env.example` entry presente
- [ ] Tray menu test estendido em `apps/desktop/src/main/__tests__/tray.test.ts` (existente — adicionar item "Abrir .env" assertions)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Windows NSIS installer instala em Win10/11 com atalho Menu Iniciar | DIST-01 | Necessita máquina Windows física (sem CI Win agent); UAT human-verified | Em PC Windows: copiar `release-v2/JARVIS-{version}-Setup.exe` → duplo-clique → aceitar SmartScreen ("More info" → "Run anyway") → verificar atalho aparece em Menu Iniciar → abrir JARVIS → verificar tray + microfone funcionam → desinstalar via Painel de Controle → confirmar entry foi removida |
| Windows portable executa sem instalação e sem admin | DIST-02 | Necessita Windows físico | Em PC Windows como user não-admin: copiar `release-v2/JARVIS-{version}-portable.exe` → duplo-clique → JARVIS abre sem prompt UAC → tray + microfone funcionam |
| macOS DMG universal abre em arm64 e x64 (~Mac M1+ e Intel Mac) | DIST-03 | Build em macOS exigido por Apple; UAT deferido até user ter acesso a Mac | Em macOS: copiar `release-v2/JARVIS-{version}-universal.dmg` → montar → arrastar para /Applications → primeira execução: Gatekeeper bloqueia → System Settings → Privacy & Security → "Open Anyway" → JARVIS abre → tray funciona |
| Linux AppImage executa em Ubuntu 22+/Fedora 38+ | DIST-04 | Sandbox + libfuse2 quirks específicos cross-distro; user valida no host de dev | `chmod +x release-v2/JARVIS-{version}.AppImage && ./release-v2/JARVIS-{version}.AppImage --no-sandbox` → JARVIS abre → tray + microfone funcionam → fechar limpamente |
| First-run copy `.env.example` → `userData/.env` ocorre em packaged | D-08 | Requer simular packaged run (não cabe em vitest) | Instalar JARVIS, deletar `userData/.env` se houver, executar JARVIS, verificar `~/.config/JARVIS/.env` (Linux) foi criado com conteúdo do template |
| Tray menu "Abrir .env" abre file manager com `.env` selecionado | D-10 | shell.showItemInFolder não tem teste headless | Clicar tray icon → menu → "Abrir .env" → file manager OS abre na pasta com `.env` highlighted |
| SmartScreen e Gatekeeper bypass docs estão corretos | DIST-05 | Workflow visual de OS, não automatizável | Seguir literalmente o passo-a-passo do README em Windows 11 24H2 e macOS 14+ → confirmar JARVIS abre após cada bypass |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
