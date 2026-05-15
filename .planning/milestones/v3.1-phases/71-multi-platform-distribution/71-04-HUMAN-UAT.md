---
status: partial
phase: 71-multi-platform-distribution
plan: 04
source:
  - 71-04-SUMMARY.md
started: 2026-05-12T21:36:00-03:00
updated: 2026-05-12T21:36:00-03:00
blocked_by: physical-device
---

## Current Test

[awaiting human testing on Linux desktop com display GUI]

## Tests

### 1. AppImage launch e janela visível
expected: |
  Em Linux com display (Ubuntu 22+ / Fedora 38+):

  ```bash
  APPIMAGE=$(ls apps/desktop/release-v2/JARVIS-*.AppImage | head -1)
  chmod +x "$APPIMAGE"
  "$APPIMAGE" --no-sandbox &
  ```

  JARVIS orb janela (240×240, transparente) aparece na tela em até 10 segundos.
result: [pending]

### 2. Tray icon na bandeja do sistema
expected: |
  Tray icon JARVIS visível na top bar do GNOME / system tray do KDE.
  Click no tray abre menu contextual.
result: [pending]

### 3. First-run copy de .env com mode 0o600 (T-71-01)
expected: |
  Após primeiro launch:

  ```bash
  ls -la ~/.config/JARVIS/.env
  ```

  Output deve começar com `-rw-------` (mode 0o600, dono-only).
  Se mode é `-rw-r--r--` (0o644) → bug em `firstRunEnv.ts:42` (chmodSync não executou).
  Se arquivo não existe → bug em Plan 71-01 (ensureUserEnvFile) ou Plan 71-02 (extraResources).
result: [pending]

### 4. Conteúdo do .env userData bate com .env.example da raiz
expected: |
  ```bash
  diff -q ~/.config/JARVIS/.env .env.example
  ```

  Exit code 0 (arquivos idênticos).
result: [pending]

### 5. Tray menu "Abrir .env" abre file manager
expected: |
  Click no tray → menu → "Abrir .env" → file manager (Nautilus/Dolphin/Thunar) abre com `~/.config/JARVIS/.env` selecionado.

  Se file manager não abrir: pode ser DBus/file-manager não instalado — documentar como issue de DE-specific, não bug do Plan 71.
result: [pending]

### 6. Microfone captura audio (wake word reage)
expected: |
  Falar "Hey JARVIS" e o orb reagir (mudar cor / animar).

  NOTA: este item é acceptable defer — pode ser config de mic OS, fora do escopo Plan 71.
result: [pending]
optional: true

### 7. Exit limpo via tray → Sair
expected: |
  Click no tray → "Sair" → processo termina com exit code 0 (ou signal-related).

  Hung process → `kill -9 $APP_PID` + documentar.
result: [pending]

### 8. Idempotência do first-run (D-08, Plan 71-01)
expected: |
  ```bash
  ENV_STAT_BEFORE=$(stat -c '%Y' ~/.config/JARVIS/.env)
  "$APPIMAGE" --no-sandbox &
  APP_PID=$!
  sleep 5
  ENV_STAT_AFTER=$(stat -c '%Y' ~/.config/JARVIS/.env)
  [ "$ENV_STAT_BEFORE" = "$ENV_STAT_AFTER" ] && echo "IDEMPOTENT OK" || echo "IDEMPOTENT FAIL"
  kill $APP_PID
  ```

  Esperado: `IDEMPOTENT OK` — mtime não muda em runs subsequentes.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Pre-test Setup

Antes de rodar os testes, garantir clean state:

```bash
rm -rf ~/.config/JARVIS  # remove userData de runs anteriores (testa first-run flow)
```

## Build Artifacts Already Validated (Não Precisam UAT Humano)

- ✅ `pnpm dist:linux` exit code 0
- ✅ `JARVIS-0.1.0.AppImage` presente, executável (`file` retorna ELF 64-bit LSB executable)
- ✅ Tamanho AppImage: 1.7 GB (esperado ~2 GB — diferença explicada por compressão squashfs)
- ✅ `.env.example` bundleado em `resources/` do squashfs
- ✅ Modelos whisper bundleados íntegros (byte-exact com source)
- ✅ `.gitignore` inclui `apps/desktop/release-v2/`

## Gaps

<!-- Preenchido conforme UAT for executado -->

## Notas de Bloqueio

Esta UAT está marcada `status: partial` porque a sessão de execução de Phase 71 rodou em ambiente CLI/SSH sem display GUI disponível. AppImage exige X11/Wayland display para validar janela/tray/file-manager. Quando você tiver acesso a Linux desktop:

1. Copiar AppImage pra máquina com display, OU
2. Configurar X11 forwarding (`ssh -X`) e rodar daqui, OU
3. Bootar Linux desktop local e re-executar este UAT

Para retomar o UAT depois: `/gsd-verify-work 71`
