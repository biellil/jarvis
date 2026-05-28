# Phase 80: PC Control — System Controls - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

JARVIS executa controle de volume (`adjust_volume`, `toggle_mute`) e controle de mídia (`media_control`) por voz no Python Desktop. Novos handlers em `pc_control.py`, wiring de SSE em `chat.py` para ambos os caminhos (non-agentic `event: action` + agentic `task:pc_action`).

**No escopo:** PCTRL-07 (volume: aumentar, diminuir, mutar/desmutar), PCTRL-08 (mídia: play/pause, próxima faixa, faixa anterior), audit log das novas ações.
**Fora do escopo:** Brilho de monitor, screenshot/visão, controle de mouse/teclado.

</domain>

<decisions>
## Implementation Decisions

### SSE Event Routing
- **D-01:** `chat.py` passa a tratar **ambos** os event types:
  - `event: action` (non-agentic, caminho rápido) — o caminho real para comandos simples como "aumenta o volume"
  - `task:pc_action` (agentic, já existente desde Phase 79)
  - Ambos chamam `execute_pc_action(action, params, config)`. Normalização: `args` key do `event: action` é mapeada para `params` no ponto de dispatch.
  - Motivo: comandos de volume/mídia são queries simples (non-agentic), não multi-step tasks. Sem este fix, os comandos seriam silenciosamente descartados no branch `else` de `_handle_agentic_event`.

### Volume Control Backend
- **D-02:** Abordagem híbrida por OS:
  - **Windows:** `pycaw` — wraps `IAudioEndpointVolume` via COM, sub-millisecond, delta exato. Lazy import dentro do branch `win32`. Guard `try/except COMError` para sessões RDP/headless.
  - **Linux:** `subprocess pactl` — `pactl set-sink-volume @DEFAULT_SINK@ +N%` / `pactl set-sink-mute @DEFAULT_SINK@ toggle`. Cobre PulseAudio e Pipewire (shim compatível).
  - **macOS:** `subprocess osascript` — `osascript -e "set volume output volume X"`.
  - Dep nova: `pycaw` adicionada ao `pyproject.toml` apenas para Windows (instalação condicional via extras ou note no README — ver Claude's Discretion).

### Media Control Backend
- **D-03:** Abordagem híbrida por OS:
  - **Windows + macOS:** `pynput` (já instalado) com `Key.media_play_pause`, `Key.media_next`, `Key.media_previous`. Solid nos dois OSes.
  - **Linux:** `subprocess playerctl` — `playerctl play-pause`, `playerctl next`, `playerctl previous`. Cobre MPRIS (Wayland + X11). System dep: `apt install playerctl` (nota no README).
  - Motivo: pynput Linux/Wayland tem issues abertas sem fix previsto (2020-2025). playerctl é o padrão MPRIS em todas as distros principais (~4k stars).
  - Zero novas deps Python para mídia.

### Action Types Novos (PCTRL-07/08)
- **D-04:** `execute_pc_action` em `pc_control.py` recebe 3 novos `action` values:
  - `"adjust_volume"` — params: `{"delta": int}` (delta ±100 em pontos percentuais)
  - `"toggle_mute"` — params: `{}`
  - `"media_control"` — params: `{"command": "play_pause" | "next_track" | "prev_track"}`
- **D-05:** Audit log: mesmos campos D-13 da Phase 79 (`timestamp`, `action`, `params`, `result`, `error`). Sem campos novos.

### Claude's Discretion
- Forma de instalar pycaw condicionalmente (extras `[windows]` no pyproject.toml vs `; sys_platform == "win32"` marker vs nota no README)
- Escala de volume usada internamente: delta em `pycaw` pode ser escalar 0.0–1.0; normalizar internamente da escala do backend-ts (±100 inteiro → ±1.0 float)
- Tratamento de `playerctl not found` no Linux: log warning + erro descritivo, não crash
- Tratamento de `pactl not found` no Linux (sistemas ALSA puro sem PulseAudio): idem, log + erro

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos desta phase
- `.planning/REQUIREMENTS.md` §PC Control Python — PCTRL-07, PCTRL-08 (requisitos completos)
- `.planning/ROADMAP.md` §Phase 80 — Success Criteria (3 critérios de aceitação)

### Código-base Python Desktop
- `apps/desktop-py/src/jarvis_desktop/pc_control.py` — módulo existente com `execute_pc_action`, padrão de módulo plano, lazy imports, audit log
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_handle_agentic_event()` (adicionar branch `event: action`), `_post_task_resume()` (padrão de resposta ao gateway)
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — ponto de wiring de init
- `apps/desktop-py/pyproject.toml` — deps atuais; adicionar `pycaw`

### Backend-ts (SSE payload schema)
- `apps/backend-ts/src/session/pc-tools.ts` — `createAdjustVolumeTool()`, `createToggleMuteTool()`, `createMediaControlTool()` — schema exato dos payloads que o LLM envia via SSE. O payload do `event: action` usa `args` key; `task:pc_action` usa `params` key.
- `apps/backend-ts/src/routes/chat.ts` (linhas ~183-193) — onde o gateway emite `event: action\ndata: {tool_call_id, action, args, requires_confirmation}`

### Phase 79 (decisões a carregar)
- `.planning/phases/79-pc-control-app-file/79-CONTEXT.md` — D-12 (lazy imports), D-13 (audit log schema), D-04 (app resolution pattern a replicar para padrão de código)
- `apps/desktop-py/tests/test_pc_control.py` — padrão TDD usado na Phase 79 (xfail stubs + conftest fixtures)

### Tech stack — libs a usar
- `CLAUDE.md` §PC Control (Platform-Specific Backends) — tabela completa de libs por OS
- `CLAUDE.md` §What NOT to Use — referência de libs a evitar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pc_control.execute_pc_action()` — entrypoint existente; adicionar novos `elif action == "adjust_volume"` branches
- `pc_control._PLATFORM` — `sys.platform` já disponível como module-level const para branching por OS
- `pc_control._audit_log()` — reutilizar diretamente, zero mudança necessária
- `chat.py:_handle_agentic_event()` — adicionar `elif event_type == "action":` antes do `else:` final; extrair `action = data.get("action")`, `params = data.get("args", {})` para normalizar schema
- `pc_control._console()` — lazy import helper disponível para logging interno

### Established Patterns
- Módulo plano com `_PLATFORM` branching direto (win32/darwin/linux) — seguir para adjust_volume/toggle_mute/media_control
- `import psutil` / `import shutil` lazy dentro das funções (não no topo do módulo) — replicar para `import pycaw`
- `try/except Exception as exc:` em `execute_pc_action` captura tudo e seta `result["result"] = "error"` — padrão correto
- `_ui.set_state("executing_pc_action")` já disponível no branch `task:pc_action` — reutilizar no branch `action` também

### Integration Points
- `chat.py:_handle_agentic_event()`: novo `elif event_type == "action":` — normaliza `args` → `params` e chama `execute_pc_action`
- `pc_control.py`: 3 novos branches em `execute_pc_action` (adjust_volume, toggle_mute, media_control)
- `pyproject.toml`: adicionar `pycaw` (com marker `; sys_platform == "win32"` ou `[windows]` extra)

</code_context>

<specifics>
## Specific Ideas

- O backend-ts já tem `createAdjustVolumeTool` com `delta` inteiro ±100; `pycaw` usa escalar 0.0–1.0 — a conversão é `delta / 100.0`, clamped para 0.0–1.0 após aplicar ao volume atual.
- `pactl set-sink-volume @DEFAULT_SINK@ +5%` aceita porcentagem relativa diretamente — sem necessidade de ler volume atual antes de incrementar no Linux.
- `playerctl` deve ser chamado como subprocess sem shell=True para segurança.
- Para o branch `event: action` em `chat.py`: o campo `task_id` não existe no payload non-agentic — `_post_task_resume` NÃO deve ser chamado. A ação executa e imprime resultado, sem resume ao gateway.

</specifics>

<deferred>
## Deferred Ideas

- **Controle de brilho** — `screen-brightness-control` citado no CLAUDE.md; fora de v3.3 (REQUIREMENTS.md §Future Requirements explicitamente)
- **Feedback TTS do volume** — falar "volume em 60%" após ajuste; escopo futuro
- **Volume absoluto (`set_volume`)** — backend-ts tem `createSetVolumeTool` mas PCTRL-07 cobre apenas delta/mute; `set_volume` pode ser adicionado sem nova Phase se necessário

</deferred>

---

*Phase: 80-pc-control-system-controls*
*Context gathered: 2026-05-21*
