# Phase 44: Hardening & Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 44-hardening-migration
**Areas discussed:** macOS permission gate, Soak test approach, Migration test scope, Cross-platform degradation

---

## macOS Permission Gate

| Option | Description | Selected |
|--------|-------------|----------|
| No tray.ts (click handler) | Antes de chamar setMode(). Simples, mas só cobre clique no tray. | ✓ |
| No VoiceModeManager.setMode() | Centralizado, cobre qualquer ponto de mode switch. Exige hook/callback. | |
| Na strategy start() | Cada strategy verifica própria permissão. Usa mecanismo de degradation existente. | |

**User's choice:** No tray.ts (click handler)

| Option | Description | Selected |
|--------|-------------|----------|
| Toast no renderer (extender VoiceModeSwitchResult) | Adicionar blockedReason e settingsUrl. Renderer já tem infraestrutura de toast. | ✓ |
| Electron dialog.showMessageBox no main | Dialog nativo com botão 'Open System Settings'. Mais simples. | |

**User's choice:** Toast no renderer

**Notes:** Check aplica-se a ambos `always-listening` e `ptt-only`. Usar `getMediaAccessStatus` (não `askForMediaAccess`). Status != 'granted' = não concedido.

---

## Soak Test Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Script manual separado (Node.js) | Script dedicado, não parte do CI. Documentado no README. | ✓ |
| Teste automatizado acelerado (Jest/Vitest) | Fake timers, verifica cleanup de listeners. | |
| Ambos: teste unit + script manual | Melhor cobertura. | |

**User's choice:** Script manual separado

| Option | Description | Selected |
|--------|-------------|----------|
| process.memoryUsage().heapUsed no main | Fácil acesso em Node.js/Electron main. | ✓ |
| Ambos: main + renderer via executeJavaScript | Mais completo, ring buffer e VAD no renderer. | |

**User's choice:** process.memoryUsage().heapUsed no main

---

## Migration Test Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests apenas em store.ts | Testa getVoiceMode() com store vazio, valor inválido, etc. | ✓ |
| Unit tests + integration test de boot | Unit + VoiceModeManager.init() com store sem voiceMode. | |

**User's choice:** Unit tests apenas em store.ts

**Cenários selecionados:**
- Store sem campo voiceMode (v1.8 puro) ✓
- Campo voiceMode com valor inválido — não selecionado
- VoiceModeManager.init() com store v1.8 — não selecionado

---

## Cross-Platform Degradation

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas macOS mic permission (VHARD-01 scope) | Linux/Windows já cobertos por session.setPermissionRequestHandler. | ✓ |
| Adicionar check para intent classifier offline | Cross-platform degradation para download falho. | |

**User's choice:** Apenas macOS mic permission

| Option | Description | Selected |
|--------|-------------|----------|
| Ambos: always-listening e ptt-only | VHARD-01 diz 'em cada troca de modo', ambos usam mic. | ✓ |
| Somente always-listening | PTT-only usa mic pontualmente, coberto pelo session handler. | |

**User's choice:** Ambos os modos

---

## Claude's Discretion

- Tipo exato de blockedReason field
- Texto exato do toast para permissão negada
- Duração e intervalo do soak test script
- Wording da mensagem acionável

## Deferred Ideas

- VPOLISH-03: Graceful degrade se classifier falha >5% (v1.10+)
- VTEL-02: Memory monitoring contínuo (v1.10+)
- VPOLISH-01: Hotkey conflict detection (v1.10+)
