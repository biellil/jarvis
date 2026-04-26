/**
 * voiceMode/index.ts — Voice Mode State Machine
 *
 * Phase 39: VMODE-01 (state machine exclusivo), VMODE-02 (persistence),
 * VMODE-03 (EventEmitter pub/sub)
 *
 * Expõe:
 *   - VoiceCaptureStrategy: interface minimal (D-03) para os 3 modos
 *   - WakeWordStrategy: stub para modo wake-word (implementação real: Phase 40)
 *   - VoiceModeManager: state machine com guard de transição (D-01, D-02)
 */
import { EventEmitter } from 'events';
import type { VoiceMode, VoiceModeChangeEvent } from '../../shared/ipc-types.js';
import { getVoiceMode, setVoiceMode } from '../store.js';
// Phase 40 — AlwaysListeningStrategy é registrada como factory pelo entry point
// (main/index.ts via createAlwaysListeningFactory + factories override). O default
// stub permanece "throw" porque a strategy precisa de deps (BrowserWindow,
// voiceHandlerDeps, onDegraded) que só o entry point conhece.
import { AlwaysListeningStrategy, createAlwaysListeningFactory } from './strategies/alwaysListening.js';

// Re-export Phase 40 strategy + factory builder para callers (entry point + tests).
export { AlwaysListeningStrategy, createAlwaysListeningFactory };
export type { AlwaysListeningStrategyDeps } from './strategies/alwaysListening.js';

// Phase 43 — PttOnlyStrategy + factory builder. Mesmo pattern do
// createAlwaysListeningFactory para o entry point sobrescrever o stub.
import { PttOnlyStrategy, createPttOnlyFactory } from './strategies/pttOnly.js';
export { PttOnlyStrategy, createPttOnlyFactory };
export type { PttOnlyStrategyDeps } from './strategies/pttOnly.js';

// ============================================
// Strategy Interface (D-03 — MINIMAL)
// ============================================

/**
 * VoiceCaptureStrategy — interface minimal para os 3 modos de captura.
 * D-03: Apenas start/stop/dispose/getStatus. Sem pause/resume/forceFlush.
 * Phases 40/43 implementam AlwaysListeningStrategy e PttOnlyStrategy.
 */
export interface VoiceCaptureStrategy {
  /** Inicia captura de áudio para este modo. */
  start(): Promise<void>;
  /** Para captura normalmente (envia utterance pendente se houver). */
  stop(): Promise<void>;
  /** Libera todos os recursos do modo — chamado em mode switch (D-04). */
  dispose(): Promise<void>;
  /** Estado atual do pipeline de captura. */
  getStatus(): 'idle' | 'capturing' | 'processing';
}

// ============================================
// WakeWordStrategy — Stub (Phase 40 implementa)
// ============================================

/**
 * WakeWordStrategy — stub seguro para Phase 39.
 * Implementação real do loop wake word permanece no renderer (voiceInputManager).
 * Este stub satisfaz a interface para que VoiceModeManager possa gerenciar lifecycle.
 */
export class WakeWordStrategy implements VoiceCaptureStrategy {
  private status: 'idle' | 'capturing' | 'processing' = 'idle';

  async start(): Promise<void> {
    this.status = 'idle'; // Wake word é gerenciado pelo renderer — main stub permanece idle
    console.log('[WakeWordStrategy] start() — delegado ao renderer');
  }

  async stop(): Promise<void> {
    this.status = 'idle';
    console.log('[WakeWordStrategy] stop()');
  }

  async dispose(): Promise<void> {
    this.status = 'idle';
    console.log('[WakeWordStrategy] dispose()');
  }

  getStatus(): 'idle' | 'capturing' | 'processing' {
    return this.status;
  }
}

// ============================================
// VoiceModeManager — State Machine
// ============================================

/**
 * VoiceModeManager — gerencia qual Strategy está ativa.
 *
 * VMODE-01: apenas 1 modo ativo; setMode() bloqueado durante captura (D-01/D-02)
 * VMODE-02: modo persiste via electron-store; default 'wake-word' para v1.8 (D-07)
 * VMODE-03: emite 'voiceMode:change' com payload VoiceModeChangeEvent (D-05)
 * D-04: lifecycle lazy — instancia só a Strategy ativa; dispose() da antiga ao trocar
 * D-08: startup silencioso — init() não emite evento
 */
export class VoiceModeManager extends EventEmitter {
  private currentMode: VoiceMode | null;
  private activeStrategy: VoiceCaptureStrategy | null = null;
  private transitioning = false;
  /** WR-02: guarda contra init() chamado mais de uma vez (test rerun, hot reload). */
  private initialized = false;

  /** Mapa de factory functions para instanciar Strategies lazily (D-04). */
  private strategyFactories: Map<VoiceMode, () => VoiceCaptureStrategy>;

  constructor(factories?: Partial<Record<VoiceMode, () => VoiceCaptureStrategy>>) {
    super();
    // WR-03: cap explícito > default Node de 10. Subscribers esperados:
    // IPC bridge (renderer broadcast), tray menu (checkmarks), audit log,
    // wake-word pause module (Phase 23 cross-talk), Phase 40/43 controllers,
    // settings window. 20 dá folga para 1-2 dev tools / inspectors sem mascarar
    // leaks reais (warning ainda dispara se passar de 20).
    this.setMaxListeners(20);

    // Lê do store na construção — getVoiceMode() retorna 'wake-word' se ausente (D-07)
    this.currentMode = getVoiceMode();

    // Factories padrão — podem ser sobrescritas via construtor (testability, D-04)
    this.strategyFactories = new Map<VoiceMode, () => VoiceCaptureStrategy>([
      ['wake-word', factories?.['wake-word'] ?? (() => new WakeWordStrategy())],
      // Phase 40: a factory default lança porque AlwaysListeningStrategy precisa
      // de deps (BrowserWindow, voiceHandlerDeps, onDegraded) que só o entry
      // point (main/index.ts) conhece. Use createAlwaysListeningFactory(deps)
      // de strategies/alwaysListening.ts para registrar a factory real e passar
      // via construtor — caminho usado pela wiring de Phase 41+.
      ['always-listening', factories?.['always-listening'] ?? (() => { throw new Error('AlwaysListeningStrategy requires deps — use createAlwaysListeningFactory(deps) and pass via VoiceModeManager constructor (Phase 41 wiring)'); })],
      ['ptt-only', factories?.['ptt-only'] ?? (() => { throw new Error('PttOnlyStrategy not yet implemented (Phase 43)'); })],
    ]);
  }

  /**
   * init() — inicializa a Strategy do modo atual sem emitir event (D-08).
   * Deve ser chamado uma vez no startup do main process.
   */
  async init(): Promise<void> {
    // WR-02: idempotência — chamadas extras viraram no-op para evitar leak da
    // Strategy anterior (que já foi started e segura recursos como mic handle).
    if (this.initialized) {
      console.warn('[VoiceModeManager] init() called twice — ignored (already initialized)');
      return;
    }
    this.initialized = true;

    if (this.currentMode !== null) {
      const factory = this.strategyFactories.get(this.currentMode);
      if (factory) {
        try {
          this.activeStrategy = factory();
          await this.activeStrategy.start();
        } catch (err) {
          // Modos não implementados (Phase 40/43) loggam e ficam sem Strategy ativa
          console.warn(`[VoiceModeManager] init() — Strategy not ready for mode '${this.currentMode}':`, err instanceof Error ? err.message : err);
          this.activeStrategy = null;
        }
      }
    }
    console.log(`[VoiceModeManager] Initialized in mode: ${this.currentMode}`);
    // D-08: NÃO emitir event aqui — startup é silencioso
  }

  /**
   * getMode() — retorna o modo atualmente ativo, ou null se em estado degradado
   * (D-04 plano B: nova factory + recovery ambas falharam).
   */
  getMode(): VoiceMode | null {
    return this.currentMode;
  }

  /**
   * setMode() — tenta transicionar para um novo modo.
   *
   * D-01: Retorna false silenciosamente se mesmo modo OU transitioning.
   * D-04 (Phase 43): plano B em catch — se factory nova lança, re-instancia
   * a antiga via restorePreviousStrategy(). Atomicidade total: transitioning
   * permanece true durante recovery (Claude's Discretion endorsement).
   *
   * Estado degradado de último caso (D-04 fallback):
   *   Se nova factory lança E recovery da antiga TAMBÉM lança:
   *   currentMode = null + activeStrategy = null. Tray exibe nenhum radio
   *   marcado (option.mode === null retorna false sempre). Próximo setMode
   *   é "tentativa de saída do estado degradado".
   *
   * Phase 41 Plan 03 (gap closure): O gate D-02 (status !== 'idle') foi
   * removido na Phase 41. Apenas transitioning guard permanece.
   *
   * @see CONTEXT.md D-04 (plano B em catch)
   * @see notes/phase-43-dispose-before-factory.md (root cause)
   */
  async setMode(newMode: VoiceMode, reason: 'user' | 'system' = 'user'): Promise<boolean> {
    // Sem mudança — null nunca === VoiceMode value, então quando estado
    // degradado existir, qualquer setMode tenta entrar.
    if (newMode === this.currentMode) {
      return false;
    }

    if (this.transitioning) {
      console.warn(`[VoiceModeManager] setMode('${newMode}') blocked — transition in progress`);
      return false;
    }

    this.transitioning = true;
    const oldMode = this.currentMode;
    // D-04: guarda factory antiga ANTES do dispose para recovery.
    // Se oldMode for null (estado degradado), oldFactory também será undefined.
    const oldFactory = oldMode !== null
      ? this.strategyFactories.get(oldMode)
      : undefined;

    try {
      // 1. Dispose da antiga (se existe activeStrategy).
      if (this.activeStrategy) {
        await this.activeStrategy.dispose();
        this.activeStrategy = null;
      }

      // 2. Tenta factory nova.
      const newFactory = this.strategyFactories.get(newMode);
      if (!newFactory) {
        console.warn(`[VoiceModeManager] setMode('${newMode}') — no factory registered`);
        // D-04: tenta restaurar antiga (preserva oldMode em caso de sucesso)
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
        // D-04 PLANO B: re-instancia strategy antiga
        await this.restorePreviousStrategy(oldMode, oldFactory);
        return false;
      }

      // 3. Sucesso — atualiza estado, persiste, emite event.
      this.currentMode = newMode;
      setVoiceMode(newMode); // VMODE-02: persiste

      const event: VoiceModeChangeEvent = {
        oldMode: oldMode as VoiceMode, // sucesso implica oldMode existia ou null
        newMode,
        reason,
        timestamp: Date.now(),
      };
      this.emit('voiceMode:change', event);
      console.log(`[VoiceModeManager] Mode changed: ${oldMode} → ${newMode} (reason: ${reason})`);

      return true;
    } finally {
      this.transitioning = false;
    }
  }

  /**
   * D-04 Plano B helper: re-instancia a strategy do oldMode quando a nova
   * factory falha. Mantém atomicidade do switch (transitioning permanece
   * true porque chamado dentro do try/finally do setMode).
   *
   * Comportamento:
   *   - oldMode === null OU oldFactory undefined: estado degradado direto
   *     (currentMode = null, activeStrategy = null) — sem strategy a restaurar.
   *   - oldFactory throws: estado degradado (log error + null state).
   *   - sucesso: activeStrategy é a NOVA instância antiga, currentMode
   *     permanece oldMode (não tocamos).
   *
   * @see RESEARCH.md Pattern 4 (D-04 Plano B)
   */
  private async restorePreviousStrategy(
    oldMode: VoiceMode | null,
    oldFactory: (() => VoiceCaptureStrategy) | undefined,
  ): Promise<void> {
    if (oldMode === null || !oldFactory) {
      console.error(
        `[VoiceModeManager] D-04 fallback: cannot restore (oldMode=${oldMode}, hasFactory=${!!oldFactory}) — entering null state`,
      );
      this.currentMode = null;
      this.activeStrategy = null;
      return;
    }

    try {
      this.activeStrategy = oldFactory();
      await this.activeStrategy.start();
      // currentMode permanece oldMode — não tocamos
      this.currentMode = oldMode;
      console.log(
        `[VoiceModeManager] D-04 recovery: restored '${oldMode}' after factory failure`,
      );
    } catch (recoveryErr) {
      console.error(
        `[VoiceModeManager] D-04 fallback: recovery for '${oldMode}' also failed:`,
        recoveryErr instanceof Error ? recoveryErr.message : recoveryErr,
      );
      this.currentMode = null;
      this.activeStrategy = null;
    }
  }

  /**
   * dispose() — limpa todos os recursos. Chamado no app quit.
   */
  async dispose(): Promise<void> {
    if (this.activeStrategy) {
      await this.activeStrategy.dispose();
      this.activeStrategy = null;
    }
    this.removeAllListeners();
    // WR-02: reseta flag para permitir re-init() após teardown explícito.
    this.initialized = false;
    console.log('[VoiceModeManager] Disposed');
  }
}
