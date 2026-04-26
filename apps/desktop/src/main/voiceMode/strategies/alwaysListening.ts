/**
 * AlwaysListeningStrategy — coordinator main-side para o modo Always-Listening.
 *
 * Phase 40 — Always-Listening + Intent Classifier (D-01, D-04, D-09, D-15, D-16)
 *
 * Responsabilidades:
 *   - Enviar IPC ALWAYS_LISTENING_START/STOP para o renderer (que opera o
 *     AlwaysListeningEngine — captura, VAD, ring buffer e classifier load).
 *   - Registrar `ipcMain.on(ALWAYS_LISTENING_UTTERANCE)` enquanto ativa — recebe
 *     WAV (Uint8Array) do renderer e despacha para `voiceHandler.handleAudio`
 *     (pipeline existente STT→LLM→TTS).
 *   - Emitir `voiceMode:degraded` via callback se start() falhar (D-09)
 *     ou se download do modelo falhar em background (D-16).
 *   - NÃO roda o loop de áudio — tudo isso fica no renderer (D-01).
 *
 * NOTA Phase 40 Plan 06: o handler IPC `always-listening:vad-threshold` foi
 * MOVIDO para `apps/desktop/src/main/ipc/settings.ts` (sempre registrado, mesmo
 * fora do modo always-listening) — assim o slider de Settings consegue salvar
 * a preferência e a UI reflete o estado independente do modo ativo.
 *
 * @see CONTEXT.md D-01 (loop no renderer; main coordena via IPC)
 * @see CONTEXT.md D-04 (IPC utterance-level apenas)
 * @see CONTEXT.md D-09 (load fail → voiceMode:degraded)
 * @see CONTEXT.md D-15 (pre-download silencioso após app.whenReady)
 * @see CONTEXT.md D-16 (DL fail → voiceMode:degraded com reason específico)
 */
import { ipcMain, type BrowserWindow } from 'electron';

import {
  IPC_CHANNELS,
  type AlwaysListeningUtterancePayload,
  type VoiceModeDegradedEvent,
  type PttAction,
} from '../../../shared/ipc-types.js';
import { handleAudio, type VoiceHandlerDeps } from '../../voiceInput/voiceHandler.js';
import { getVadSilenceThresholdMs } from '../../store.js';
import type { VoiceCaptureStrategy } from '../index.js';
import { pttHotkeyEmitter } from '../../ptt-hotkey.js';

/** Silero VAD legacy frame size @ 16kHz = 1536 samples ≈96ms. */
const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 1_536;

/** Delay antes de iniciar o pre-download (D-15: app já estabilizou). */
const PRE_DOWNLOAD_DELAY_MS = 5_000;

/** Channel privado main → renderer para sinalizar pre-download. */
const PRELOAD_MODEL_CHANNEL = 'always-listening:preload-model';
/** Channel privado renderer → main para reportar falha de DL. */
const MODEL_DOWNLOAD_FAILED_CHANNEL = 'always-listening:model-download-failed';

export interface AlwaysListeningStrategyDeps {
  /** Janela principal — usada para `webContents.send` de start/stop/threshold. */
  mainWindow: BrowserWindow;
  /** Deps do voiceHandler (config, selectedModel, ttsProvider) — pipeline STT→LLM→TTS. */
  voiceHandlerDeps: VoiceHandlerDeps;
  /**
   * Callback invocado quando o modo precisa degradar (D-09, D-16).
   * Caller (VoiceModeManager wiring) emite event interno + IPC broadcast.
   */
  onDegraded: (event: VoiceModeDegradedEvent) => void;
}

/**
 * Converte vadSilenceThresholdMs (300-800ms) em negativeFramesToClose (frames).
 * Mantém vocabulário "frames" na borda IPC porque o engine renderer-side recebe
 * frames (que ele converte internamente em redemptionMs para a API @ricky0123/vad-web).
 */
function msToNegativeFrames(ms: number): number {
  return Math.max(1, Math.floor((ms / 1000) * SAMPLE_RATE / FRAME_SAMPLES));
}

export class AlwaysListeningStrategy implements VoiceCaptureStrategy {
  private status: 'idle' | 'capturing' | 'processing' = 'idle';
  private inFlight = false;
  private utteranceListener:
    | ((event: Electron.IpcMainEvent, payload: AlwaysListeningUtterancePayload) => void)
    | null = null;
  /**
   * Phase 43 VPTT-03 — listener estável para o bus pttHotkeyEmitter.
   * Quando user pressiona hotkey PTT em modo Always-Listening, this.forceFlush()
   * é invocado. Referência estável é necessária para off() funcionar (T-43-LEAK).
   */
  private boundOnPttToggle: ((action: PttAction) => void) | null = null;

  constructor(private readonly deps: AlwaysListeningStrategyDeps) {}

  /**
   * start — registra listeners IPC e sinaliza renderer para iniciar o engine.
   * Erros propagados via Promise rejection (VoiceModeManager trata em setMode
   * com `started=false` e mantém modo anterior; D-09 fica a cargo do caller).
   *
   * NOTA Phase 40 Plan 06: o handler IPC `always-listening:vad-threshold` é
   * registrado em `ipc/settings.ts` (sempre disponível) — não aqui.
   */
  async start(): Promise<void> {
    if (this.status !== 'idle') {
      // Idempotência defensiva — start() duplo não vaza handlers.
      return;
    }

    // D-04: handler para utterance-level IPC do renderer.
    // Captura `this` via arrow function — `ipcMain.off` precisa da mesma referência.
    this.utteranceListener = (_event, payload) => {
      void this.processUtterance(payload);
    };
    ipcMain.on(IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE, this.utteranceListener);

    // Phase 43 VPTT-03 — subscribe pttHotkeyEmitter 'toggle' para force-flush.
    // Stable reference (T-43-LEAK). Listener é arrow function que delega
    // para this.forceFlush() — comportamento por estado em D-02.
    this.boundOnPttToggle = (_action: PttAction) => {
      this.forceFlush();
    };
    pttHotkeyEmitter.on('toggle', this.boundOnPttToggle);

    // Send sinal ao renderer para começar a captura (engine no renderer).
    const vadThresholdMs = getVadSilenceThresholdMs();
    const negativeFramesToClose = msToNegativeFrames(vadThresholdMs);

    if (!this.deps.mainWindow.isDestroyed()) {
      this.deps.mainWindow.webContents.send(IPC_CHANNELS.ALWAYS_LISTENING_START, {
        negativeFramesToClose,
        vadThresholdMs,
      });
    }

    this.status = 'capturing';
  }

  /**
   * processUtterance — recebe WAV do renderer e despacha para o pipeline
   * STT→LLM→TTS existente (handleAudio consome WAV, passa por ffmpeg que
   * detecta WAV automaticamente e mantém 16kHz mono — sem reencode pesado).
   */
  private async processUtterance(
    payload: AlwaysListeningUtterancePayload,
  ): Promise<void> {
    if (this.status === 'idle' || this.inFlight) {
      // Já parado entre o send do renderer e o tick atual, ou invocação
      // concorrente — descarta para serializar utterances (T-40-MIC).
      return;
    }

    this.inFlight = true;
    this.status = 'processing';

    try {
      // Conversão Uint8Array → Buffer para handleAudio (signature Buffer).
      const buffer = Buffer.from(
        payload.wavBuffer.buffer,
        payload.wavBuffer.byteOffset,
        payload.wavBuffer.byteLength,
      );
      await handleAudio(buffer, this.deps.voiceHandlerDeps);
    } catch (err) {
      console.error(
        '[AlwaysListeningStrategy] handleAudio error:',
        err instanceof Error ? err.message : err,
      );
    } finally {
      this.inFlight = false;
      // Volta a 'capturing' se ainda ativo. Se stop() rodou no meio,
      // preserva 'idle'.
      if (this.status === 'processing') {
        this.status = 'capturing';
      }
    }
  }

  /**
   * forceFlush — VPTT-03 (D-02): fecha utterance imediatamente via IPC.
   *
   * Invocado por:
   *   - pttHotkeyEmitter 'toggle' callback (subscribed em start())
   *   - testes diretos (public para verificação por estado)
   *
   * Comportamento por estado (D-02 — comportamento DEFENSIVO, sem logs):
   *   - status === 'capturing' AND inFlight === false → envia IPC ao renderer
   *   - status === 'idle' → no-op silencioso (return)
   *   - status === 'processing' → no-op silencioso (return)
   *   - inFlight === true → no-op silencioso (utterance já em STT)
   *
   * Detecção de "0 samples" (D-02 último caso) é responsabilidade do
   * renderer — engine tem visibilidade do ring buffer + VAD state.
   * Strategy main-side só comanda; engine decide aplicar ou descartar.
   *
   * @see CONTEXT.md D-02 (force-flush behavior table)
   * @see RESEARCH.md Pattern 3 (VPTT-03 architecture)
   */
  forceFlush(): void {
    if (this.status !== 'capturing') {
      return; // idle / processing → no-op silencioso (D-02)
    }
    if (this.inFlight) {
      return; // utterance já sendo enviada — duplicação inútil (D-02)
    }

    if (!this.deps.mainWindow.isDestroyed()) {
      this.deps.mainWindow.webContents.send(IPC_CHANNELS.ALWAYS_LISTENING_FORCE_FLUSH);
    }
  }

  /**
   * stop — remove handlers IPC e sinaliza renderer para parar o engine.
   * Idempotente: chamada duplicada é no-op.
   */
  async stop(): Promise<void> {
    if (this.status === 'idle' && !this.utteranceListener && !this.boundOnPttToggle) {
      return;
    }

    this.status = 'idle';

    // Phase 43 VPTT-03: unsubscribe pttHotkeyEmitter ANTES do utteranceListener.
    // Ordem importa porque um force-flush concurrent que dispare entre o
    // status='idle' acima e o off() abaixo já é guard'd pelo if status check
    // em forceFlush() — mas mantemos ordem cleanup explícita por clareza.
    if (this.boundOnPttToggle) {
      pttHotkeyEmitter.off('toggle', this.boundOnPttToggle);
      this.boundOnPttToggle = null;
    }

    // Remover listener de utterance — sem isso, utterances chegariam após o
    // mode switch (T-40-MIC: handlers fantasmas que processariam áudio
    // de um stream que não devíamos mais ter).
    if (this.utteranceListener) {
      ipcMain.off(IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE, this.utteranceListener);
      this.utteranceListener = null;
    }

    // Sinaliza renderer para parar o engine (best-effort: window pode ter
    // sido destruída entre stop() e este tick).
    if (!this.deps.mainWindow.isDestroyed()) {
      this.deps.mainWindow.webContents.send(IPC_CHANNELS.ALWAYS_LISTENING_STOP);
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
    // Strategy é descartada — VoiceModeManager não reusa esta instância.
  }

  getStatus(): 'idle' | 'capturing' | 'processing' {
    return this.status;
  }
}

/**
 * scheduleModelPreDownload — sinaliza o renderer para baixar o modelo
 * multilingual-e5-small em background após o app estabilizar (D-15).
 *
 * Estratégia:
 *   - 5s após a chamada (app already ready) — não bloqueia startup nem UI.
 *   - O download real roda no renderer (Transformers.js), porque o classifier
 *     vive no renderer (D-02). Aqui apenas disparamos o trigger via IPC.
 *   - Se renderer reportar falha (no-network, CDN down), emite voiceMode:degraded
 *     via onFail callback (D-16) — Phase 41 mostra toast acionável.
 *
 * @param mainWindow Janela alvo do trigger IPC
 * @param onFail Callback invocado em falha de DL (Phase 41 consome para toast)
 */
export function scheduleModelPreDownload(
  mainWindow: BrowserWindow,
  onFail: (event: VoiceModeDegradedEvent) => void,
): void {
  setTimeout(() => {
    if (mainWindow.isDestroyed()) {
      return;
    }

    // Trigger silencioso — renderer escuta e dispara classifier.load() em background.
    mainWindow.webContents.send(PRELOAD_MODEL_CHANNEL);

    // Listener once-shot para a falha — D-16: emite degraded sem bloquear app.
    // Se o download for bem sucedido, o renderer simplesmente não envia o channel
    // de falha (silent success).
    ipcMain.once(MODEL_DOWNLOAD_FAILED_CHANNEL, () => {
      onFail({
        attemptedMode: 'always-listening',
        reason: 'classifier-download-fail',
        message:
          'Não foi possível baixar o classifier de intent. Tente Always-Listening de novo quando estiver online.',
      });
    });
  }, PRE_DOWNLOAD_DELAY_MS);
}

/**
 * Helper para criar a factory de Always-Listening com deps já fechadas.
 * Usado pelo entry point (main/index.ts) ao instanciar o VoiceModeManager
 * (Phase 41 wiring) — substitui o factory throw stub do voiceMode/index.ts.
 */
export function createAlwaysListeningFactory(
  deps: AlwaysListeningStrategyDeps,
): () => AlwaysListeningStrategy {
  return () => new AlwaysListeningStrategy(deps);
}
