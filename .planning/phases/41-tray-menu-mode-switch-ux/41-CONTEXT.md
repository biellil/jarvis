# Phase 41: Tray Menu + Mode Switch UX - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 41 entrega o **submenu "Voice Mode"** no tray existente, com 3 radio items mutuamente exclusivos (Wake Word / Always-Listening / PTT-only), feedback imediato via toast no orb/widget, e remoção do item legado "Pause listening". Troca de modo aplica em <1s sem modal dialog.

**Não inclui:** orb visual per-modo (Phase 42), PTT-only implementation (Phase 43), permission re-check macOS (Phase 44), badges e toast do orb (Phase 42 — este phase só envia o IPC, o renderer lida com a renderização).

</domain>

<decisions>
## Implementation Decisions

### Blocked transition UX
- **D-01:** Quando `VoiceModeManager.setMode()` retorna `false` (captura ativa), main process envia IPC `voice-mode:blocked` ao renderer. Orb/widget exibe toast breve ("Aguarde..."). Items do submenu ficam **sempre clicáveis** — sem disable state, sem rebuilt extra por status de captura.
- **D-02:** Mesmo canal IPC para sucesso e bloqueio — canal `voice-mode:switch-result` com payload `{ success: boolean, newMode?: VoiceMode, label?: string }`. Renderer decide como renderizar cada caso.

### Pause listening item
- **D-03:** Item "Pause listening" / "Resume listening" é **removido** do tray menu. O Voice Mode submenu é o único controle de voz no tray. Trocar para PTT-only é o equivalente funcional de "pausar". Simplifica o menu e elimina confusão de dois controles de voz paralelos.

### Menu sync strategy
- **D-04:** Sync **lazy** — `buildContextMenu()` lê `VoiceModeManager.getMode()` no momento do clique para determinar qual radio marcar. Zero listeners extras, zero acoplamento event-driven. Pode mostrar estado stale por 1 clique extra em cenários raros (mode change por código entre cliques), aceitável via VUI-01.

### Feedback de troca bem-sucedida
- **D-05:** Ao trocar com sucesso, main envia `voice-mode:switch-result` com `{ success: true, newMode, label }` via IPC. Renderer (Phase 42) cuida do toast visual. Phase 41 é responsável apenas pelo **envio do IPC** — não renderiza nada.

### Placement no menu
- **D-06:** "Voice Mode" submenu vai **logo após o separador inicial** (antes de Show/Hide), como primeiro item de configuração de comportamento. Ordem: `Voice Mode → [sep] → Show → Hide → Settings → [sep] → Configure Hotkey → Configure PTT → [sep] → DevTools → [sep] → Quit`.

### Labels dos modos
- **D-07:** Labels exibidos no submenu: `"Wake Word"`, `"Always-Listening"`, `"PTT-only"` — exatamente como no REQUIREMENTS.md. Sem abreviações no menu.

### Claude's Discretion
- Estrutura interna de `buildContextMenu()` — pode extrair helper `buildVoiceModeSubmenu()` ou inline. Claude decide conforme tamanho do arquivo.
- Tipo do payload IPC `voice-mode:switch-result` — Claude define em `shared/ipc-types.ts` seguindo pattern existente.
- Rebuild do menu após mode switch bem-sucedido — Claude decide se faz rebuild imediato no click handler ou lazy no próximo clique.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase — Tray existente
- `apps/desktop/src/main/tray.ts` — implementação atual do tray: padrão `type: 'radio'` já estabelecido em "Configure Hotkey" e "Configure PTT" submenus; padrão de rebuild via `tray?.setContextMenu(buildContextMenu(mainWindow))`
- `apps/desktop/src/main/store.ts` — `getVoiceMode()` / `setVoiceMode()` que serão implementados pela Phase 39 (já deve existir na branch atual)

### Voice Mode State Machine (Phase 39)
- `apps/desktop/src/main/voiceMode/index.ts` — `VoiceModeManager` com `setMode()`, `getMode()`, EventEmitter `'mode-change'`
- `.planning/phases/39-voice-mode-state-machine/39-CONTEXT.md` — D-01 (blocked transition retorna false), D-05 (event payload rich), D-06 (tipos em shared/ipc-types.ts)

### IPC Types
- `apps/desktop/src/shared/ipc-types.ts` — tipos IPC existentes; Phase 41 adiciona canal `voice-mode:switch-result`

### Requirements
- `.planning/REQUIREMENTS.md` §"Mode Selection UX (VUI)" — VUI-01 (radio buttons, <1s, sem modal)
- `.planning/milestones/v1.9-ROADMAP.md` §"Phase 41" — goal, success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`tray.ts` radio pattern**: `HOTKEY_OPTIONS.map(option => ({ label, type: 'radio', checked: option.accelerator === currentAccelerator, click: () => { ... rebuild } }))` — replicate exatamente para os 3 modos de voz.
- **`buildContextMenu(mainWindow)` rebuild pattern**: `click handler → change store → call buildContextMenu() → tray?.setContextMenu(rebuilt)` — Phase 41 segue o mesmo ciclo com `VoiceModeManager.setMode()`.
- **`broadcastPauseToggle`**: padrão de IPC main→renderer existente em `ipc/settings.ts` — Phase 41 cria função análoga `broadcastModeSwitch(result)` no mesmo arquivo ou em `ipc/voiceMode.ts`.

### Established Patterns
- **Menu rebuild on action**: cada click que muda estado faz rebuild do menu inteiro — não usa update incremental de items.
- **Store read in buildContextMenu**: `getWakeWordPaused()`, `getWidgetHotkey()`, `getPttHotkey()` são lidos fresh a cada rebuild — lazy sync natural.
- **Tray tooltip dinâmico**: `tray?.setToolTip(paused ? 'JARVIS — paused' : 'JARVIS — listening')` — Phase 41 pode atualizar para refletir modo ativo (ex: `JARVIS — Wake Word`).

### Integration Points
- **`VoiceModeManager.setMode(newMode)`** (Phase 39) — retorna `boolean`; `true` = sucesso, `false` = bloqueado.
- **`VoiceModeManager.getMode()`** (Phase 39) — lido em `buildContextMenu()` para determinar `checked` state.
- **Renderer toast** (Phase 42) — consome `voice-mode:switch-result` IPC event para exibir feedback visual.

</code_context>

<specifics>
## Specific Ideas

- **Tray tooltip por modo** — ao trocar modo, atualizar tooltip: `"JARVIS — Wake Word"` / `"JARVIS — Always-Listening"` / `"JARVIS — PTT"`. Reusa o padrão da Phase 23 (tooltip dinâmico).
- **IPC channel unificado** (`voice-mode:switch-result`) — mesmo canal para success e blocked, só o payload muda. Evita múltiplos event listeners no renderer.

</specifics>

<deferred>
## Deferred Ideas

- **Disable items durante captura** — complexidade extra de sync sem ganho UX proporcional. Feedback via toast (D-01) é suficiente.
- **Notification do sistema** — Electron Notification API pode ser explorada em Phase 44 (hardening) se toast no orb não for visível o suficiente.
- **Indicador de modo no tooltip apenas** (sem toast no renderer) — descartado; o orb pode estar minimizado e o usuário não veria.
- **Modo "Paused" como 4o estado** — fora de scope v1.9; trocar pra PTT-only é o equivalente funcional.

</deferred>

---

*Phase: 41-tray-menu-mode-switch-ux*
*Context gathered: 2026-04-26*
