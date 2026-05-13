---
status: blocked
phase: 71-multi-platform-distribution
plan: 05
source:
  - 71-05-SUMMARY.md
started: 2026-05-12T21:36:00-03:00
updated: 2026-05-12T21:36:00-03:00
blocked_by: physical-device
---

## Current Test

[awaiting physical Windows 10/11 PC + Linux host com wine instalado]

## Pre-test Setup (No Host Linux Dev)

```bash
# Instalar dependências de cross-build
sudo apt update
sudo apt install -y wine mono-devel libfuse2t64

# Verificar versões mínimas (research §Pitfall 1)
wine --version  # esperado: wine-9.x ou wine-stable
mono --version  # opcional

# Cross-build Windows
pnpm dist:win
```

Após sucesso: 2 binários em `apps/desktop/release-v2/`:
- `JARVIS Setup 0.1.0.exe` (NSIS installer)
- `JARVIS 0.1.0.exe` (portable)

Copiar ambos para PC Windows 10/11 físico (USB, network share, etc).

## Tests

### 1. NSIS installer instala em Windows 10/11
expected: |
  Double-click em `JARVIS Setup 0.1.0.exe`.

  SmartScreen vai bloquear (binário unsigned). Click em "More info" → "Run anyway".

  Wizard NSIS abre, completa instalação per-user em `%APPDATA%\Local\Programs\JARVIS\`.
result: [pending]
blocked_by: physical-device

### 2. Atalho Menu Iniciar funciona
expected: |
  Após instalação NSIS, abrir Menu Iniciar e digitar "JARVIS".

  Atalho aparece e abre o app quando clicado.
result: [pending]
blocked_by: physical-device

### 3. Painel de Controle lista JARVIS com Uninstall (D-03)
expected: |
  Settings (Win10/11) → Apps → Installed apps → procurar "JARVIS".

  Entrada aparece com versão 0.1.0 e botão "Uninstall" funcional.

  Click em Uninstall → wizard NSIS uninstall executa limpo (sem deixar arquivos órfãos em %APPDATA%\JARVIS\ exceto userData/.env por design).
result: [pending]
blocked_by: physical-device

### 4. Portable .exe roda sem admin (D-03)
expected: |
  Double-click em `JARVIS 0.1.0.exe` (portable) em pasta arbitrária (Desktop, Downloads, USB).

  Sem prompt UAC. Sem necessidade de admin. App abre normalmente.

  Portable compartilha config com installed (`%APPDATA%\JARVIS\.env`) — mesmo userData path.
result: [pending]
blocked_by: physical-device

### 5. First-run copy de .env em Windows
expected: |
  Após primeiro launch (NSIS ou portable):

  Verificar que `%APPDATA%\JARVIS\.env` foi criado, copiado de `.env.example` bundleado em resources.

  NOTA: chmod 0o600 é skipped em Windows (NTFS ACLs do `%APPDATA%` já são user-scoped per Plan 71-01 implementation).
result: [pending]
blocked_by: physical-device

### 6. Tray icon visível em Windows
expected: |
  Tray icon JARVIS aparece na bandeja do Windows (canto inferior direito).

  Right-click no tray abre menu contextual com "Abrir .env", "Sair", etc.
result: [pending]
blocked_by: physical-device

### 7. Microfone funciona em Windows
expected: |
  Falar "Hey JARVIS" (com mic Windows configurado) e o orb reagir.

  NOTA: acceptable defer — config de mic Windows fora do escopo Plan 71-05.
result: [pending]
optional: true
blocked_by: physical-device

### 8. Cross-build wine completa sem erros (Linux side)
expected: |
  No host Linux após `pnpm dist:win`:

  - Exit code 0
  - Ambos arquivos `.exe` gerados em `apps/desktop/release-v2/`
  - Tamanhos sanity-checked (~600 MB NSIS, ~600 MB portable)
  - electron-builder log sem ERROR (warnings de wine "fixme:" são OK)
result: [pending]
blocked_by: physical-device

## Summary

total: 8
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 8

## Pre-requisitos (Resumo)

| Item | Onde | Status |
|------|------|--------|
| wine instalado | Host Linux | not-attempted |
| mono-devel (opcional) | Host Linux | not-attempted |
| libfuse2t64 | Host Linux | not-attempted |
| PC Windows 10/11 físico | Hardware | not-available |
| Acesso sudo no host Linux | Hardware/Permission | TBD |

## Gaps

<!-- Preenchido quando UAT for executado -->

## Notas de Bloqueio

Este UAT está marcado `status: blocked` porque exige hardware Windows físico. Não há workaround:

- ❌ VM Windows não substitui — UAT D-03 menciona "PC físico" explicitamente (Windows em VM pode mascarar issues de driver, SmartScreen behavior, NTFS ACLs reais)
- ❌ Wine para rodar o .exe em Linux não substitui — wine não emula NTFS ACLs nem Painel de Controle
- ❌ Cross-build sem UAT subsequente = false positive

Para retomar quando hardware estiver disponível:
1. Editar `status: blocked` → `status: testing` neste arquivo
2. Executar pre-test setup (Linux side)
3. Rodar tests 1-8 sequencialmente
4. `/gsd-verify-work 71` quando todos resolvidos
