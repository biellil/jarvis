---
phase: 39-voice-mode-state-machine
plan: 02
subsystem: voice-mode
tags: [voice, state-machine, strategy-pattern, event-emitter, lifecycle]
requires:
  - VoiceMode union type (Plan 39-01)
  - VoiceModeChangeEvent interface (Plan 39-01)
  - getVoiceMode/setVoiceMode accessors (Plan 39-01)
provides:
  - VoiceCaptureStrategy interface (start/stop/dispose/getStatus — D-03 minimal)
  - WakeWordStrategy class (stub seguro para Phase 39 — Phase 40 implementa real)
  - VoiceModeManager class (extends EventEmitter):
      * getMode(), setMode(mode, reason), init(), dispose()
      * Factories injetáveis via construtor (testability + Phase 40/43 hook)
      * Flag transitioning previne race conditions
      * Emite 'voiceMode:change' com payload rich {oldMode, newMode, reason, timestamp}
affects:
  - apps/desktop/src/main/voiceMode/index.ts (novo arquivo, novo diretório)
  - apps/desktop/src/main/__tests__/voiceMode.test.ts (novo arquivo)
tech-stack:
  added: []
  patterns:
    - "Strategy pattern com interface minimal (D-03): apenas 4 métodos, sem pause/resume/forceFlush"
    - "Factory injection no construtor — Phase 40/43 registram suas Strategies sem modificar Manager"
    - "Lazy lifecycle (D-04): apenas a Strategy ativa é instanciada; antiga é dispose() ao trocar"
    - "Race condition guard com flag boolean transitioning (PITFALLS.md §Mode Switch Race Condition)"
    - "EventEmitter (Node.js builtin) para pub/sub local — state machine vive 100% no main"
    - "Stub-with-throw factories para modos não implementados (Phase 40/43): falham graciosamente via try/catch no init/setMode"
key-files:
  created:
    - apps/desktop/src/main/voiceMode/index.ts
    - apps/desktop/src/main/__tests__/voiceMode.test.ts
  modified: []
decisions:
  - "D-01: setMode() retorna false silenciosamente em todos os bloqueios (mesmo modo, captura ativa, transição em progresso) — sem throw"
  - "D-02: status check via activeStrategy.getStatus() ≠ 'idle' bloqueia troca durante captura/processing"
  - "D-03: VoiceCaptureStrategy interface minimal — apenas start/stop/dispose/getStatus; pause/resume/forceFlush ficam fora do contrato"
  - "D-04: Strategy lifecycle lazy via factory map — apenas a Strategy do modo ativo é instanciada; old.dispose() antes de new factory()"
  - "D-05: VoiceModeChangeEvent payload rich {oldMode, newMode, reason, timestamp} — suporta audit log futuro"
  - "D-07: default 'wake-word' lido do store via getVoiceMode() — sem código de migração explícita"
  - "D-08: init() startup silencioso — não emite 'voiceMode:change' mesmo quando lê default"
  - "EventEmitter Node.js builtin (não Electron IPC) — state machine vive 100% no main; broadcast IPC é responsabilidade da Phase 41"
  - "Naming sem prefixo I — codebase JARVIS não usa I-prefix em interfaces"
metrics:
  duration: ~5 minutes
  completed: 2026-04-25T21:54:10Z
  tasks_total: 2
  tasks_completed: 2
  files_created: 2
  tests_added: 14
  tests_passing: 14
---

# Phase 39 Plan 02: VoiceCaptureStrategy + VoiceModeManager Summary

**One-liner:** VoiceModeManager state machine no main process — Strategy pattern com factory injection, exclusividade via flag transitioning + status guard, persistência via electron-store, EventEmitter para mode change pub/sub.

## What Was Built

Núcleo da Phase 39: state machine que garante apenas 1 modo de captura ativo por vez, persiste preferência entre restarts, e publica mode change events para tray (Phase 41), orb (Phase 42) e voiceInputManager (Phase 40+) consumirem.

### Task 1 — VoiceCaptureStrategy + WakeWordStrategy stub + VoiceModeManager (commit `d6a62c9`)

**Arquivo novo:** `apps/desktop/src/main/voiceMode/index.ts` (211 linhas)

**API pública exportada:**

```typescript
export interface VoiceCaptureStrategy {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  getStatus(): 'idle' | 'capturing' | 'processing';
}

export class WakeWordStrategy implements VoiceCaptureStrategy {
  // Stub — getStatus() retorna sempre 'idle'.
  // Phase 40 substituirá ou complementará com loop real.
}

export class VoiceModeManager extends EventEmitter {
  constructor(factories?: Partial<Record<VoiceMode, () => VoiceCaptureStrategy>>);
  init(): Promise<void>;                                   // D-08 silent startup
  getMode(): VoiceMode;
  setMode(newMode: VoiceMode, reason?: 'user' | 'system'): Promise<boolean>;
  dispose(): Promise<void>;
}
```

**Comportamentos garantidos:**

- `init()` lê modo do store (default 'wake-word' D-07), instancia Strategy via factory, **não emite** `'voiceMode:change'` (D-08).
- `setMode()` retorna `false` (silencioso, sem throw) quando: mesmo modo, transição em progresso, ou strategy ativa em status ≠ 'idle' (D-01 + D-02).
- `setMode()` bem-sucedido: `await oldStrategy.dispose()` → `newStrategy = factory()` → `await newStrategy.start()` → `setVoiceMode(newMode)` → `emit('voiceMode:change', {oldMode, newMode, reason, timestamp})`.
- Factories de `'always-listening'` e `'ptt-only'` por padrão lançam Error → capturado pelo try/catch em `init()`/`setMode()` → strategy fica `null`, mas mode change é registrado e persistido. Phase 40/43 sobrescrevem via factory injection.

### Task 2 — Testes voiceMode.test.ts (commit `c126c09`)

**Arquivo novo:** `apps/desktop/src/main/__tests__/voiceMode.test.ts` (229 linhas, 14 testes)

| # | Group | Test | Cobre |
|---|-------|------|-------|
| 1 | VMODE-02 | getMode() returns 'wake-word' when store empty | D-07 |
| 2 | VMODE-02 | getMode() returns stored mode on construction | persistence |
| 3 | VMODE-02 | setMode() persists new mode to store | VMODE-02 |
| 4 | VMODE-01 | setMode() for same mode returns false | guard |
| 5 | VMODE-01 | setMode() blocked when capturing | D-01 + D-02 |
| 6 | VMODE-01 | setMode() blocked when processing | D-01 + D-02 |
| 7 | VMODE-01 | setMode() success when idle | happy path |
| 8 | VMODE-03 | emits 'voiceMode:change' with rich payload | D-05 |
| 9 | VMODE-03 | init() does NOT emit | D-08 |
| 10 | D-04 | dispose() called on old strategy | lifecycle |
| 11 | D-04 | new strategy start() called | lifecycle |
| 12 | Race | concurrent setMode() — second returns false | flag transitioning |
| 13 | Stub | WakeWordStrategy.getStatus() returns 'idle' | safe default |
| 14 | Stub | start/stop/dispose resolve sem throw | API surface |

**Resultado:** `14/14 passing`, duration ~26ms (test execution).

## Verification

| Check | Result |
|-------|--------|
| `mkdir voiceMode/` | Created |
| `grep "export interface VoiceCaptureStrategy"` index.ts | Match |
| `grep "export class WakeWordStrategy"` index.ts | Match |
| `grep "export class VoiceModeManager"` index.ts | Match |
| `grep "extends EventEmitter"` index.ts | Match |
| `grep "start(): Promise<void>"` index.ts | Match |
| `grep "stop(): Promise<void>"` index.ts | Match |
| `grep "dispose(): Promise<void>"` index.ts | Match |
| `grep "getStatus(): 'idle' \| 'capturing' \| 'processing'"` index.ts | Match |
| `grep "this.transitioning"` index.ts | Match (3 ocorrências: check, set true, set false) |
| `npx vitest run voiceMode.test.ts` | 14/14 pass |
| `npx vitest run` (full suite) | 406 pass, 23 fail (todas pré-existentes — listadas abaixo) |
| `npx tsc --noEmit \| grep voiceMode` | Zero erros |
| `npx vitest run store.test.ts` (regression check) | 20/20 pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Race condition test: ordem de microtasks**
- **Found during:** Task 2 — primeira execução do teste de race condition falhou com `TypeError: resolveTransition is not a function`.
- **Issue:** Plan original criava `resolveTransition` dentro do `mockImplementation` da `start`, então a referência só era atribuída quando `start()` era invocado. Mas o `setMode()` interno faz `await oldStrategy.dispose()` (1 microtask) + `factory()` (sync) + `await newStrategy.start()` (microtask onde a Promise é criada). O teste chamava `resolveTransition()` antes de qualquer microtask drenar, então a referência ainda era `undefined`.
- **Fix:** Promise criada **fora** do mockImplementation (`const startPending = new Promise(...)`) e adicionei `await Promise.resolve()` × 3 para drenar microtasks antes de chamar `resolveTransition!()`. Assertion lógica preservada: primeira transição completa com `true`, segunda recebe `false` por causa da flag `transitioning`.
- **Files modified:** `apps/desktop/src/main/__tests__/voiceMode.test.ts` (test "concurrent setMode() calls")
- **Commit:** `c126c09`

### Out-of-scope (NOT fixed)

23 testes pré-existentes falham na suite completa do desktop (idênticos ao baseline registrado no SUMMARY do Plan 39-01). Verificado via `git stash` + re-run da suite: o número de tests caiu de 429 (com voiceMode.test.ts) para 415 (sem) e os mesmos 23 falham nos dois cenários. Detalhe:

| Suite falhante | Causa raiz (pré-existente) |
|----------------|----------------------------|
| `integration-chat.test.ts` | Cannot find module 'express' |
| `ipc-chat.test.ts` | Mocking issues legacy |
| `chat-send-audio.test.ts` | TS mock typing |
| `tts-providers.test.ts` | Provider mock issues |
| `voiceHandler.test.ts` (5) | Cannot find module '@fugood/whisper.node' |
| `whisper-gpu-detection.test.ts` (5) | Cannot find module '@fugood/whisper.node' |
| `vramDetection.test.ts` (3) | Native module fail |
| `WakeWordEngine.test.ts` (8) | `document is not defined` (jsdom env não setado) |
| `Orb.test.tsx` (1) | RGB color expectation drift |
| `modelLoader.test.ts` | onnxruntime-web mock |
| `security.test.ts` | setupIpcHandlers ordering |

Nenhum desses arquivos toca `voiceMode/index.ts` ou `voiceMode.test.ts`. Tracked como pre-existing por Plan 39-01 e não regrediram com este plan.

## Threat Model Coverage

| Threat ID | Disposition | Mitigation Implemented |
|-----------|-------------|------------------------|
| T-39-01 | mitigate | Aplicado upstream pelo Plan 39-01 (`getVoiceMode()` valida enum). VoiceModeManager apenas consome — sem necessidade de revalidar. |
| T-39-02 | mitigate | Flag `this.transitioning` (boolean local) bloqueia chamadas concorrentes a `setMode()`. Try/finally garante reset mesmo em erro. Modos não implementados (Phase 40/43) falham via try/catch sem crash — Strategy fica `null` e `getStatus()` skip continua válido (active strategy é `null`). Coberto pelo teste 12. |

## Commits

| Task | Type | Hash | Message |
|------|------|------|---------|
| 1 | feat | `d6a62c9` | adicionar VoiceCaptureStrategy e VoiceModeManager state machine |
| 2 | test | `c126c09` | cobrir VoiceModeManager state machine (14 testes) |

## Handoff to Phases 40, 41, 43

**Phase 40 (AlwaysListeningStrategy):**

```typescript
import { VoiceModeManager } from './voiceMode/index.js';
import { AlwaysListeningStrategy } from './voiceMode/alwaysListening.js'; // Phase 40 cria

const manager = new VoiceModeManager({
  'always-listening': () => new AlwaysListeningStrategy(deps),
  // 'wake-word' e 'ptt-only' usam defaults
});
await manager.init();
```

**Phase 43 (PttOnlyStrategy):**

```typescript
const manager = new VoiceModeManager({
  'always-listening': () => new AlwaysListeningStrategy(alDeps),
  'ptt-only': () => new PttOnlyStrategy(pttDeps),
});
```

**Phase 41 (Tray IPC broadcast):**

```typescript
import { IPC_CHANNELS } from '../shared/ipc-types.js';

manager.on('voiceMode:change', (event: VoiceModeChangeEvent) => {
  // Broadcast para todos os renderers
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.VOICE_MODE_CHANGE, event);
  }
  // Atualiza checkbox do radio submenu na tray
  updateTrayMenuChecked(event.newMode);
});

// Tray menu click:
trayItem.click = async () => { await manager.setMode('always-listening', 'user'); };
```

**Importante para Phase 40+:** quando uma Strategy real está em status 'capturing' ou 'processing', `setMode()` retorna `false` silenciosamente. Phase 41 (tray) deve mostrar feedback visual sutil (ex: tooltip "Aguarde — utterance em andamento") em vez de assumir mudança imediata.

## Self-Check: PASSED

- File `apps/desktop/src/main/voiceMode/index.ts`: FOUND (211 linhas)
- File `apps/desktop/src/main/__tests__/voiceMode.test.ts`: FOUND (229 linhas)
- Commit `d6a62c9`: FOUND (Task 1 — feat)
- Commit `c126c09`: FOUND (Task 2 — test)
- Success criteria atendidos:
  - VoiceCaptureStrategy interface com 4 métodos exatos: yes
  - WakeWordStrategy stub: yes
  - VoiceModeManager state machine com guards: yes
  - setMode() retorna false durante captura/transição: yes (testes 5, 6, 12)
  - init() não emite event: yes (teste 9)
  - setMode() emite payload rich: yes (teste 8)
  - dispose() na Strategy antiga: yes (teste 10)
  - 14+ testes passando: yes (14/14)
  - Suite sem novas regressões: yes (23 falhas pré-existentes idênticas)
  - Zero erros TypeScript em arquivos novos: yes (`tsc --noEmit | grep voiceMode` vazio)
