# Phase 59: System Controls - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 59-system-controls
**Areas discussed:** Volume relativo vs absoluto, Cross-platform volume, Mecanismo de mídia, Arquitetura das tools de mídia

---

## Volume — relativo vs. absoluto

| Option | Description | Selected |
|--------|-------------|----------|
| A — Delta fixo | +10/-10 fixo, mute toggle separado. Previsível, sem ambiguidade | |
| B — LLM decide o delta | Tool recebe `delta: number` livre. LLM escolhe +15 para "bastante", -5 para "um pouco" | ✓ |
| C — Handler lê e calcula | Tool continua com nível absoluto; handler lê estado atual e aplica delta | |

**User's choice:** B — LLM escolhe o delta livremente
**Notes:** Nenhuma restrição no valor do delta — o LLM tem liberdade total.

---

## Mute handling

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle | Tool `toggle_mute` sem argumentos — inverte estado atual | ✓ |
| Extend set_volume | Adicionar `mute: boolean` opcional na mesma tool | |

**User's choice:** Toggle — tool separada `toggle_mute`

---

## Cross-platform volume

| Option | Description | Selected |
|--------|-------------|----------|
| Só Linux | `pactl` — foco na plataforma de desenvolvimento | |
| Linux + macOS | `pactl` + `osascript` | |
| Todas as 3 | Linux (`pactl`), macOS (`osascript`), Windows (PowerShell/nircmd) | ✓ |

**User's choice:** Todas as 3 plataformas na mesma fase

---

## Mecanismo de controle de mídia

| Option | Description | Selected |
|--------|-------------|----------|
| A — Media keys via Electron | `globalShortcut` simula XF86Audio*. Cross-platform, sem binários externos | |
| B — Ferramenta por plataforma | `playerctl` (Linux), `osascript` (macOS), PowerShell (Windows) | ✓ |
| C — Você decide | Sem preferência técnica | |

**User's choice:** B — ferramenta nativa por plataforma

---

## Arquitetura das tools de mídia

| Option | Description | Selected |
|--------|-------------|----------|
| A — Uma tool com enum | `media_control { command: 'play_pause' \| 'next_track' \| 'prev_track' }` | ✓ |
| B — Tools separadas | `pause_media`, `next_track`, `prev_track` — cada uma sem argumentos | |

**User's choice:** A — uma tool `media_control` com enum de comandos

---

## Deferred Ideas

- Controle por app específico (Spotify, YouTube Music) — v2.4
- Volume por app individual (mixer) — nova capability, fora do escopo
