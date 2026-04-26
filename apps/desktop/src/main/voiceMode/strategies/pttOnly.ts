/**
 * PttOnlyStrategy — coordinator main-side para o modo PTT-only.
 *
 * Phase 43 (VPTT-01, VPTT-02, D-01, D-03)
 *
 * Responsabilidades:
 *   - Suspender o wake word loop renderer-side via reuso do canal existente
 *     `wakeWord:pause-toggle` (broadcastPauseToggle de ipc/settings.ts) +
 *     persistência em electron-store via setWakeWordPaused (D-04 OQ-4 do
 *     research — zero IPC novo).
 *   - Subscrever o pttHotkeyEmitter 'toggle' bus (D-03) para satisfazer
 *     listenerCount("toggle") >= 1 durante PTT-only ativo. O renderer
 *     (ChatInput.tsx) é quem efetivamente lida com o mic via
 *     voiceInputManager.acquire('ptt') ao receber webContents.send do
 *     ptt-hotkey.ts.
 *   - Cleanup idempotente em stop()/dispose() — listener removido com
 *     mesma referência (T-43-LEAK).
 *
 * D-01 (toggle, não press-and-hold): a estratégia em si não muda; o
 * comportamento toggle é responsabilidade do callback em ptt-hotkey.ts +
 * voiceInputManager renderer. Strategy só silencia o wake word.
 *
 * D-03 (hotkey ownership): NÃO chama globalShortcut.register. ptt-hotkey.ts
 * é único registrador (registrado uma vez em main/index.ts whenReady).
 *
 * @see CONTEXT.md D-01 (toggle), D-03 (ownership), D-04 OQ-4 (reuso pause)
 * @see ptt-hotkey.ts pttHotkeyEmitter (Plan 02 Task 1)
 */
import type { BrowserWindow } from 'electron';
import type { VoiceCaptureStrategy } from '../index.js';
import { pttHotkeyEmitter, type PttAction } from '../../ptt-hotkey.js';
import { setWakeWordPaused } from '../../store.js';
import { broadcastPauseToggle } from '../../ipc/settings.js';

export interface PttOnlyStrategyDeps {
  /**
   * Janela principal — não usada diretamente pela strategy (broadcast de
   * pause-toggle alcança todas as windows via BrowserWindow.getAllWindows).
   * Mantida no shape para consistência com AlwaysListeningStrategyDeps e
   * para futura extensão sem quebra de contrato.
   */
  mainWindow: BrowserWindow;
}

export class PttOnlyStrategy implements VoiceCaptureStrategy {
  private status: 'idle' | 'capturing' | 'processing' = 'idle';

  /**
   * Stable reference para o listener — pttHotkeyEmitter.off() requer
   * a MESMA função (não nova arrow inline). Sem isso, listener vaza e
   * próximo mode switch acumula outro (T-43-LEAK).
   */
  private boundOnToggle: ((action: PttAction) => void) | null = null;

  constructor(private readonly deps: PttOnlyStrategyDeps) {}

  async start(): Promise<void> {
    if (this.status !== 'idle') {
      // Idempotência defensiva — start() duplo não duplica listener.
      return;
    }

    // VPTT-01: suspende wake word loop no renderer.
    // Reusa canal `wakeWord:pause-toggle` (Phase 23 D-04) — zero IPC novo.
    // useWakeWord.ts:397 consome onPauseToggle e suspende o engine.
    setWakeWordPaused(true);
    broadcastPauseToggle(true);

    // D-03: subscribe pttHotkeyEmitter 'toggle' com referência estável.
    // Listener é no-op com console.debug — renderer (ChatInput) é quem
    // resolve o mic via voiceInputManager.acquire('ptt') ao receber
    // webContents.send('ptt:action', 'toggle') do ptt-hotkey.ts.
    // Existência do listener no main bus garante observability + permite
    // futura telemetria sem mudar API.
    this.boundOnToggle = (_action: PttAction) => {
      console.debug('[PttOnlyStrategy] ptt:action toggle (renderer handles mic)');
    };
    pttHotkeyEmitter.on('toggle', this.boundOnToggle);

    this.status = 'capturing';
  }

  async stop(): Promise<void> {
    if (this.status === 'idle' && !this.boundOnToggle) {
      // Idempotência: stop() duplo não vaza, não chama broadcast de novo.
      return;
    }

    this.status = 'idle';

    // T-43-LEAK: remoção com mesma referência. Sem isso, próximo mode
    // switch acumula listener fantasma.
    if (this.boundOnToggle) {
      pttHotkeyEmitter.off('toggle', this.boundOnToggle);
      this.boundOnToggle = null;
    }

    // VPTT-01: re-ativa wake word loop no renderer.
    setWakeWordPaused(false);
    broadcastPauseToggle(false);
  }

  async dispose(): Promise<void> {
    await this.stop();
    // Strategy é descartada — VoiceModeManager não reusa esta instância
    // (D-04 lazy lifecycle).
  }

  getStatus(): 'idle' | 'capturing' | 'processing' {
    return this.status;
  }
}

/**
 * Helper para criar a factory de PTT-only com deps já fechadas.
 * Usado pelo entry point (main/index.ts) ao instanciar o VoiceModeManager
 * (Plan 04 wiring) — substitui o factory throw stub do voiceMode/index.ts.
 */
export function createPttOnlyFactory(
  deps: PttOnlyStrategyDeps,
): () => PttOnlyStrategy {
  return () => new PttOnlyStrategy(deps);
}
