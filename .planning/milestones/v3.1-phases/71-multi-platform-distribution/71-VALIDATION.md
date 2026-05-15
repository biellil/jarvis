---
phase: 71
slug: multi-platform-distribution
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-12
updated: 2026-05-12
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Updated 2026-05-12 with concrete task IDs from generated PLAN.md files.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (apps/desktop) + Node ESM subprocess tests (scripts/__tests__/) |
| **Config file** | `apps/desktop/vitest.config.ts` |
| **Quick run command** | `pnpm -F @jarvis/desktop test --run` |
| **Scripts test runner** | `pnpm vitest run scripts/__tests__/` (or fallback: workspace-level vitest) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~60s (desktop suite) / ~120s (full monorepo + scripts) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @jarvis/desktop test --run` (~30s, covers unit tests in desktop scope which is where most changes land)
- **After every plan wave:** Run `pnpm test` (full monorepo, ~120s)
- **Before `/gsd-verify-work`:** Full suite must be green + manual UAT items checked in Tasks 71-04-03 (Linux smoke) and 71-05-03 (Windows UAT)
- **Max feedback latency:** ~60 seconds (per task commit cycle)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | DIST-03/04 | T-71-01, T-71-06 | resolveEnvPath usa userData em packaged + firstRunEnv chmod 0o600 POSIX | unit (vitest) | `pnpm -F @jarvis/desktop test --run envPath firstRunEnv` | ✅ Task creates tests | ⬜ pending |
| 71-01-02 | 01 | 1 | DIST-03/04 | T-71-07 | index.ts boot order + tray "Abrir .env" via shell.showItemInFolder | unit + source assert | `pnpm -F @jarvis/desktop test --run tray && pnpm -F @jarvis/desktop typecheck` | ✅ Task extends tray.test.ts | ⬜ pending |
| 71-02-01 | 02 | 1 | DIST-01/02/03/04 | T-71-04 (accept) | electron-builder.yml: targets corretos (NSIS+portable, mac universal, AppImage) + sharp cross-platform + .env.example bundle + whisper filter post-P68 | config-smoke (yaml parse + assertions) | YAML parse via node + grep checks (see Plan 02 verify block) | N/A (yml edit) | ⬜ pending |
| 71-02-02 | 02 | 1 | DIST-01/02/03/04 | T-71-08 | validate-electron-builder.mjs gateway script | unit (vitest subprocess) | `pnpm vitest run scripts/__tests__/validate-electron-builder` | ✅ Task creates fixture-based tests | ⬜ pending |
| 71-03-01 | 03 | 1 | DIST-01..04 | T-71-10 (accept) | download-whisper-model.mjs medium entry + 4 root scripts | smoke (node script + package.json read) | `node -e "..."` script verification (see Plan 03 verify) | N/A | ⬜ pending |
| 71-03-02 | 03 | 1 | DIST-01..04 | T-71-02, T-71-05 | preflight-dist.mjs target validation + wine check + mac gate + .env.example secret-pattern detection | integration (vitest subprocess) | `pnpm vitest run scripts/__tests__/preflight-dist` | ✅ Task creates 6+ test cases | ⬜ pending |
| 71-04-01 | 04 | 2 | DIST-04 | T-71-04 (accept) | .gitignore + sharp prebuild verification + yml validator passes | smoke | `grep -q "release-v2" .gitignore && ls -d node_modules/@img/sharp-linux-x64 && node scripts/validate-electron-builder.mjs` | N/A | ⬜ pending |
| 71-04-02 | 04 | 2 | DIST-04 | T-71-04, T-71-11 (accept) | `pnpm dist:linux` produces JARVIS-*.AppImage + bundled .env.example | build-smoke | `test -f apps/desktop/release-v2/JARVIS-*.AppImage && test -x apps/desktop/release-v2/JARVIS-*.AppImage` | N/A (build artifact) | ⬜ pending |
| 71-04-03 | 04 | 2 | DIST-04 | T-71-01 (verify), T-71-04 (accept) | AppImage launches + tray works + userData/.env created mode 0o600 + idempotent re-launch | manual UAT | (see "Manual-Only Verifications" below) | N/A (human-verified) | ⬜ pending |
| 71-05-01 | 05 | 3 | DIST-01/02 | — | wine + mono-devel + libfuse2t64 installed on Linux build host | manual install | `wine --version && command -v mono` (or warning if mono missing) | N/A (sudo required) | ⬜ pending |
| 71-05-02 | 05 | 3 | DIST-01/02 | T-71-08 (mitigate via preflight) | `pnpm dist:win` produces JARVIS Setup *.exe + JARVIS *.exe | build-smoke | `ls apps/desktop/release-v2/*.exe \| wc -l \| awk '{exit ($1 >= 2 ? 0 : 1)}'` | N/A (build artifact) | ⬜ pending |
| 71-05-03 | 05 | 3 | DIST-01/02 | T-71-03 (accept), T-71-01-win (mitigate), T-71-13 (accept) | NSIS installs + Menu Iniciar + Painel de Controle + portable no UAC + icacls user-only | manual UAT (Windows físico) | (see "Manual-Only Verifications" below) | N/A (human-verified) | ⬜ pending |
| 71-06-01 | 06 | 3 | DIST-05 | T-71-03 (documenta) | §Pré-requisitos bullet wine+mono-devel | content-smoke | `grep -q "Para gerar binários Windows em Linux" README.md && grep -q "wine.*mono-devel" README.md && grep -q "libfuse2t64" README.md` | N/A (README edit) | ⬜ pending |
| 71-06-02 | 06 | 3 | DIST-05 | T-71-03, T-71-04 (documenta) | §Build & Install section completa (SmartScreen, Gatekeeper, libfuse2t64, --no-sandbox, .env paths) | content-smoke | `grep -q "^## Build & Install" README.md && grep -q "More info" README.md && grep -q "Run anyway" README.md && grep -q "Open Anyway" README.md && grep -q "libfuse2t64" README.md && grep -q -- "--no-sandbox" README.md && grep -q "%APPDATA%" README.md && grep -q "~/.config/JARVIS" README.md` | N/A (README edit) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These tests must be authored as part of the tasks that depend on them. Each is created by the corresponding Plan/Task:

- [ ] `apps/desktop/src/main/__tests__/envPath.test.ts` — unit tests do `resolveEnvPath` (dev vs packaged paths) — **created in Plan 71-01 Task 1**
- [ ] `apps/desktop/src/main/__tests__/firstRunEnv.test.ts` — copy idempotência + chmod 0o600 POSIX + Windows skip — **created in Plan 71-01 Task 1**
- [ ] Extension of `apps/desktop/src/main/__tests__/tray.test.ts` — `describe('Phase 71 D-10: Abrir .env menu item', ...)` block — **created in Plan 71-01 Task 2**
- [ ] `scripts/validate-electron-builder.mjs` (script itself) + `scripts/__tests__/validate-electron-builder.test.mjs` — 7+ test cases against yml fixtures + real yml smoke — **created in Plan 71-02 Task 2**
- [ ] `scripts/preflight-dist.mjs` (script itself) + `scripts/__tests__/preflight-dist.test.mjs` — 6+ test cases (invalid target, mac gate, wine missing, auto, secret detection, clean pass) — **created in Plan 71-03 Task 2**

All Wave 0 tests are created BEFORE or AS PART OF the same task that introduces the production code — `tdd="true"` is enabled on tasks where applicable.

---

## Manual-Only Verifications

These cannot be automated and require human action. Tracked here for the verify-work gate.

| Behavior | Requirement | Plan Task | Why Manual | Test Instructions |
|----------|-------------|-----------|------------|-------------------|
| Windows NSIS installer installs em Win 10/11 com atalho Menu Iniciar + Painel de Controle uninstall | DIST-01 | 71-05-03 (Test 1) | Necessita máquina Windows física (sem CI Win agent); UAT human-verified | Em PC Windows: copiar `release-v2/JARVIS Setup *.exe` → duplo-clique → SmartScreen ("More info" → "Run anyway") → verifica atalho Menu Iniciar + Desktop + JARVIS abre → Painel de Controle lista entry → Uninstall → entry removida |
| Windows portable executa sem instalação e sem admin | DIST-02 | 71-05-03 (Test 2) | Necessita Windows físico | Em PC Windows como user não-admin: copiar `release-v2/JARVIS *.exe` (portable) → duplo-clique → SmartScreen bypass → JARVIS abre **sem prompt UAC** → tray + microfone funcionam → Settings persistem em `%APPDATA%\JARVIS\` |
| `%APPDATA%\JARVIS\.env` herda ACL user-only (NTFS) | DIST-01/02 + T-71-01-win | 71-05-03 (Test 3 step 2) | NTFS icacls inspection | `icacls "%APPDATA%\JARVIS\.env"` → confirma só user atual tem acesso, NÃO "Everyone" nem "Users" group |
| macOS DMG universal abre em arm64 (M1+) e x64 (Intel) | DIST-03 | (deferred — D-02 / D-04) | Build em macOS exigido por Apple; UAT deferido até user ter Mac | Em macOS: copiar `release-v2/JARVIS-*-universal.dmg` → montar → arrastar para /Applications → primeira execução: Gatekeeper bloqueia → System Settings → Privacy & Security → "Open Anyway" → JARVIS abre → tray funciona |
| Linux AppImage executa em Ubuntu 24+ host de dev | DIST-04 | 71-04-03 | Sandbox + libfuse2 quirks específicos; user valida no host de dev | `chmod +x release-v2/JARVIS-*.AppImage && ./release-v2/JARVIS-*.AppImage --no-sandbox` → JARVIS abre → tray + microfone funcionam → fechar limpamente |
| First-run copy `.env.example` → `userData/.env` em packaged Linux + chmod 0o600 | D-08, T-71-01 | 71-04-03 (Step 3) | Requer simular packaged run (não cabe em vitest) | Deletar `~/.config/JARVIS/.env`, executar AppImage, `ls -la ~/.config/JARVIS/.env` mostra `-rw-------` (0o600); `diff -q ~/.config/JARVIS/.env .env.example` retorna identical |
| Tray menu "Abrir .env" abre file manager com `.env` selecionado | D-10 | 71-04-03 (Step 3 item 5) e 71-05-03 (Test 3 item 2) | `shell.showItemInFolder` não tem teste headless | Click tray icon → menu → "Abrir .env" → file manager OS abre com `.env` highlighted (Nautilus/Dolphin/Thunar/Explorer/Finder) |
| First-run copy é idempotente (re-launch não modifica .env) | D-08 | 71-04-03 (Step 4) | Requer simular packaged second-run | `stat -c '%Y' ~/.config/JARVIS/.env` antes e depois de relaunch → mtime idêntico → "IDEMPOTENT OK" |
| SmartScreen e Gatekeeper bypass docs estão corretos | DIST-05 | 71-06-02 (smoke) + 71-05-03 (Test 1) | Workflow visual de OS, não automatizável (mas docs grep-verified em 71-06) | Seguir literalmente o passo-a-passo do README em Windows 11 24H2 e macOS 14+ → confirmar JARVIS abre após cada bypass |

---

## Threat Coverage Map

| Threat | Coverage | Plan |
|--------|----------|------|
| T-71-01 (POSIX .env mode 0o600) | Mitigate via firstRunEnv chmodSync + asserted in firstRunEnv.test.ts + verified in UAT 71-04-03 | 01, 04 |
| T-71-02 (real secrets in bundled .env.example) | Mitigate via preflight-dist secret pattern grep + asserted in preflight-dist.test.mjs | 03 |
| T-71-03 (unsigned NSIS SmartScreen) | Accept + document in README §Build & Install (Windows section) | 05, 06 |
| T-71-04 (AppImage --no-sandbox bypasses Chromium sandbox) | Accept + document in README §Build & Install (Linux section + Limitações) | 04, 06 |
| T-71-05 (preflight PATH manipulation) | Mitigate via target whitelist + trusted build host model | 03 |
| T-71-06 (path traversal via .env.example symlink) | Mitigate via process.resourcesPath OS-controlled + no string concat | 01 |
| T-71-07 (tray "Abrir .env" used to open arbitrary file) | Mitigate via resolveEnvPath() computed path + no user input | 01 |
| T-71-08 (build failure on missing cross-platform prebuilds) | Mitigate via electron-builder.yml + validate-electron-builder.mjs + preflight verify | 02, 03 |
| T-71-09 (unsigned macOS DMG triggers Gatekeeper) | Accept + document in README §Build & Install (macOS section + Limitações) | 06 |
| T-71-10 (whisper download script spawnSync) | Accept (hardcoded paths, whitelist arg) | 03 |
| T-71-11 (unsigned AppImage spoofing) | Accept (personal use, user controls own binary distribution) | 04, 06 |
| T-71-12 (wine non-determinism) | Accept (wine 9.x stable; user UAT in physical Windows surfaces any bug) | 05 |
| T-71-13 (portable %TEMP% extraction) | Accept (OS user-scoped ACL; documented in README) | 05, 06 |
| T-71-14 (README leaks paths/secrets) | Accept (manual review confirmed only public OS conventions referenced) | 06 |
| T-71-01-win (.env in %APPDATA%\JARVIS\ accessible) | Mitigate via NTFS ACL inheritance + verified via icacls in UAT 71-05-03 | 01, 05 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify OR Wave 0 dependencies (manual-UAT tasks are explicitly checkpoint:human-verify/action)
- [x] Sampling continuity: no 3 consecutive auto tasks without automated verify (Plan 04 + 05 manual UAT tasks are bracketed by automated builds)
- [x] Wave 0 covers all MISSING references (envPath, firstRunEnv, tray extension, validate-electron-builder, preflight-dist)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (desktop scope) / < 120s (full monorepo)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Ready for execution. UAT items in Plans 04 + 05 are blocking gates — gsd-execute-phase will pause for human-verify resume-signal.
