# Phase 41: Tray Menu + Mode Switch UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 41-tray-menu-mode-switch-ux
**Areas discussed:** Blocked transition UX, Pause listening item, Menu sync strategy, Feedback de troca bem-sucedida

---

## Blocked transition UX

| Option | Description | Selected |
|--------|-------------|----------|
| Toast no orb/widget | IPC main → renderer envia 'modo bloqueado'. Orb/widget mostra mensagem breve tipo 'Aguarde...' | ✓ |
| Notification do sistema | Electron Notification API. Aparece no canto da tela. Independente do orb estar visível. | |
| Silencioso — só ignora | Nada acontece. Usuário percebe que o radio não mudou. | |

**User's choice:** Toast no orb/widget
**Notes:** Canal IPC unificado `voice-mode:switch-result` com `{ success: boolean }` para success e blocked.

### Disable items durante captura

| Option | Description | Selected |
|--------|-------------|----------|
| Não — sempre clicáveis | Menu simples, sem monitorar estado de captura. | ✓ |
| Sim — desabilitar durante captura | Menu rebuilt quando status muda. Items ficam cinzas. | |

**User's choice:** Não — sempre clicáveis

---

## Pause listening item

| Option | Description | Selected |
|--------|-------------|----------|
| Remove — Voice Mode submenu substitui | Trocar pra PTT-only já é o 'pause efetivo'. Simplifica o menu. | ✓ |
| Mantém — só aparece em Wake Word mode | Item condicional: só visível quando modo ativo é Wake Word. | |
| Renomeia pra 'Pause [modo atual]' | Sempre visível, label dinâmico conforme modo. | |

**User's choice:** Remove — Voice Mode submenu substitui

---

## Menu sync strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy — rebuild no próximo clique | buildContextMenu() lê VoiceModeManager.getMode() na hora do clique. Simples. | ✓ |
| Reactive — rebuild ao receber VoiceModeChangeEvent | Tray ouve EventEmitter e rebuild automático a cada mode change. | |

**User's choice:** Lazy — rebuild no próximo clique

---

## Feedback de troca bem-sucedida

| Option | Description | Selected |
|--------|-------------|----------|
| Toast no orb/widget | Main → renderer IPC `voice-mode:switch-result`. Orb exibe brevemente o modo ativo. | ✓ |
| Apenas o radio — sem toast | Usuário vê radio quando abre tray de novo. UX minimal. | |
| Notification do sistema | Electron Notification API. | |

**User's choice:** Toast no orb/widget

---

## Claude's Discretion

- Estrutura interna de `buildContextMenu()` (helper extraído ou inline)
- Tipo do payload IPC em `shared/ipc-types.ts`
- Rebuild do menu após mode switch bem-sucedido (imediato ou lazy)
- Tray tooltip dinâmico por modo (sugestão aceita)

## Deferred Ideas

- Disable items durante captura — toast (D-01) é suficiente
- Electron Notification API — possível em Phase 44 hardening
- Modo "Paused" como 4o estado — fora de scope v1.9
