# Phase 43: PTT-only + Integration - Research

**Researched:** 2026-04-26
**Domain:** Electron main-process Strategy pattern, IPC lifecycle (`ptt:action`, `voice-mode:*`), VAD force-flush, race-resilient state machine
**Confidence:** HIGH

## Summary

A Phase 43 não introduz tecnologia nova — todo o stack (`electron 41.1.1`, `electron-store 11`, `vitest 4.1.2`, `EventEmitter` builtin) já está em uso e validado em Phases 39-41. O trabalho é **arquitetural-cirúrgico** sobre 4 superfícies já existentes:

1. **Nova `PttOnlyStrategy`** (réplica do molde `AlwaysListeningStrategy` Phase 40), com listener `ipcMain.on('ptt:action', ...)` em `start()` e remoção idempotente em `dispose()`.
2. **Hook `'ptt:action'` em `AlwaysListeningStrategy.start/dispose`** para o force-flush (D-02), reusando o mesmo padrão de listener stable-reference já presente em `alwaysListening.ts:96-99,170`.
3. **Plano B em `setMode()`** (D-04): re-instanciar a strategy antiga via factory dela quando a nova lança, com fallback final para `currentMode=null`.
4. **Renderer mic coordination via IPC `ptt:action`** já-existente: o renderer (`ChatInput.tsx:142`) consome o evento e usa `voiceInputManager.acquire('ptt')`. Cliente do PTT-only mode reaproveita inteiramente esse caminho.

**Descoberta crítica (decisão arquitetural emergente):** `ptt:action` é hoje um **canal main → renderer** (`webContents.send`), não `ipcMain.emit` interno. Isso torna D-03 ambíguo e exige uma decisão: ou (a) `ptt-hotkey.ts` passa a também emitir um `ipcMain.emit('ptt:action', 'toggle')` interno (dual-cast: renderer + listeners main), ou (b) strategies se inscrevem em um EventEmitter dedicado exposto pela `ptt-hotkey.ts`. Recomendação detalhada na seção `## Architecture Patterns › Pattern 2`.

**Primary recommendation:** Implementar `PttOnlyStrategy` espelhando exatamente a estrutura de `AlwaysListeningStrategy` (status state machine + stable listener ref + idempotent dispose); estender `ptt-hotkey.ts` com um EventEmitter Node.js builtin (`pttHotkeyEmitter`) que strategies main-side subscrevem, mantendo o `webContents.send` ao renderer **inalterado** (zero impacto no `ChatInput.tsx`). D-04 implementado como `try { factory(new) } catch { factory(old).start() }` com `transitioning` mantido true durante recovery (atomicidade).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (PTT Semantics — VPTT-01):** PTT-only mode usa **toggle** (press = start, press de novo = stop), NÃO press-and-hold. Limitação técnica do Electron `globalShortcut` (não detecta keyup) aceita como decisão consciente. VPTT-01 ("segura→fala→solta→envia") é satisfeito em espírito — usuário ainda controla início/fim manualmente. Documentar a discrepância em release notes / docs do modo.

- **D-02 (Always-Listening Hotkey Override — VPTT-03):** Em Always-Listening mode, press da hotkey PTT = **force-flush imediato do VAD** quando strategy está em estado `capturing`. Comportamento de cada estado:
  - `capturing` com samples > 0 → fecha utterance agora, envia, continua escutando
  - `capturing` com 0 samples → no-op silencioso (não toca microfone)
  - `idle` → no-op silencioso
  - `processing` → no-op silencioso (já enviou, esperando STT)
  - **NÃO** suspende AL nem alterna pra modo PTT-style — só força o boundary do utterance.

- **D-03 (Hotkey Ownership):** `apps/desktop/src/main/ptt-hotkey.ts` permanece o único módulo que registra `globalShortcut` (registrado uma vez no `app.whenReady()`). Strategies não registram nada — apenas ouvem o evento `'ptt:action' = 'toggle'` que `ptt-hotkey.ts` emite. Distribuição:
  - `PttOnlyStrategy.start()` → adiciona listener que toggle start/stop do mic; `dispose()` remove o listener
  - `AlwaysListeningStrategy.start()` → adiciona listener `'ptt:action'` que invoca o force-flush (D-02); `dispose()` remove
  - `WakeWordStrategy` → não registra listener; ignora o evento
  - **Justificativa:** VPTT-02 (reusa hotkey v1.7 sem reconfigurar) fica trivial. Strategies viram listeners simples. Wake Word ignora "vazamento" de IPC sem custo.

- **D-04 (Mode Switch Robustness — Plano B):** `VoiceModeManager.setMode()` adota **plano B em catch** — se factory da nova strategy lança, **re-instancia a strategy antiga via factory dela** e dá `start()` de novo. Sistema nunca fica em estado zumbi (currentMode aponta pra X mas activeStrategy === null).
  - VoiceModeManager guarda referência ao mode atual + factory dele
  - Em catch da nova factory: chama factory antiga, atribui ao activeStrategy, start()
  - Se re-create da antiga **também** falhar (cenário extremo): log de erro + `currentMode = null` + activeStrategy = null. Documentado como fallback de último caso.

- **D-05 (Race Condition Testing):** Testes de integração reais em `apps/desktop/src/main/__tests__/voiceMode.race.test.ts` com 3 cenários:
  1. **Sequencial rápido:** 5 trocas Wake→AL→PTT→Wake→AL com `await` entre cada. Assertions: `currentMode` final correto, `ipcMain.listenerCount('ptt:action')` ≤ 1, sem listeners órfãos.
  2. **Concorrente:** `await Promise.all([5 setMode em paralelo])`. Assertions: transitioning guard rejeita as concorrentes (retornam false), estado final consistente, currentMode === última que entrou no try block (não a última do array).
  3. **Plano B em catch sob race (D-04):** força factory de PttOnlyStrategy lançar uma vez, valida que WakeWordStrategy é re-instanciada e ativa.
  - Mock `globalShortcut` e `ipcMain` minimamente (testes não precisam do Electron real). Strategies usam factories test-doubles que respeitam o lifecycle real.

### Claude's Discretion

- **Localização do PttOnlyStrategy** — pode ser `apps/desktop/src/main/voiceMode/strategies/pttOnly.ts` (consistente com `alwaysListening.ts`) ou outra estrutura. Recomenda manter o pattern.
- **Como guardar a "factory antiga" no VoiceModeManager** — `Map.get()` do `strategyFactories` mais o oldMode antes da troca, OU campo dedicado `previousFactoryRef`. Decisão de Claude conforme legibilidade do diff.
- **Naming do método de re-create** — `restorePreviousStrategy()` ou inline em catch. Claude decide.
- **Test helper para mock factories** — pode ser inline no test file ou em `__tests__/helpers/strategyFactoryMocks.ts`. Recomenda helper se o boilerplate ficar repetitivo entre testes.
- **Edge case do `transitioning` guard durante recovery** — quando re-create da antiga roda, o flag transitioning está true. Claude decide se mantém true (atomicidade do switch inteiro) ou libera antes do recovery (permite outra troca enquanto recover). Recomenda manter atomicidade.

### Deferred Ideas (OUT OF SCOPE)

- **Native keyup detection (uIOhook ou alternativa)** — Para implementar PTT real "press-and-hold" em vez de toggle. Requer dep nativa multiplataforma, permissões macOS Accessibility, possíveis issues em Wayland/macOS Sandbox. Revisitar em v2.x.
- **AL override via "Start-stop manual" (Opção B do área 2)** — Modo onde press = ignora VAD, captura como PTT até segundo press = envia. Adiar até demanda concreta — D-02 (force-flush) cobre 90%+ dos casos.
- **Per-strategy hotkey customization** — Permitir hotkeys diferentes por modo. Atualmente todos compartilham o `getPttHotkey()` v1.7. Não pedido em VPTT-* — fica como nice-to-have v2.x.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **VPTT-01** | Em PTT-only mode, wake word é completamente desabilitado e a hotkey global é o único trigger — segura→fala→solta→envia | `PttOnlyStrategy.start()` envia `webContents.send('voice-mode:ptt-active', true)` para o renderer **suspender** o `useWakeWord` hook (renderer já tem `wakeWordPaused` flag — Phase 23 D-04). Quando a hotkey emite toggle, strategy NÃO precisa fazer nada main-side — o `ChatInput.tsx:125-148` já chama `voiceInputManager.acquire('ptt')` + `useAudioRecorder` + `sendAudioAndHandle`. **Bug de implementação resolvido pela arquitetura existente** — strategy só precisa garantir que `useWakeWord` está pausado. Ver `## Code Examples › PTT-only renderer coordination` |
| **VPTT-02** | PTT mode reusa a hotkey configurada em v1.7 Settings (não cria hotkey nova) | `ptt-hotkey.ts` permanece intacto (D-03). `getPttHotkey()` em `store.ts:62` lê o accelerator existente. Zero código novo de hotkey-config — `registerPttHotkey(mainWindow)` continua chamado uma vez em `app.whenReady()` (`main/index.ts:296`) |
| **VPTT-03** | Em Always-Listening mode, pressionar a hotkey força envio imediato do utterance sem esperar VAD silence threshold | Force-flush implementado em `AlwaysListeningStrategy` via novo método `forceFlush()` que: (1) verifica `status === 'capturing'` e `inFlight === false`, (2) envia IPC novo `ALWAYS_LISTENING_FORCE_FLUSH` ao renderer, (3) renderer chama `vadSession.requestSpeechEnd()` ou `vadSession.processAudio(silence)` para fechar a janela. Detalhe técnico em `## Architecture Patterns › Pattern 3` |

## Standard Stack

### Core (todos já instalados — versões verificadas em `apps/desktop/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `electron` | 41.1.1 | Runtime, `ipcMain`/`globalShortcut`/`BrowserWindow` | Já em produção. `ipcMain` builtin extends EventEmitter — provê `removeListener`, `listenerCount`, `eventNames` para os race tests [VERIFIED: codebase grep + `ptt-hotkey.ts` usage]. |
| `electron-store` | 11.x | Persistência de modo + hotkey | Versão 11 já em uso, `getPttHotkey()` lê config v1.7 sem migração [VERIFIED: `store.ts:62-68`]. |
| `vitest` | ^4.1.2 | Test runner para race tests | Suporte nativo a `vi.fn()`, `vi.useFakeTimers()`, `vi.waitFor()`. Pattern de mock de `electron` já validado em `voiceMode/alwaysListening.test.ts:33-62` (vi.hoisted) [VERIFIED: package.json + tests passando]. |
| Node.js `events` | builtin | EventEmitter para `pttHotkeyEmitter` recomendado | Já usado em `VoiceModeManager extends EventEmitter` (`voiceMode/index.ts:90`). Sem dep nova [VERIFIED: codebase]. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/node` | ^22 | Tipos do `EventEmitter` | Já presente. Tipo `import { EventEmitter } from 'events'` [VERIFIED: `voiceMode/index.ts:12`]. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `EventEmitter` builtin para fan-out de `ptt:action` | `ipcMain.emit('ptt:action', ...)` (dual-cast no `ptt-hotkey.ts`) | `ipcMain.emit()` funciona mas é não-idiomático (`ipcMain` é para IPC main↔renderer). EventEmitter dedicado é mais explícito sobre "este é um bus interno main-side". Strategies subscrevem com `pttHotkeyEmitter.on('toggle', ...)`. |
| Strategy registra `globalShortcut` direto | Mantém ownership único em `ptt-hotkey.ts` (D-03) | D-03 já travou esta decisão — sem trade-off para revisitar. |
| Toggle via `globalShortcut` | `uIOhook` para press-and-hold real | D-01 já decidiu: toggle. Native modules deferidos. |

**Installation:** Nada a instalar. Todas as deps já em `apps/desktop/package.json`.

**Version verification:**
```bash
# Já verificado no contexto da sessão:
# electron 41.1.1, electron-store 11.0.2, vitest 4.1.2 — confirmado em package.json
```

## Project Constraints (from CLAUDE.md)

> Os trechos abaixo são extraídos de `/root/jarvis/CLAUDE.md` e devem ser respeitados pelo planner.

- **Stack do projeto principal é Python 3.10+ com LangChain/LangGraph** — `apps/desktop` é o subprojeto Electron/TypeScript do JARVIS desktop client. CLAUDE.md confirma o stack desktop é TypeScript/Electron — esta phase não toca Python.
- **Multiplataforma:** código OS-específico isolado. PTT toggle (D-01) é a única solução cross-platform para Electron 41 sem native module — alinha com a constraint.
- **Privacidade:** PTT-only mode é o mais privacy-friendly (mic só ativo durante toggle). Sem mudanças de surface.
- **Sem UI obrigatória:** PTT-only deve funcionar 100% via tray menu + hotkey, sem dependência de janelas. Estado atual já satisfaz.
- **GSD Workflow Enforcement:** todas as edições devem partir de `/gsd:execute-phase` (esta phase) — direct edits proibidos fora do GSD flow.
- **Git commits:** Conventional Commits + emoji em pt-BR (`✨ feat(43-ptt): adicionar PttOnlyStrategy`). Não incluir `Co-Authored-By: Claude` ou `🤖 Generated with`.

## Architecture Patterns

### Recommended Project Structure (apenas adições — nada renomeado)

```
apps/desktop/src/main/
├── voiceMode/
│   ├── index.ts                            # MODIFICADO: D-04 plano B + factory ref
│   └── strategies/
│       ├── alwaysListening.ts              # MODIFICADO: + listener 'ptt:action' + forceFlush()
│       └── pttOnly.ts                      # NOVO: PttOnlyStrategy (espelha alwaysListening.ts)
├── ptt-hotkey.ts                           # MODIFICADO: + export pttHotkeyEmitter (EventEmitter)
└── __tests__/
    ├── voiceMode.test.ts                   # MODIFICADO: + testes D-04 plano B
    ├── voiceMode.race.test.ts              # NOVO: D-05 race tests (3 cenários)
    └── voiceMode/
        ├── alwaysListening.test.ts         # MODIFICADO: + testes force-flush + 'ptt:action' listener
        └── pttOnly.test.ts                 # NOVO: lifecycle, IPC subscribe/unsubscribe, idempotência
```

### Pattern 1: Strategy Skeleton (PttOnlyStrategy — espelha AlwaysListeningStrategy)

**What:** Implementação concreta de `VoiceCaptureStrategy` para PTT-only mode.

**When to use:** Sempre — é a unidade de captura para o modo PTT-only. Constructor recebe deps via DI (mainWindow + voiceHandlerDeps), expostos por uma factory builder análoga a `createAlwaysListeningFactory`.

**Source:** Padrão extraído de `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts:71-189` [VERIFIED: codebase].

**Skeleton:**

```typescript
// apps/desktop/src/main/voiceMode/strategies/pttOnly.ts
import { type BrowserWindow } from 'electron';
import type { VoiceCaptureStrategy } from '../index.js';
import { pttHotkeyEmitter, type PttAction } from '../../ptt-hotkey.js'; // NEW export

export interface PttOnlyStrategyDeps {
  mainWindow: BrowserWindow;
  // VPTT-01: precisa pausar o useWakeWord do renderer durante PTT-only.
  // Estratégia recomendada: send IPC dedicado VOICE_MODE_PTT_ACTIVE para o
  // renderer setar wakeWordPaused via wakeWord:pause-toggle pattern.
}

const PTT_ONLY_RENDERER_ACTIVATE = 'ptt-only:active';

export class PttOnlyStrategy implements VoiceCaptureStrategy {
  private status: 'idle' | 'capturing' | 'processing' = 'idle';
  // CRITICAL: stable reference — pttHotkeyEmitter.off precisa do mesmo callback ref
  private toggleListener: ((action: PttAction) => void) | null = null;

  constructor(private readonly deps: PttOnlyStrategyDeps) {}

  async start(): Promise<void> {
    if (this.status !== 'idle') return; // idempotência defensiva (mesmo padrão alwaysListening:89)

    // VPTT-01: pausa o wake word loop no renderer.
    if (!this.deps.mainWindow.isDestroyed()) {
      this.deps.mainWindow.webContents.send(PTT_ONLY_RENDERER_ACTIVATE, true);
    }

    // D-03: stable reference para off()
    this.toggleListener = (_action: PttAction) => {
      // PTT-only: NÃO precisa fazer nada main-side. O renderer (ChatInput.tsx)
      // já consome o webContents.send('ptt:action', 'toggle') que o
      // ptt-hotkey.ts dispara — usa voiceInputManager.acquire('ptt') +
      // useAudioRecorder + sendAudioAndHandle.
      //
      // No entanto, registramos o listener em pttHotkeyEmitter para:
      //  (a) Garantir que o ipcMain.listenerCount('ptt:action') seja >= 1
      //      durante PTT-only — verificado pelo race test (D-05).
      //  (b) Permitir adicionar lógica futura (e.g., logs, telemetry).
      // Por enquanto, listener é no-op com console.debug.
      console.debug('[PttOnlyStrategy] ptt:action received (renderer handles mic)');
    };
    pttHotkeyEmitter.on('toggle', this.toggleListener);

    this.status = 'capturing'; // Em PTT-only, "capturing" = pronto para receber toggle
  }

  async stop(): Promise<void> {
    if (this.status === 'idle' && !this.toggleListener) return; // idempotente

    this.status = 'idle';

    // CRITICAL: remoção com mesma referência (T-43-LEAK)
    if (this.toggleListener) {
      pttHotkeyEmitter.off('toggle', this.toggleListener);
      this.toggleListener = null;
    }

    // Re-ativa wake word no renderer
    if (!this.deps.mainWindow.isDestroyed()) {
      this.deps.mainWindow.webContents.send(PTT_ONLY_RENDERER_ACTIVATE, false);
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
    // Strategy descartada — sem state extra para limpar.
  }

  getStatus(): 'idle' | 'capturing' | 'processing' {
    return this.status;
  }
}

export function createPttOnlyFactory(deps: PttOnlyStrategyDeps): () => PttOnlyStrategy {
  return () => new PttOnlyStrategy(deps);
}
```

### Pattern 2: PTT Hotkey EventEmitter Bus (resolve D-03 ambiguity)

**What:** Adicionar um `EventEmitter` builtin exportado de `ptt-hotkey.ts` para fan-out main-side. Manter o `webContents.send('ptt:action', 'toggle')` ao renderer **inalterado** — garantia de zero impacto no `ChatInput.tsx` que já funciona.

**Why this solves D-03:** O CONTEXT.md em D-03 diz "strategies adicionam `ipcMain.on('ptt:action', ...)`" — mas `ptt:action` HOJE é main→renderer, não interno. Tentar `ipcMain.on('ptt:action', ...)` retornaria zero callbacks porque ninguém faz `ipcRenderer.send('ptt:action', ...)`. A solução mais limpa é um EventEmitter dedicado:

**Source:** Padrão `EventEmitter extends` já em uso em `VoiceModeManager` (`voiceMode/index.ts:90`) [VERIFIED: codebase].

```typescript
// apps/desktop/src/main/ptt-hotkey.ts (modificações)
import { EventEmitter } from 'events';
import { globalShortcut, BrowserWindow } from 'electron';
import { getPttHotkey, setPttHotkey } from './store';

export type PttAction = 'toggle';

/**
 * pttHotkeyEmitter — bus interno main-side para fan-out do evento 'toggle'.
 *
 * Strategies (AlwaysListeningStrategy + PttOnlyStrategy) subscrevem em
 * start() e desinscrevem em dispose(). WakeWordStrategy não subscreve.
 *
 * O webContents.send('ptt:action', 'toggle') ao renderer continua disparando
 * em paralelo — ChatInput.tsx é o consumer principal (PTT-only mic ownership).
 */
export const pttHotkeyEmitter = new EventEmitter();
pttHotkeyEmitter.setMaxListeners(5); // 3 strategies + folga para tests/dev

let currentPttHotkey: string | null = null;

export function registerPttHotkey(mainWindow: BrowserWindow): boolean {
  const accelerator = getPttHotkey();
  const success = globalShortcut.register(accelerator, () => {
    // Dual-cast:
    //  1. Renderer (ChatInput) — comportamento existente, intocado.
    mainWindow.webContents.send('ptt:action', 'toggle');
    //  2. Main strategies — novo bus emitido após renderer send (ordem
    //     irrelevante; nenhum subscriber depende do outro).
    pttHotkeyEmitter.emit('toggle', 'toggle' as PttAction);
    console.log('[PTT] Toggle event sent (renderer + main bus)');
  });
  // ... resto do código (sem mudanças)
}
```

**Trade-off vs alternativa (`ipcMain.emit`):** `ipcMain.emit('ptt:action', null, 'toggle')` funcionaria (ipcMain é EventEmitter), mas é semanticamente confuso — `ipcMain` é canal IPC entre processos, não bus interno. EventEmitter dedicado é explícito.

### Pattern 3: VPTT-03 Force-flush em AlwaysListeningStrategy

**What:** Estender `AlwaysListeningStrategy` com um método `forceFlush()` que dispara o fim da utterance VAD via IPC novo, e registrar o listener `pttHotkeyEmitter.on('toggle', () => this.forceFlush())` em `start()`.

**Where:** `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts` (modificação) e `apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts` (handler do IPC novo).

**Source:** Análise de `@ricky0123/vad-web 0.0.30` MicVAD API (`AlwaysListeningEngine.ts:171-213` confirmou que `vadSession.setOptions()` está disponível) [VERIFIED: codebase].

**Implementation outline:**

```typescript
// alwaysListening.ts — adições
const ALWAYS_LISTENING_FORCE_FLUSH = 'always-listening:force-flush'; // main → renderer

export class AlwaysListeningStrategy implements VoiceCaptureStrategy {
  private toggleListener: ((action: PttAction) => void) | null = null;
  // ... fields existentes

  async start(): Promise<void> {
    // ... start existente (registra ALWAYS_LISTENING_UTTERANCE listener) ...

    // NEW: D-02 force-flush via PTT hotkey
    this.toggleListener = () => this.forceFlush();
    pttHotkeyEmitter.on('toggle', this.toggleListener);
  }

  /**
   * forceFlush — VPTT-03: dispara fim da utterance imediatamente.
   *
   * Comportamento por estado (D-02):
   *  - 'capturing' com samples > 0 → envia IPC para renderer fechar a utterance
   *  - 'capturing' com 0 samples → no-op silencioso
   *  - 'idle' → no-op silencioso
   *  - 'processing' → no-op silencioso (já processando — duplicação inútil)
   *
   * O renderer (AlwaysListeningEngine) recebe o IPC e chama
   * vadSession.requestSpeechEnd() OU empacota o áudio acumulado e chama
   * onSpeechEnd manualmente. (Nota: requestSpeechEnd não existe em vad-web
   * 0.0.30 — solução real provavelmente via processAudio com janela de
   * silêncio injetada. Pesquisar API exata na implementação.)
   */
  forceFlush(): void {
    if (this.status !== 'capturing') {
      return; // idle/processing → no-op silencioso (D-02)
    }
    if (this.inFlight) {
      return; // processing detectado por inFlight também → no-op
    }

    if (!this.deps.mainWindow.isDestroyed()) {
      this.deps.mainWindow.webContents.send(ALWAYS_LISTENING_FORCE_FLUSH);
    }
    // O renderer decide se há samples > 0 (no-op silencioso fica nesse lado).
    // Strategy só comanda — verificação de "0 samples" é responsabilidade do
    // engine que tem visibilidade do ring buffer + VAD state.
  }

  async stop(): Promise<void> {
    // ... stop existente (remove ALWAYS_LISTENING_UTTERANCE listener) ...

    // NEW: remove force-flush listener com mesma referência (T-43-LEAK)
    if (this.toggleListener) {
      pttHotkeyEmitter.off('toggle', this.toggleListener);
      this.toggleListener = null;
    }
  }
}
```

**Renderer handler:** `AlwaysListeningEngine` precisa expor método `forceFlushUtterance()` e o hook que monta o engine deve subscrever `window.jarvis.ipcRenderer.on(ALWAYS_LISTENING_FORCE_FLUSH, ...)`. Esse hook não existe ainda (gap conhecida da Phase 40 — ver `## Common Pitfalls › Pitfall 4`).

### Pattern 4: D-04 Plano B (recovery em catch)

**What:** Reescrever o `try/catch` em `setMode()` para, quando a factory nova lança, re-instanciar a strategy antiga via factory dela e dar `start()`. Manter `transitioning=true` durante recovery (atomicidade — recomendação Claude's Discretion).

**Source:** `voiceMode/index.ts:175-245` (estrutura atual a modificar) + `notes/phase-43-dispose-before-factory.md` (root cause + opção B endossada por D-04).

```typescript
// voiceMode/index.ts — setMode() reescrito (extrato)
async setMode(newMode: VoiceMode, reason: 'user' | 'system' = 'user'): Promise<boolean> {
  if (newMode === this.currentMode) return false;
  if (this.transitioning) {
    console.warn(`[VoiceModeManager] setMode('${newMode}') blocked — transition in progress`);
    return false;
  }

  this.transitioning = true;
  const oldMode = this.currentMode;
  // D-04: guarda factory antiga ANTES do dispose para usar no recovery se necessário
  const oldFactory = this.strategyFactories.get(oldMode);

  try {
    // 1. Dispose da antiga (mesmo comportamento atual)
    if (this.activeStrategy) {
      await this.activeStrategy.dispose();
      this.activeStrategy = null;
    }

    // 2. Tenta factory nova
    const newFactory = this.strategyFactories.get(newMode);
    if (!newFactory) {
      console.warn(`[VoiceModeManager] setMode('${newMode}') — no factory registered`);
      // D-04: tenta restaurar antiga
      await this.restorePreviousStrategy(oldMode, oldFactory);
      return false;
    }

    try {
      this.activeStrategy = newFactory();
      await this.activeStrategy.start();
    } catch (err) {
      console.warn(
        `[VoiceModeManager] setMode() — Strategy not ready for mode '${newMode}':`,
        err instanceof Error ? err.message : err,
      );
      this.activeStrategy = null;
      // D-04 PLANO B: re-instancia antiga
      await this.restorePreviousStrategy(oldMode, oldFactory);
      return false;
    }

    // 3. Sucesso — persiste + emite event
    this.currentMode = newMode;
    setVoiceMode(newMode);
    const event: VoiceModeChangeEvent = { oldMode, newMode, reason, timestamp: Date.now() };
    this.emit('voiceMode:change', event);
    console.log(`[VoiceModeManager] Mode changed: ${oldMode} → ${newMode} (reason: ${reason})`);
    return true;
  } finally {
    this.transitioning = false; // (mantido: atomicidade do switch inteiro)
  }
}

/**
 * D-04 Plano B helper: re-instancia a strategy do oldMode quando a nova falha.
 * Se a re-instanciação TAMBÉM falhar, sistema entra em estado degradado:
 * currentMode = null, activeStrategy = null. Logado como erro crítico.
 */
private async restorePreviousStrategy(
  oldMode: VoiceMode,
  oldFactory: (() => VoiceCaptureStrategy) | undefined,
): Promise<void> {
  if (!oldFactory) {
    // Não conseguimos restaurar sem factory — fallback de último caso (D-04)
    console.error(
      `[VoiceModeManager] D-04 fallback: no factory for previous mode '${oldMode}' — entering null state`,
    );
    this.currentMode = null as unknown as VoiceMode; // intencional — tipo será refinado para `VoiceMode | null`
    this.activeStrategy = null;
    return;
  }

  try {
    this.activeStrategy = oldFactory();
    await this.activeStrategy.start();
    // currentMode permanece oldMode (não tocamos)
    console.log(`[VoiceModeManager] D-04 recovery: restored '${oldMode}' after factory failure`);
  } catch (recoveryErr) {
    console.error(
      `[VoiceModeManager] D-04 fallback: recovery for '${oldMode}' also failed:`,
      recoveryErr instanceof Error ? recoveryErr.message : recoveryErr,
    );
    this.currentMode = null as unknown as VoiceMode;
    this.activeStrategy = null;
  }
}
```

**Tipagem refinada (recomendação):** Mudar `currentMode: VoiceMode` para `currentMode: VoiceMode | null` em `voiceMode/index.ts:91`. Atualizar `getMode()` retorno para `VoiceMode | null`. Caller `tray.ts:86` (`option.mode === currentMode`) já se comporta corretamente com `null` (radio sem `checked`). Plan deve incluir essa refatoração de tipo.

### Anti-Patterns to Avoid

- **`pttHotkeyEmitter.on('toggle', () => this.forceFlush())` (arrow inline em start):** Sem referência estável, `off()` em `stop()` não consegue remover o listener — vazamento garantido. Sempre guardar `this.toggleListener` como field [VERIFIED: pattern de `alwaysListening.ts:96-99`].
- **`ipcMain.removeAllListeners('ptt:action')`:** Em ambientes de teste compartilhados ou se houver outro listener legítimo (e.g., dev tools), remove demais. Sempre `off()` com referência específica.
- **Não esperar `dispose()` antes de instanciar nova strategy:** Era o pattern atual (`voiceMode/index.ts:191-216`) — funciona apenas porque `await activeStrategy.dispose()` é serial. D-04 mantém essa ordem mas adiciona recovery em catch — não inverter para "factory primeiro" (opção A do note) sem renegociar D-04.
- **`getStatus() !== 'idle'` como gate em setMode:** REMOVIDO no Phase 41 Plan 03 — não reintroduzir por nenhum motivo. O `transitioning` flag é o único guard correto.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Press-and-hold detection | Custom Win/Mac/Linux native code, polling timer | Toggle (D-01) | Limitação Electron — uIOhook é deferido (V2). Forçar implementação custom = acessibilidade quebrada em macOS, Wayland issues. |
| Hotkey conflict resolver | Inspeção de tabela do OS | `globalShortcut.register()` retorno boolean | Electron já trata nativamente — false = conflito, log warning. Pattern em `ptt-hotkey.ts:46-50`. |
| EventEmitter "limit" management | `setMaxListeners(Infinity)` | Cap explícito (5–20) | Limite default 10 do Node serve como detector de leak. `voiceMode/index.ts:107` usa 20; `pttHotkeyEmitter` recomendado 5. |
| Mock de `ipcMain` para testes | Stub artesanal | `vi.hoisted` + `vi.mock('electron', ...)` | Pattern já validado em `__tests__/voiceMode/alwaysListening.test.ts:33-62`. Capturar listeners em array para asserções. |
| State machine "atômica" custom | Locks, semáforos, mutexes | `transitioning` boolean flag (já existe) | JS é single-threaded; flag + early return é suficiente. Adicionar mutex = over-engineering. |
| Mic ownership coordenação main-side | Lógica em `PttOnlyStrategy` | Renderer `voiceInputManager.acquire('ptt')` + IPC `ptt:action` existente | Pattern Phase 22 Plan 01 já resolveu. Strategy só sinaliza wakeWord pause via IPC dedicado. |

**Key insight:** A 90% do código novo da Phase 43 é **glue + lifecycle management** sobre infraestrutura já feita (Phase 22 mic ownership, Phase 39 state machine, Phase 40 strategy pattern, Phase 41 IPC). Toda invenção arquitetural é red flag.

## Runtime State Inventory

> Phase 43 é uma phase de adição de comportamento — pequeno ângulo de mudança em runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `electron-store` campo `voiceMode` (já em uso desde Phase 39 — D-07). Sem novo campo. | Nenhum — `setVoiceMode('ptt-only')` já funciona. |
| Live service config | Nenhum. PTT hotkey é registrada in-process via `globalShortcut.register()` em cada startup; sem persistência externa. | Nenhum. |
| OS-registered state | `globalShortcut` Windows/Linux/macOS registra a hotkey no OS enquanto app rodando — auto-unregister em `app.before-quit` via `unregisterPttHotkey()` (`main/index.ts:316`). | Verificar que comportamento atual permanece. Sem novo OS state. |
| Secrets/env vars | Nenhum. | Nenhum. |
| Build artifacts | TypeScript compila para `apps/desktop/out/`. Novo arquivo `pttOnly.ts` será compilado naturalmente. | Nenhum — `electron-vite` rebuilda em dev/prod. |

**Nothing else found:** Confirmado — esta é uma phase puramente de código TypeScript, sem migrações de dados ou config externa.

## Common Pitfalls

### Pitfall 1: Listener leak por arrow function inline

**What goes wrong:** `pttHotkeyEmitter.on('toggle', () => this.forceFlush())` cria nova função a cada chamada de `start()`. `dispose()` chama `off('toggle', this.someRef)` que não existe — listener fica vivo, próximo mode switch acumula outro. `listenerCount` cresce indefinidamente; force-flush dispara N vezes para uma única hotkey.

**Why it happens:** EventEmitter `off()` (alias para `removeListener`) usa **referência estrita** para identificar o listener. Arrow function inline gera nova closure cada vez.

**How to avoid:** Pattern já em `alwaysListening.ts:75-77,96-99,170`:
```typescript
private toggleListener: ((a: PttAction) => void) | null = null;
// start():
this.toggleListener = (action) => this.forceFlush();
pttHotkeyEmitter.on('toggle', this.toggleListener);
// dispose() / stop():
if (this.toggleListener) {
  pttHotkeyEmitter.off('toggle', this.toggleListener);
  this.toggleListener = null;
}
```

**Warning signs:**
- `pttHotkeyEmitter.listenerCount('toggle') > 1` após uma única strategy ativa
- Force-flush dispara múltiplas vezes para um único toggle
- Console warning `MaxListenersExceededWarning` após várias trocas de modo

### Pitfall 2: Race entre dispose() antiga e factory() nova com efeitos colaterais

**What goes wrong:** `dispose()` da Phase 40 strategy chama `webContents.send(ALWAYS_LISTENING_STOP)` ao renderer (`alwaysListening.ts:177`). Se a factory da nova falha imediatamente após o send mas antes do recovery (D-04), o renderer já parou — recovery re-instancia AlwaysListeningStrategy, que envia `ALWAYS_LISTENING_START` de novo. Renderer pode receber stop+start em sequência ultra-rápida e perder a re-inicialização.

**Why it happens:** `dispose()` da strategy é fire-and-forget para o renderer (best-effort). Recovery + `start()` da nova instância da mesma classe envia novo IPC. Renderer pode estar em estado intermediário (engine stopped, mic não-released ainda).

**How to avoid:**
- Garantir que `start()` é idempotente no renderer também — engine deve fazer cleanup antes de start (já validado em `AlwaysListeningEngine.ts:143-146`).
- Validar via teste de race que após plano B, AlwaysListeningEngine está em estado funcional (cenário 3 do D-05).

**Warning signs:**
- AlwaysListening "morto" após uma falha de mode switch — engine no renderer parado mas main acha que está rodando
- `getStatus()` retorna `capturing` mas nenhuma utterance chega

### Pitfall 3: `pttHotkeyEmitter` global sobrevive entre testes

**What goes wrong:** EventEmitter declarado em module scope (`export const pttHotkeyEmitter = ...`) compartilha state entre suites de teste. Se teste A registra um listener e não limpa, teste B vê resíduo. Race tests (cenário 1: `listenerCount ≤ 1`) falham por motivo errado.

**Why it happens:** Vitest reseta `vi.fn()` entre testes mas não modules — singletons vivem.

**How to avoid:**
- Adicionar test helper `__resetPttHotkeyEmitterForTests()` em `ptt-hotkey.ts` (pattern espelhando `voiceInputManager.ts:125-129`):
```typescript
export function __resetPttHotkeyEmitterForTests(): void {
  pttHotkeyEmitter.removeAllListeners();
}
```
- Chamar em `beforeEach` dos race tests.
- **Importante:** mocking `electron` via `vi.mock` (pattern em `voiceMode/alwaysListening.test.ts:39`) NÃO mockaria o `pttHotkeyEmitter` (vive em `ptt-hotkey.ts`, não `electron`). É um module-real exportado.

**Warning signs:**
- Tests pass individualmente, falham em suite
- `listenerCount` começa > 0 sem chamar nenhum strategy.start()

### Pitfall 4: Renderer não tem handler para ALWAYS_LISTENING_START

**What goes wrong:** Confirmado por grep no codebase: o renderer **não tem** `ipcRenderer.on(ALWAYS_LISTENING_START, ...)` em lugar nenhum (`/root/jarvis/apps/desktop/src/renderer/`). `AlwaysListeningStrategy.start()` envia o IPC, mas ninguém está escutando — `AlwaysListeningEngine` é instanciado em código que não foi wireado a um hook React (Phase 40 deixou esse gap conhecido).

**Why it happens:** Phase 40 implementou main + engine renderer, mas o "elo" — um `useAlwaysListening()` hook análogo a `useWakeWord()` — não foi criado. Confirmado por `ls /root/jarvis/apps/desktop/src/renderer/hooks/` mostrando apenas `useAudioRecorder.ts`, `useMultiTurnWindow.ts`, `useWakeWord.ts`.

**How to avoid (relevante para Phase 43):**
- O force-flush IPC (Pattern 3 acima) tem o mesmo problema — vai trafegar para um renderer sem listener.
- **Recomendação para o planner:** criar `useAlwaysListening` hook como **prerequisite** dentro da Phase 43 (small bridge), OU declarar explicitamente que VPTT-03 é "fire IPC, no-op se renderer não escuta" e mover o renderer wiring para uma quick task / Phase futura.
- Risco se ignorado: VPTT-03 verde no main mas inerte na prática.

**Warning signs:**
- `webContents.send` retorna sem erro mas nada acontece visualmente
- VAD continua esperando silence threshold mesmo após force-flush

### Pitfall 5: D-04 fallback faz currentMode = null, mas tipo é `VoiceMode`

**What goes wrong:** D-04 diz "fallback de último caso: log + currentMode = null". O tipo atual `currentMode: VoiceMode` (`voiceMode/index.ts:91`) não permite null sem cast. Casting força runtime hazards (consumers como `tray.ts:86` fazem `option.mode === currentMode` que retorna `false` para todos — radio sem checkmark = ok visualmente, mas se algum caller fizer `currentMode.toUpperCase()` quebra).

**Why it happens:** Type system não ajuda quando o domínio agora inclui um estado degradado.

**How to avoid:**
- Refatorar tipo: `currentMode: VoiceMode | null` em `VoiceModeManager`.
- `getMode(): VoiceMode | null` — atualizar callers em `tray.ts:75` (label) e em `ipc/voiceMode.ts` se necessário.
- Adicionar guard explícito: se `currentMode === null`, próximo `setMode` é "tentativa de saída do estado degradado" — nunca retornar `false` por "newMode === currentMode" quando currentMode é null.

**Warning signs:**
- TypeScript erro `Type 'null' is not assignable to type 'VoiceMode'` no setMode
- Tray submenu sem nenhum radio marcado depois de plano B-fallback

## Code Examples

### Example 1: Race test — cenário 2 (concurrent setMode via Promise.all)

**Source:** Padrão extraído de `voiceMode.test.ts:272-305` (race condition guard test) [VERIFIED: codebase].

```typescript
// apps/desktop/src/main/__tests__/voiceMode.race.test.ts (excerpt)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceModeManager } from '../voiceMode';
import { pttHotkeyEmitter, __resetPttHotkeyEmitterForTests } from '../ptt-hotkey';

vi.mock('electron-store', () => { /* same pattern as voiceMode.test.ts:13-23 */ });
vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), off: vi.fn(), once: vi.fn() },
  BrowserWindow: vi.fn(() => ({ isDestroyed: () => false, webContents: { send: vi.fn() } })),
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
}));

function makeStrategy(label: string) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue('idle' as const),
  };
}

describe('Voice Mode Race Conditions (D-05)', () => {
  beforeEach(() => {
    __resetPttHotkeyEmitterForTests();
  });

  it('cenário 2: 5 setMode concorrentes → guard rejeita extras, estado consistente', async () => {
    const ww = makeStrategy('ww');
    const al = makeStrategy('al');
    const ptt = makeStrategy('ptt');

    const manager = new VoiceModeManager({
      'wake-word': () => ww,
      'always-listening': () => al,
      'ptt-only': () => ptt,
    });
    await manager.init(); // currentMode = 'wake-word'

    const results = await Promise.all([
      manager.setMode('always-listening'),
      manager.setMode('ptt-only'),
      manager.setMode('wake-word'),
      manager.setMode('always-listening'),
      manager.setMode('ptt-only'),
    ]);

    // Apenas a primeira (que não é same-mode) entra no try block; outras
    // veem transitioning=true e retornam false.
    const successCount = results.filter((r) => r === true).length;
    expect(successCount).toBe(1);

    // Estado final == primeira que conseguiu entrar
    expect(manager.getMode()).toBe('always-listening');

    // Listener leak guard: pttHotkeyEmitter listenerCount ≤ 1 (só AL ativa subscreve)
    expect(pttHotkeyEmitter.listenerCount('toggle')).toBeLessThanOrEqual(1);
  });
});
```

### Example 2: D-04 plano B test (cenário 3)

```typescript
it('cenário 3: nova factory falha → strategy antiga é re-instanciada e ativa', async () => {
  let pttFactoryCallCount = 0;
  const wwInitial = makeStrategy('ww-initial');
  const wwRecovered = makeStrategy('ww-recovered');
  // PTT factory falha NA PRIMEIRA chamada apenas
  const failingPttFactory = vi.fn().mockImplementation(() => {
    pttFactoryCallCount++;
    if (pttFactoryCallCount === 1) {
      throw new Error('PttOnlyStrategy not yet ready');
    }
    return makeStrategy('ptt-late');
  });

  // WakeWord factory: primeira chamada retorna wwInitial (init), segunda retorna wwRecovered (recovery)
  let wwFactoryCallCount = 0;
  const wwFactory = vi.fn().mockImplementation(() => {
    wwFactoryCallCount++;
    return wwFactoryCallCount === 1 ? wwInitial : wwRecovered;
  });

  const manager = new VoiceModeManager({
    'wake-word': wwFactory,
    'ptt-only': failingPttFactory,
  });
  await manager.init();

  const result = await manager.setMode('ptt-only');

  expect(result).toBe(false); // mode change failed
  expect(manager.getMode()).toBe('wake-word'); // stayed in old mode
  expect(wwFactory).toHaveBeenCalledTimes(2); // init + recovery
  expect(wwInitial.dispose).toHaveBeenCalledOnce();
  expect(wwRecovered.start).toHaveBeenCalledOnce(); // recovery started new instance
});
```

### Example 3: VPTT-03 force-flush listener subscription test

```typescript
// apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts (additions)
it('VPTT-03: subscreve pttHotkeyEmitter "toggle" em start()', async () => {
  const strategy = new AlwaysListeningStrategy(makeStrategyDeps());

  expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
  await strategy.start();
  expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(1);

  await strategy.dispose();
  expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
});

it('VPTT-03: forceFlush é no-op silencioso quando status é idle', () => {
  const deps = makeStrategyDeps();
  const strategy = new AlwaysListeningStrategy(deps);
  // Sem start(), status === 'idle'
  strategy.forceFlush();
  expect(deps.mainWindow.webContents.send).not.toHaveBeenCalledWith(
    'always-listening:force-flush'
  );
});

it('VPTT-03: forceFlush envia IPC quando status é capturing', async () => {
  const deps = makeStrategyDeps();
  const strategy = new AlwaysListeningStrategy(deps);
  await strategy.start(); // status -> capturing
  deps.mainWindow.webContents.send.mockClear(); // limpa o ALWAYS_LISTENING_START

  strategy.forceFlush();

  expect(deps.mainWindow.webContents.send).toHaveBeenCalledWith(
    'always-listening:force-flush'
  );
});
```

### Example 4: PttOnlyStrategy lifecycle test

```typescript
// apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts
describe('PttOnlyStrategy (Phase 43, VPTT-01)', () => {
  beforeEach(() => __resetPttHotkeyEmitterForTests());

  it('start() pausa wake word no renderer + subscreve toggle listener', async () => {
    const deps = makePttDeps();
    const strategy = new PttOnlyStrategy(deps);

    await strategy.start();

    expect(deps.mainWindow.webContents.send).toHaveBeenCalledWith('ptt-only:active', true);
    expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(1);
    expect(strategy.getStatus()).toBe('capturing');
  });

  it('dispose() é idempotente — chamada dupla não vaza', async () => {
    const strategy = new PttOnlyStrategy(makePttDeps());
    await strategy.start();
    await strategy.dispose();
    await strategy.dispose(); // segunda
    expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getStatus() !== 'idle'` gate em setMode | Apenas `transitioning` flag | Phase 41 Plan 03 (`8c98c8e`) | Mode switch durante captura ativa funciona — pré-condição da Phase 43. |
| `dispose()` antiga sem recovery em catch | Plano B re-instancia antiga | Phase 43 D-04 (este plano) | Eliminação de estado zumbi reportado em `notes/phase-43-dispose-before-factory.md`. |
| Strategy registra `globalShortcut` direto | `ptt-hotkey.ts` é registrador único, strategies subscrevem bus | Phase 43 D-03 | Evita race "duas strategies registrando a mesma hotkey simultaneamente" e simplifica VPTT-02 (reusa hotkey v1.7). |
| `ptt:action` apenas main→renderer | Dual-cast: `webContents.send` (renderer) + `pttHotkeyEmitter.emit` (main bus) | Phase 43 (deste research) | Permite força-flush em AL e listener PTT-only main-side sem quebrar `ChatInput.tsx`. |

**Deprecated/outdated:** N/A para esta phase — todos os patterns são novos ou consolidam práticas vigentes.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest 4.1.2` |
| Config file | `apps/desktop/vitest.config.ts` (presumido — confirmar no Wave 0) |
| Quick run command | `pnpm --filter @jarvis/desktop vitest run src/main/__tests__/voiceMode.test.ts src/main/__tests__/voiceMode.race.test.ts src/main/__tests__/voiceMode/pttOnly.test.ts src/main/__tests__/voiceMode/alwaysListening.test.ts --no-coverage` |
| Full suite command | `pnpm --filter @jarvis/desktop vitest run --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| VPTT-01 | PTT-only mode ativa + wake word desabilitado no renderer | unit | `pnpm vitest run src/main/__tests__/voiceMode/pttOnly.test.ts -t "pausa wake word" --no-coverage` | ❌ Wave 0 |
| VPTT-01 | PTT-only listener removido em dispose (sem leak) | unit | `pnpm vitest run src/main/__tests__/voiceMode/pttOnly.test.ts -t "dispose() é idempotente" --no-coverage` | ❌ Wave 0 |
| VPTT-02 | PTT-only reusa hotkey existente (sem modificação em ptt-hotkey.ts) | unit | `pnpm vitest run src/main/__tests__/ptt-hotkey.test.ts --no-coverage` (suite existente; assertion adicional para `pttHotkeyEmitter.emit`) | ✅ existente |
| VPTT-03 | Force-flush dispara IPC quando capturing+samples>0 | unit | `pnpm vitest run src/main/__tests__/voiceMode/alwaysListening.test.ts -t "forceFlush" --no-coverage` | ⚠️ existente, precisa adições |
| VPTT-03 | Force-flush no-op em idle/processing | unit | mesmo arquivo, `-t "no-op silencioso"` | ⚠️ existente, precisa adições |
| D-04 | Plano B em catch — strategy antiga restaurada | integration | `pnpm vitest run src/main/__tests__/voiceMode.race.test.ts -t "cenário 3" --no-coverage` | ❌ Wave 0 |
| D-05 cenário 1 | 5 trocas sequenciais sem listener leak | integration | `pnpm vitest run src/main/__tests__/voiceMode.race.test.ts -t "cenário 1" --no-coverage` | ❌ Wave 0 |
| D-05 cenário 2 | Promise.all([5]) → guard serializa | integration | `pnpm vitest run src/main/__tests__/voiceMode.race.test.ts -t "cenário 2" --no-coverage` | ❌ Wave 0 |
| D-05 cenário 3 | Plano B sob race | integration | mesmo arquivo, "cenário 3" | ❌ Wave 0 |
| Existing | Phase 41 gap closure não regrediu (transitioning guard mantido) | unit | `pnpm vitest run src/main/__tests__/voiceMode.test.ts --no-coverage` | ✅ existente, deve permanecer 18/18 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @jarvis/desktop vitest run src/main/__tests__/voiceMode --no-coverage` (~10s, cobre alvos diretos da phase)
- **Per wave merge:** `pnpm --filter @jarvis/desktop vitest run src/main/__tests__/ src/main/__tests__/voiceMode/ --no-coverage` (~30s, cobre tray, ipc, hotkey)
- **Phase gate:** Full suite verde antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/__tests__/voiceMode.race.test.ts` — D-05 (3 cenários)
- [ ] `apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts` — VPTT-01 lifecycle
- [ ] Test helper `__resetPttHotkeyEmitterForTests()` em `ptt-hotkey.ts` (export apenas para tests, mesmo padrão `voiceInputManager.ts:125`)
- [ ] Adições em `voiceMode/alwaysListening.test.ts` — testes para `forceFlush()` e listener `'toggle'` subscribe/unsubscribe
- [ ] Adições em `voiceMode.test.ts` — testes para D-04 plano B (recovery após factory throw)
- [ ] Confirmar existência de `vitest.config.ts` em `apps/desktop/` (presumido — pesquisar e listar como gap se ausente)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — sem identidade nesta phase |
| V3 Session Management | no | N/A |
| V4 Access Control | yes (low) | `globalShortcut` opera em escopo de usuário do OS — `registerPttHotkey` falha graciosamente se outro app já registrou (pattern em `ptt-hotkey.ts:46-50`) |
| V5 Input Validation | yes | `PttAction` é tipo literal `'toggle'` (`shared/ipc-types.ts:232`); discriminate union previne payloads não-validados |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for Electron main process

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Listener leak via mode switch repetido | DoS | Stable reference + idempotent dispose (Pattern 1 + Pitfall 1). Race test cenário 1 valida `listenerCount ≤ 1`. |
| Hotkey hijacking por app malicioso registrando antes do JARVIS | Spoofing | `globalShortcut.register()` retorno boolean sinaliza falha; UX consistente (warning log). v1.7 pattern. |
| Force-flush DoS (PTT spam) | DoS | `forceFlush` é no-op em `processing` (D-02) — não há fila acumulando. Trabalho síncrono, sem alocação de recurso. |
| Estado zumbi (currentMode aponta a strategy null) | DoS / Tampering | D-04 plano B + fallback `currentMode = null` documentado. Tray UI não quebra (radio sem checked). |
| Race condition em mode switch concorrente | Tampering / DoS | `transitioning` flag mantido durante recovery (Claude's Discretion: atomicidade). D-05 cenário 2 valida. |
| Renderer recebe IPC após dispose (fantasma) | Tampering | `webContents.isDestroyed()` check antes de send (pattern `alwaysListening.ts:105,176`); `ipcMain.off` com referência estável. |

## Sources

### Primary (HIGH confidence)

- `apps/desktop/src/main/voiceMode/index.ts:175-260` [VERIFIED: codebase] — estrutura atual de `VoiceModeManager.setMode()` (alvo da modificação D-04)
- `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts:71-189` [VERIFIED: codebase] — pattern canônico de Strategy (lifecycle, IPC listener, status state machine)
- `apps/desktop/src/main/ptt-hotkey.ts:34-107` [VERIFIED: codebase] — estrutura atual do registrador de globalShortcut
- `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx:122-148` [VERIFIED: codebase] — consumer do `ptt:action` no renderer (PTT mic ownership)
- `apps/desktop/src/main/__tests__/voiceMode.test.ts:272-305` [VERIFIED: codebase] — pattern de race condition test (transitioning guard) com `vi.waitFor`
- `apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts:33-62,238-293` [VERIFIED: codebase] — pattern de mock de `electron` via `vi.hoisted` para tests de Strategy
- `.planning/notes/phase-43-dispose-before-factory.md` [VERIFIED: read] — root cause + endorsement da opção B (D-04)
- `.planning/phases/41-tray-menu-mode-switch-ux/41-03-SUMMARY.md` [VERIFIED: read] — gap closure que removeu `getStatus() !== 'idle'` gate
- `apps/desktop/package.json` [VERIFIED: read] — versões (electron 41.1.1, electron-store 11.0.2, vitest 4.1.2)
- `apps/desktop/src/shared/ipc-types.ts:108-232` [VERIFIED: read] — types canônicos (VoiceMode, PttAction, IPC_CHANNELS)

### Secondary (MEDIUM confidence)

- Node.js `events` builtin — `EventEmitter.on/off/listenerCount/removeAllListeners` é API estável desde Node 0.x. Confirmado por uso atual em `voiceMode/index.ts:90` (`extends EventEmitter`) [CITED: nodejs.org/api/events]
- Electron 41 `globalShortcut` API — sem detecção de keyup confirmada por behavior em `ptt-hotkey.ts` (D-01 já travada nesta limitação) [CITED: electronjs.org/docs/latest/api/global-shortcut]
- `@ricky0123/vad-web 0.0.30` `MicVAD.setOptions()` — VPTT-03 pode usar para shortenar `redemptionMs` temporariamente, ou injetar silêncio via `processAudio`. API exata para "force flush" precisa ser pesquisada na implementação real do hook do renderer (gap conhecida — ver Pitfall 4) [VERIFIED: codebase comment `AlwaysListeningEngine.ts:24`]

### Tertiary (LOW confidence)

- Nada — esta phase é altamente dependente do código existente. Todas as decisões críticas têm verificação direta no codebase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existe `vitest.config.ts` em `apps/desktop/` | Validation Architecture | Wave 0 inclui criação. Listed as gap. |
| A2 | `useAlwaysListening` hook não existe — IPC `ALWAYS_LISTENING_START` chega em renderer sem handler | Pitfall 4 | Confirmado por grep no codebase mas se houver subscribe oculto que não capturei, VPTT-03 pode estar wireado parcialmente. Risco baixo — confirmar antes de planejar bridge hook na Phase 43. |
| A3 | `pttHotkeyEmitter` como EventEmitter dedicado é a melhor solução vs `ipcMain.emit` interno | Pattern 2 | Se usuário preferir `ipcMain.emit` (literalmente o que D-03 disse), o plan inverte: strategies usam `ipcMain.on('ptt:action', listener)` E o `ptt-hotkey.ts` adiciona `ipcMain.emit('ptt:action', null, 'toggle')` ao callback. Funcional mas confuso semanticamente. |
| A4 | `currentMode: VoiceMode \| null` refactor é aceitável | Pitfall 5 | Se o usuário considerar invasivo (touches `tray.ts`, `ipc/voiceMode.ts`), o plan B do fallback pode permanecer com cast e log — aceitar runtime hazard documentado. |
| A5 | Renderer pode pausar `useWakeWord` via novo IPC `ptt-only:active` | Pattern 1 (PttOnlyStrategy skeleton) | Se já houver outro mecanismo para pausa (e.g., `wakeWord:pause-toggle` da Phase 23 D-04), reusar. Pesquisar no Wave 0 — pode evitar IPC novo. Existe `getWakeWordPaused()` em `store.ts:81` e `wakeWord:pause-toggle` em `IPC_CHANNELS:198`, então provavelmente reusamos isso. |
| A6 | "0 samples no AL" detection vive no renderer (no-op silencioso) | Pattern 3 | Strategy main-side comanda; engine renderer aplica D-02 lógica de "0 samples → silencioso". Se preferir verificar no main, precisamos canal RPC main↔renderer para query — mais complexo. Prefer renderer-side check. |

**If user feedback inverte qualquer assumption:** o impacto está localizado — A1/A2/A6 são gaps de implementação (Wave 0 absorve), A3/A4/A5 são tradeoffs de pattern que mudam o diff sem mudar requisitos.

## Open Questions (RESOLVED inline em 43-01-PLAN.md)

> **Status (2026-04-26):** Todas as 4 OQs abaixo foram resolvidas inline no Plan 01 (`<open_questions_resolution>` block). Mantemos as descrições originais aqui para histórico de research; veja `RESOLVED:` em cada item para a decisão final.

1. **Renderer wiring para `ALWAYS_LISTENING_START` / `ALWAYS_LISTENING_FORCE_FLUSH`**
   - What we know: nenhum hook React subscreve esses IPCs hoje (grep no `apps/desktop/src/renderer/`)
   - What's unclear: Phase 40 deixou implícito ou o hook está em uma branch não-merged? VPTT-03 verde no main mas inerte na prática se não houver renderer listener.
   - Recommendation: Wave 0 deve **confirmar grep** e, se confirmado faltante, criar `useAlwaysListening` hook como precondição da Phase 43, OU declarar VPTT-03 como "main-side only" e abrir uma quick task para wiring renderer.
   - **RESOLVED (Plan 01 OQ-1):** VPTT-03 main-side é o escopo desta phase. Renderer-side wiring (hook React `useAlwaysListening`) declarado fora de scope; documentado no SUMMARY do plan 43-03 como follow-up note. Ver 43-01-PLAN.md `<open_questions_resolution>` OQ-1.

2. **API exata de force-flush em `@ricky0123/vad-web 0.0.30`**
   - What we know: `vadSession.setOptions()` existe; `vadSession.start/destroy/processAudio` existem
   - What's unclear: API direta para "fechar utterance agora" não confirmada — pode requerer `processAudio(silenceFrames)` para forçar `redemptionMs` window completion, ou call manual de `onSpeechEnd`.
   - Recommendation: Context7 / Firecrawl no `@ricky0123/vad-web` GitHub durante a implementação do renderer-side handler. Se API ausente, fallback é `vadSession.destroy() + vadSession.start()` com captura manual do buffer atual — feio mas funcional.
   - **RESOLVED (Plan 01 OQ-2):** FORA DE ESCOPO desta phase. Strategy main-side só comanda via IPC; rendering-side é problema do hook futuro. Ver 43-01-PLAN.md `<open_questions_resolution>` OQ-2.

3. **Pode `currentMode === null` ser observável pela tray ou orb?**
   - What we know: D-04 fallback diz "log + currentMode=null". Documentado como cenário extremo.
   - What's unclear: User vê o quê? Tray submenu sem nada checked + tooltip "JARVIS — ?". Aceitável?
   - Recommendation: Plan deve incluir uma toast ou label "Sem modo ativo — tente reiniciar" via `broadcastModeSwitch({ success: false, label: 'Sem modo ativo' })`. Trade-off: isso requer ampliar tipo `VoiceModeSwitchResult` ou usar canal `voiceMode:degraded`.
   - **RESOLVED (Plan 01 OQ-3):** tray.ts já lida graciosamente com null (`option.mode === currentMode` retorna false → nenhum radio marcado). NÃO adicionar toast `voice-mode:degraded` agora — apenas log de erro no main. Tooltip cai em fallback "JARVIS — Wake Word" via `?? 'Wake Word'` em tray.ts:74. Ver 43-01-PLAN.md `<open_questions_resolution>` OQ-3.

4. **Se `useWakeWord` já é pausado por `wakeWord:pause-toggle` (Phase 23 D-04), por que precisamos de IPC novo `ptt-only:active`?**
   - What we know: Pattern 1 sugere IPC novo. Mas `setWakeWordPaused(true)` + `WAKE_WORD_PAUSE_TOGGLE` já existe.
   - Recommendation: **Reusar o canal existente.** Plan deve usar `setWakeWordPaused(true)` + `broadcastPauseToggle(true)` em `PttOnlyStrategy.start()`, e `setWakeWordPaused(false)` + `broadcastPauseToggle(false)` em `dispose()`. Zero IPC novo. Cuidado: precisa testar interação com tray "Pause listening" (que foi removido pela Phase 41 D-03 — confirmar). Atualizar A5 conforme essa descoberta.
   - **RESOLVED (Plan 01 OQ-4):** REUSAR o canal existente. `PttOnlyStrategy.start()` chama `setWakeWordPaused(true)` + `broadcastPauseToggle(true)`. `PttOnlyStrategy.stop()` chama `setWakeWordPaused(false)` + `broadcastPauseToggle(false)`. Zero IPC novo. NÃO criar canal `ptt-only:active`. Ver 43-01-PLAN.md `<open_questions_resolution>` OQ-4.

## Environment Availability

> Phase puramente TypeScript dentro de monorepo `apps/desktop/`. Sem dependências externas a probar.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TypeScript build + vitest | ✓ (codebase em produção) | ^22 | — |
| pnpm | monorepo workspace | ✓ (assumido — projeto `pnpm vitest` em uso) | — | npm/yarn não recomendado em monorepos pnpm |
| electron 41.1.1 | runtime | ✓ | 41.1.1 | — |
| electron-store 11 | persistence | ✓ | 11.0.2 | — |
| vitest 4.1.2 | test runner | ✓ | ^4.1.2 | — |

**Missing dependencies with no fallback:** Nenhum.
**Missing dependencies with fallback:** Nenhum.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as deps já em uso e validadas em Phases anteriores
- Architecture (Pattern 1/2/4): HIGH — replicação direta de padrões já validados em alwaysListening.ts e voiceMode/index.ts
- Architecture (Pattern 3 force-flush): MEDIUM — main-side é claro; renderer-side depende de API específica do `@ricky0123/vad-web` que precisa pesquisa adicional na implementação
- Pitfalls: HIGH — todos os 5 pitfalls têm warning signs claros e mitigação testável
- Validation Architecture: HIGH — vitest patterns já provados em `voiceMode/alwaysListening.test.ts` e `voiceMode.test.ts`
- D-04 plano B: HIGH — note de origem + decisão explícita pelo usuário em CONTEXT.md
- VPTT-01 renderer coordination: MEDIUM — depende do paragrafo Open Question 4 (reuso de `wakeWord:pause-toggle`)

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (stable infra; revalidate se Phase 40 hook do renderer for adicionado entre agora e essa data)

---

*Research realizado por gsd-research-phase para Phase 43 — PTT-only + Integration.*
