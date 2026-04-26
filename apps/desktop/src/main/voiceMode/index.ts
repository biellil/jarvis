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
  private currentMode: VoiceMode;
  private activeStrategy: VoiceCaptureStrategy | null = null;
  private transitioning = false;
  /** WR-02: guarda contra init() chamado mais de uma vez (test rerun, hot reload). */
  private initialized = false;

  /** Mapa de factory functions para instanciar Strategies lazily (D-04). */
  private strategyFactories: Map<VoiceMode, () => VoiceCaptureStrategy>;

  constructor(factories?: Partial<Record<VoiceMode, () => VoiceCaptureStrategy>>) {
    super();
    // Lê do store na construção — getVoiceMode() retorna 'wake-word' se ausente (D-07)
    this.currentMode = getVoiceMode();

    // Factories padrão — podem ser sobrescritas via construtor (testability, D-04)
    this.strategyFactories = new Map<VoiceMode, () => VoiceCaptureStrategy>([
      ['wake-word', factories?.['wake-word'] ?? (() => new WakeWordStrategy())],
      ['always-listening', factories?.['always-listening'] ?? (() => { throw new Error('AlwaysListeningStrategy not yet implemented (Phase 40)'); })],
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
    console.log(`[VoiceModeManager] Initialized in mode: ${this.currentMode}`);
    // D-08: NÃO emitir event aqui — startup é silencioso
  }

  /**
   * getMode() — retorna o modo atualmente ativo.
   */
  getMode(): VoiceMode {
    return this.currentMode;
  }

  /**
   * setMode() — tenta transicionar para um novo modo.
   *
   * D-01: Retorna false silenciosamente se:
   *   - Mesmo modo já ativo
   *   - Strategy ativa em status ≠ 'idle' (D-02)
   *   - Transição já em progresso
   *
   * D-04: dispose() na Strategy antiga, instancia nova lazily.
   * VMODE-03: emite 'voiceMode:change' com payload VoiceModeChangeEvent.
   */
  async setMode(newMode: VoiceMode, reason: 'user' | 'system' = 'user'): Promise<boolean> {
    // Sem mudança
    if (newMode === this.currentMode) {
      return false;
    }

    // D-01: bloqueia se transição em progresso
    if (this.transitioning) {
      console.warn(`[VoiceModeManager] setMode('${newMode}') blocked — transition in progress`);
      return false;
    }

    // D-02: bloqueia se Strategy ativa não está idle
    if (this.activeStrategy && this.activeStrategy.getStatus() !== 'idle') {
      console.warn(`[VoiceModeManager] setMode('${newMode}') blocked — active strategy status: ${this.activeStrategy.getStatus()}`);
      return false;
    }

    this.transitioning = true;
    const oldMode = this.currentMode;

    try {
      // D-04: dispose() da Strategy antiga
      if (this.activeStrategy) {
        await this.activeStrategy.dispose();
        this.activeStrategy = null;
      }

      // Instancia nova Strategy lazily (D-04).
      // WR-01: só persistir + emitir event quando a Strategy realmente foi
      // construída e iniciada com sucesso. Caso contrário, mantemos o modo
      // antigo para evitar "zombie mode" persistido no store que sobrevive
      // a restarts sem nenhum pipeline de captura ativo.
      const factory = this.strategyFactories.get(newMode);
      let started = false;

      if (factory) {
        try {
          this.activeStrategy = factory();
          await this.activeStrategy.start();
          started = true;
        } catch (err) {
          console.warn(`[VoiceModeManager] setMode() — Strategy not ready for mode '${newMode}':`, err instanceof Error ? err.message : err);
          this.activeStrategy = null;
          // Não persiste, não emite event, não muda currentMode — mantém o último
          // estado funcional para o próximo restart.
          return false;
        }
      } else {
        // Sem factory para o novo modo — não há como iniciar; mantém modo atual.
        console.warn(`[VoiceModeManager] setMode('${newMode}') — no factory registered for mode`);
        return false;
      }

      if (!started) {
        return false;
      }

      // Atualiza estado e persiste
      this.currentMode = newMode;
      setVoiceMode(newMode); // VMODE-02: persiste no electron-store

      // VMODE-03 + D-05: emite event com payload rich
      const event: VoiceModeChangeEvent = {
        oldMode,
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
