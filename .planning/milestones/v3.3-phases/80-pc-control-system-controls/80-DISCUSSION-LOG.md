# Phase 80: PC Control — System Controls - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 80-pc-control-system-controls
**Areas discussed:** SSE Routing, Volume Control Backend, Media Control Backend

---

## SSE Event Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Ambos (event: action + task:pc_action) | Adiciona handler para `event: action` + mantém `task:pc_action`. Cobre o caso real: comandos simples como "aumenta o volume" são non-agentic. | ✓ |
| Só task:pc_action | Mantém apenas o handler agentic. Volume/mídia não funcionariam no fluxo normal de conversa. | |

**User's choice:** Ambos (Recomendado)
**Notes:** Decisão crítica — sem tratar `event: action`, os comandos de sistema caem silenciosamente no `else` debug branch de `_handle_agentic_event`. A normalização `args` → `params` fica no ponto de dispatch.

---

## Volume Control Backend

| Option | Description | Selected |
|--------|-------------|----------|
| pycaw (Win) + subprocess (Linux/macOS) | pycaw wraps IAudioEndpointVolume via COM no Windows — sub-millisecond. pactl subprocess no Linux. osascript subprocess no macOS. | ✓ |
| 100% subprocess (zero novas deps) | PowerShell no Windows (~300-500ms overhead), pactl Linux, osascript macOS. Zero novas deps. | |

**User's choice:** pycaw (Win) + subprocess (Linux/macOS) (Recomendado)
**Notes:** Aceita 1 dep nova Windows-only (pycaw + comtypes). Lazy import dentro do branch win32 com guard COMError.

---

## Media Control Backend

| Option | Description | Selected |
|--------|-------------|----------|
| pynput (Win/macOS) + playerctl subprocess (Linux) | pynput já instalado, funciona bem Win/macOS. playerctl para Linux (MPRIS, Wayland+X11). Zero novas deps Python. | ✓ |
| pynput em todos os OSes | Um único code path. Risco: Linux Wayland quebrado/unreliable (issues abertas desde 2020). | |

**User's choice:** pynput (Win/macOS) + playerctl subprocess (Linux) (Recomendado)
**Notes:** playerctl é o padrão de facto MPRIS em todas as distros principais. Requer nota no README para Linux (`apt install playerctl`).

---

## Claude's Discretion

- Forma exata de adicionar pycaw condicionalmente no pyproject.toml (extras vs platform marker)
- Normalização de escala de volume pycaw (0.0-1.0) a partir do delta inteiro (±100) do backend-ts
- Tratamento de playerctl/pactl não encontrados no Linux (log warning + erro descritivo)

## Deferred Ideas

- Controle de brilho — REQUIREMENTS.md §Future Requirements (v3.4+)
- Feedback TTS do volume — escopo futuro
- Volume absoluto (set_volume) — PCTRL-07 cobre apenas delta/mute; pode ser adicionado separadamente
