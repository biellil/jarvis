# Phase 33: Cross-Platform Support - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 33-cross-platform-support
**Areas discussed:** Dock no macOS, Whisper no Mac/Linux

---

## Dock no macOS

| Option | Description | Selected |
|--------|-------------|----------|
| Não, esconder do dock | app.dock.hide() — app vive só na menu bar, igual ao Windows (skipTaskbar). Comportamento consistente entre plataformas. | ✓ |
| Sim, mostrar no dock | Aparece no Dock como app normal. Permite Cmd+Tab para alternar. Menos discreto. | |

**User's choice:** Esconder do dock — comportamento consistente com Windows

---

| Option | Description | Selected |
|--------|-------------|----------|
| Não, continua rodando | Vive no tray/menu bar. Comportamento padrão de agent apps no macOS. | ✓ |
| Sim, sai ao fechar | App termina quando a janela fecha. | |

**User's choice:** Continua rodando — já implementado via `window-all-closed` ignorando darwin

---

## Whisper no Mac/Linux

| Option | Description | Selected |
|--------|-------------|----------|
| USE_WHISPER_CPP=false no Mac/Linux | Fallback para HTTP gateway. Whisper local fica Windows-only por enquanto. | |
| Adicionar prebuilts mac/linux | @fugood/whisper.node tem darwin-arm64, darwin-x64, linux-x64. Adicionar ao electron-builder.yml. | ✓ |
| Detectar em runtime | Tentar carregar e fazer fallback gracioso se não encontrar. | |

**User's choice:** Adicionar prebuilts para todas as plataformas

---

| Option | Description | Selected |
|--------|-------------|----------|
| darwin-arm64 (Apple Silicon) | M1/M2/M3/M4 — Metal GPU support | ✓ |
| darwin-x64 (Intel Mac) | Macs Intel | ✓ |
| linux-x64 | Linux x86_64 — CUDA/Vulkan/CPU | ✓ |

**User's choice:** Todas as plataformas: darwin-arm64, darwin-x64, linux-x64

---

## Claude's Discretion

- Tray icon estilo (PNG colorido vs template image) — não discutido, mantém atual
- Linux transparency fallback — aceitar limitação, sem código extra
- Ordem de inicialização no app.whenReady() para plataformas

## Deferred Ideas

- Template image para tray no macOS — v1.8+
- Wayland support no Linux — v2 requirements (PLAT-08)
- PTT hotkey global no macOS (Accessibility permission) — não está no escopo desta fase
