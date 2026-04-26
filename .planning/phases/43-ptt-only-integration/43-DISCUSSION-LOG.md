# Phase 43: PTT-only + Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 43-ptt-only-integration
**Areas discussed:** PTT semantics, AL hotkey override (VPTT-03), Hotkey ownership, dispose-before-factory fix, Race condition test scope

---

## PTT Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| A. Toggle (status quo) | Press = start, press de novo = stop. Já implementado em ptt-hotkey.ts. VPTT-01 satisfeito em espírito. Zero custo. | ✓ |
| B. Native module (uIOhook-napi) | Hook nativo de OS. Detecta keydown E keyup. PTT real. Adiciona dep nativa multiplataforma + permissões macOS Accessibility. | |
| C. Híbrido (toggle + auto-stop on VAD) | Press = start, stop automático quando VAD detecta silêncio. Mistura modelos mentais. | |

**User's choice:** A — Toggle
**Notes:** Limitação técnica do `globalShortcut` Electron documentada como decisão consciente. uIOhook deferido para v2.x.

---

## AL Hotkey Override (VPTT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Force-flush do VAD atual | Press hotkey = "fecha utterance agora, envia o que tiver, continua escutando". Modelo mental: "press = manda agora". | ✓ |
| B. Start-stop manual | Primeiro press = ignora VAD, captura como PTT até segundo press = envia. Mais controle pra ditado longo. | |
| C. Skip silence wait | Press = "VAD pode fechar agora se já tem áudio buffered". Comportamento mais sutil. | |

**User's choice:** A — Force-flush
**Notes:** Edge cases definidos: idle/processing/0-samples = no-op silencioso. Não suspende AL nem alterna modo.

---

## Hotkey Ownership

| Option | Description | Selected |
|--------|-------------|----------|
| A. Cada modo instala/desinstala a tecla | Strategy registra globalShortcut em start(), desregistra em dispose(). Self-contained mas duplica lógica. | |
| B. Tecla sempre ligada, cada modo decide se escuta | ptt-hotkey.ts continua único registrador. Strategies ouvem evento IPC. WakeWord ignora. | ✓ |
| C. Porteiro central via VoiceModeManager | Listener central roteia para strategy ativa via método acceptsPttSignal(). Overengineered para 3 strategies. | |

**User's choice:** B — ptt-hotkey.ts permanente, strategies só ouvem
**Notes:** User pediu explicação não-técnica antes de decidir. Analogia da campainha (sempre ligada, todos ouvem ou ignoram) ajudou clareza. VPTT-02 (reusa hotkey v1.7) fica trivial.

---

## Dispose-before-factory Fix

| Option | Description | Selected |
|--------|-------------|----------|
| A. Contratar primeiro, demitir depois | Tenta factory nova primeiro. Se sucesso, dispose() antiga e ativa nova. Por uma fração de segundo dois modos coexistem. | |
| B. Plano B em catch | Mantém ordem atual. Se factory falha, re-instancia a antiga via factory dela. Sistema se auto-corrige. | ✓ |
| C. Não fazer parte da Phase 43 | Aceita risco. Como PttOnlyStrategy vai existir, caso específico desaparece. Outras factory failures continuam vulneráveis. | |

**User's choice:** B — Plano B em catch
**Notes:** Fallback de último caso (re-create da antiga também falha) → log de erro + currentMode = null + activeStrategy = null. Documentado.

---

## Race Condition Test Scope (SC4)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Só unit test do guard | Mock tudo, valida transitioning flag. Rápido mas cobertura "no papel". | |
| B. Integração real | 3 cenários: sequencial rápido, concorrente via Promise.all, plano B em catch sob race. ~50-100 linhas extra. | ✓ |
| C. Stress test manual | Você abre o app e clica tray rápido. Sem cobertura automatizada. Vai virar "esqueceram de testar". | |

**User's choice:** B — Integração real
**Notes:** 3 cenários definidos (sequencial, concorrente, recovery). Listener count ≤ 1 é a verificação mais importante para evitar listener leaks.

---

## Claude's Discretion

- Localização do PttOnlyStrategy file
- Como guardar referência à factory antiga no VoiceModeManager
- Naming do método de re-create (helper vs inline)
- Test helper externo vs inline boilerplate
- Atomicidade do `transitioning` flag durante recovery

## Deferred Ideas

- **Native keyup detection (uIOhook)** — para PTT "press-and-hold" real, deferido para v2.x
- **AL override via "Start-stop manual" (Opção B do área 2)** — adiar até demanda concreta
- **Per-strategy hotkey customization** — hotkeys diferentes por modo, nice-to-have v2.x
