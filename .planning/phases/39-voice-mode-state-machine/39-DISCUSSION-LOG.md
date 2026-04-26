# Phase 39: Voice Mode State Machine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 39-voice-mode-state-machine
**Areas discussed:** Transition guard policy, Strategy interface shape, Mode change event payload, Migration v1.8 → v1.9

---

## Transition Guard Policy

### Q1: Quando usuário tenta trocar de modo durante captura ativa, que comportamento?

| Option | Description | Selected |
|--------|-------------|----------|
| Bloquear + toast 'Aguarde' (Recommended) | Mode change rejeitada, toast pt-BR. UX clara | |
| Bloquear silencioso | API retorna false, sem toast | ✓ |
| Cancelar captura + trocar imediato | Aborta utterance e troca | |
| Queue: trocar ao fim da captura | Mode change enfileirada, aplicada idle | |

**User's choice:** Bloquear silencioso
**Notes:** API state machine retorna `false` em transição bloqueada. Toast UX deferred para Phase 41 (tray). Foundation phase prioriza simplicidade.

### Q2: Como detectar que captura está ativa? (state machine precisa saber)

| Option | Description | Selected |
|--------|-------------|----------|
| Strategy própria reporta via getStatus() | Cada Strategy implementa getStatus() | ✓ |
| Flag global no state machine | voiceMode.isCapturing setada por callbacks | |
| Promise-based lock | Strategy.start() Promise resolve quando idle | |

**User's choice:** Strategy própria reporta via getStatus()
**Notes:** Cleanest separation of concerns — state machine não precisa saber detalhes internos de cada Strategy.

---

## Strategy Interface Shape

### Q1: Que métodos cada Strategy deve expor?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: start/stop/dispose/getStatus (Recommended) | 4 métodos suficientes pra VMODE-01 | ✓ |
| Standard: + pause/resume | Adiciona pause()/resume() | |
| Rich: + forceFlush + reconfigure | Tudo + forceFlush + reconfigure | |

**User's choice:** Minimal: start/stop/dispose/getStatus
**Notes:** YAGNI — adicionar métodos quando phases futuras precisarem. forceFlush() vai ser necessário em Phase 43 (VPTT-03 override) — adicionar lá.

### Q2: Strategy lifecycle: instanciar todos no startup ou lazy on mode switch?

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy: instancia só a Strategy ativa (Recommended) | Memory-efficient, cria/dispose em mode switch | ✓ |
| Eager: todas as 3 instanciadas no startup | Singletons, mode switch só start/stop | |

**User's choice:** Lazy: instancia só a Strategy ativa
**Notes:** Critical pra Always-Listening Strategy que carrega Transformers.js DistilBERT (~100MB). Não pagar overhead se user nunca trocar pra esse modo.

---

## Mode Change Event Payload

### Q1: Que dados o EventEmitter dispara quando modo muda?

| Option | Description | Selected |
|--------|-------------|----------|
| Rich: {oldMode, newMode, reason, timestamp} (Recommended) | Suporta audit log, UX condicional, debugging | ✓ |
| Medium: {oldMode, newMode} | Só transição em si | |
| Minimal: newMode (string) | Apenas novo modo | |

**User's choice:** Rich: {oldMode, newMode, reason, timestamp}
**Notes:** Future-proof sem custo extra. reason field permite distinguir 'user'|'migration'|'system' transitions — útil para D-08 (silenciar migration toast).

### Q2: Onde declarar os tipos do event payload?

| Option | Description | Selected |
|--------|-------------|----------|
| shared/ipc-types.ts (existente) (Recommended) | Centraliza tipos cross-process | ✓ |
| voiceMode.ts (mesmo arquivo) | Co-located mas quebra Electron boundary | |
| shared/voice-mode-types.ts (novo) | Arquivo dedicado | |

**User's choice:** shared/ipc-types.ts (existente)
**Notes:** Consistência com pattern v1.7 (Settings IPC). Renderer e main consomem mesmo type sem boundary issues.

---

## Migration v1.8 → v1.9

### Q1: Como tratar usuários v1.8 sem campo voiceMode no electron-store?

| Option | Description | Selected |
|--------|-------------|----------|
| Default implícito no read (Recommended) | undefined → 'wake-word' default | ✓ |
| Migration func explícita no startup | Detecta v1.8 + emite event 'migration' | |
| Schema versioning (electron-store v8) | migrations: { '1.9.0': ... } | |

**User's choice:** Default implícito no read
**Notes:** Simples, zero código de migration que vai morrer depois. Pattern já idiomático no codebase (`store.get('hotkey') || DEFAULT_HOTKEY`).

### Q2: User vindo de v1.8 deve ver event 'mode change to wake-word' no startup?

| Option | Description | Selected |
|--------|-------------|----------|
| Silencioso (não emite event) (Recommended) | Default wake-word = comportamento v1.8 mantido | ✓ |
| Emite event reason='migration' | Auditavel mas listeners precisam filtrar | |

**User's choice:** Silencioso (não emite event)
**Notes:** Evita toast/feedback confuso pra usuários existentes que nunca interagiram com mode switching. Event só dispara em transições reais (reason='user').

---

## Claude's Discretion

Áreas onde user explicitamente deferiu pra Claude:
- Module structure (single file vs folder) — recomenda folder se > 200 linhas
- Strategy interface naming (com/sem prefix I) — manter consistência com codebase
- electron-store field name conflicts — voiceMode é canônico
- EventEmitter type (Node builtin vs Electron IPC) — builtin recomendado pra state machine 100% main

## Deferred Ideas

- Toast UX para mode bloqueado durante captura → Phase 41 (tray) ou Phase 42 (orb)
- Strategy.pause() / resume() → adicionar quando feature pedir (não requerido v1.9)
- Strategy.forceFlush() → Phase 43 (VPTT-03 hotkey override em Always-Listening)
- electron-store schema versioning formal → quando houver 2+ migrações
- Audit log de mode changes → Phase 44 se hardening pedir
- Cross-process state machine mirror → renderer só consome events
