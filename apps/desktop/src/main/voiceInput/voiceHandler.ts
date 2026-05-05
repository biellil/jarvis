/**
 * voiceHandler.ts — Pipeline orchestrator for local STT → LLM → TTS (ARCH-05).
 *
 * Called from ipc/chat.ts when USE_WHISPER_CPP=true.
 * Receives WebM audio buffer → normalizes → transcribes → LLM gateway → TTS → returns audio.
 *
 * Graceful degrades:
 *   - TTS failure: returns audioBase64: null with message intact (WAKE-10 precedent)
 *   - LLM failure: returns error { code: 'LLM_ERROR', message }
 *   - STT failure: returns error { code: 'VOICE_HANDLER_ERROR' | 'NO_SPEECH', message }
 */
import type { BrowserWindow } from 'electron';
import { normalizeAudioToWav } from './audioNormalizer.js';
import { getWhisperInstance } from './whisperResources.js';
import type { WhisperModel } from './whisperResources.js';
import { createTTSProvider } from './tts/index.js';
import type { TTSProvider } from './tts/provider.js';
import { IPC_CHANNELS, type SendAudioResponse } from '../../shared/ipc-types.js';
import type { BackendConfig } from '../backend-client.js';
import { getStreamingTtsEnabled } from '../store';
import { runStreamingTurn, type StreamingTurnHandle } from './streamingTurn.js';
import { reloadActiveTtsProvider } from './tts/index.js';

export interface VoiceHandlerDeps {
  config: BackendConfig;
  selectedModel: 'tiny' | 'base' | 'medium' | 'large';
  ttsProvider: TTSProvider;
  /**
   * Phase 53 Plan 04 (STTS-01): main window handle for streaming TTS IPC sends
   * (tts:chunk / tts:end / tts:stop). Optional — when omitted, streaming path
   * silently falls through to legacy. Always present in production wiring
   * (apps/desktop/src/main/index.ts) once Plan 04 lands.
   */
  mainWindow?: Pick<BrowserWindow, 'isDestroyed' | 'webContents'>;
}

// Phase 53 Plan 04 (STTS-01, D-12): track the active streaming turn so the
// barge-in dispatcher (wake-word / PTT) can cancel it and notify the renderer.
let activeStreamingTurn: StreamingTurnHandle | null = null;

/**
 * abortActiveStreamingTurn — barge-in entry point (D-12).
 * Called by wake-word / PTT handlers when the user starts a new turn while
 * JARVIS is still speaking. Idempotent: no-op if no streaming turn is active.
 *
 * Behavior:
 *   1. handle.abort() — flips cancellation flag inside streamingTurn.ts so
 *      late-resolving synthesize() promises don't emit further tts:chunk IPC.
 *   2. webContents.send(TTS_STOP, { turnId }) — instructs the renderer queue
 *      (Plan 02 streamingTtsPlayer.stopTurn) to stop sources + drain pending.
 *   3. clears activeStreamingTurn so subsequent abort() calls are no-ops.
 */
export function abortActiveStreamingTurn(
  mainWindow?: Pick<BrowserWindow, 'isDestroyed' | 'webContents'> | null,
): void {
  const handle = activeStreamingTurn;
  if (!handle) return;
  handle.abort();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.TTS_STOP, { turnId: handle.turnId });
  }
  activeStreamingTurn = null;
}

// Phase 34: module-scope TTS provider — updated by reinitializeTTS() on settings save
let _currentTtsProvider: TTSProvider | null = null;

// Phase 50 (D-16): active Whisper model — updated by setActiveWhisperModel after UI-driven download.
// null = not yet set by UI; handleAudio falls back to deps.selectedModel (startup VRAM resolution).
let _activeWhisperModel: WhisperModel | null = null;

/**
 * setActiveWhisperModel — called by Whisper IPC handler after successful download (Phase 50 D-16).
 * Updates the model used by the NEXT handleAudio call.
 * In-progress transcriptions complete with the model they started with (acceptable limitation).
 */
export function setActiveWhisperModel(model: WhisperModel): void {
  _activeWhisperModel = model;
  console.log('[voice-handler] Active Whisper model updated:', model);
}

/** getActiveWhisperModel — returns the override if set, null if using startup default. */
export function getActiveWhisperModel(): WhisperModel | null {
  return _activeWhisperModel;
}

/**
 * initializeTTSProvider — called once from main/index.ts at startup.
 * Subsequent changes use reinitializeTTS().
 */
export function initializeTTSProvider(provider: TTSProvider): void {
  _currentTtsProvider = provider;
  console.log('[voice-handler] TTS provider initialized:', provider.name);
}

/**
 * reinitializeTTS — called from Settings IPC handler after user changes TTS settings.
 * Non-blocking at call site: caller wraps in try/catch; failure logs but does not block save.
 */
export async function reinitializeTTS(): Promise<void> {
  const newProvider = createTTSProvider();
  _currentTtsProvider = newProvider;
  reloadActiveTtsProvider();
  console.log('[voice-handler] TTS provider re-initialized:', newProvider.name);
}

/**
 * handleAudio — pure function for testability (no class needed for DI pattern).
 * All deps injected; no module-scope state accessed directly.
 */
export async function handleAudio(
  webmBuffer: Buffer,
  deps: VoiceHandlerDeps,
): Promise<SendAudioResponse> {
  try {
    // Step 1: Normalize WebM 48kHz → WAV 16kHz mono
    console.log('[voice-handler] Normalizing audio...');
    let wavBuffer: Buffer;
    try {
      wavBuffer = await normalizeAudioToWav(webmBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[voice-handler] Normalization failed:', message);
      return { success: false, error: { code: 'VOICE_HANDLER_ERROR', message } };
    }

    // Step 2: Transcribe with whisper.cpp via whisperResources.getWhisperInstance
    // (getWhisperInstance is the mock point in tests — handles ASAR compat internally)
    // Use UI-activated model if set; otherwise fall back to startup VRAM-resolved model (Phase 50 D-16)
    const effectiveModel: WhisperModel = _activeWhisperModel ?? deps.selectedModel;
    console.log('[voice-handler] Transcribing with model:', effectiveModel);
    const whisper = await getWhisperInstance(effectiveModel);
    // transcribeData expects raw PCM s16le — strip the WAV header by finding the "data" chunk.
    const dataTag = Buffer.from('data');
    const dataTagIdx = wavBuffer.indexOf(dataTag);
    const pcmStart = dataTagIdx >= 0 ? dataTagIdx + 8 : 44; // skip "data" + 4-byte size field
    const pcmBuffer = wavBuffer.subarray(pcmStart);
    const arrayBuffer = pcmBuffer.buffer.slice(pcmBuffer.byteOffset, pcmBuffer.byteOffset + pcmBuffer.byteLength);
    let transcription = '';
    try {
      const { promise: transcribePromise } = whisper.transcribeData(arrayBuffer, { language: 'pt' });
      const transcribeResult = await transcribePromise;
      transcription = transcribeResult.result ?? '';
    } finally {
      await whisper.release();
    }

    if (!transcription || transcription.trim().length === 0) {
      console.warn('[voice-handler] Empty transcription — no speech detected');
      return {
        success: false,
        error: { code: 'NO_SPEECH', message: 'empty transcription — no speech detected' },
      };
    }
    console.log('[voice-handler] Transcription:', transcription);

    // Phase 53 Plan 04 (STTS-01, STTS-02, D-11): bifurcate on streaming TTS flag.
    // Read flag ONCE at turn start — mid-turn toggles affect the next turn only.
    // When enabled and mainWindow is present, delegate LLM+TTS to runStreamingTurn:
    // SSE tokens → SentenceChunker → per-sentence synthesize → tts:chunk IPC.
    // Renderer's streamingTtsPlayer (Plan 02) consumes the chunks for gapless playback.
    // Legacy fetch+synthesize path stays untouched below for flag=false (no regression).
    const streamingEnabled = getStreamingTtsEnabled();
    if (streamingEnabled && deps.mainWindow) {
      const handle = runStreamingTurn(
        {
          backendUrl: deps.config.backendUrl,
          apiKey: deps.config.apiKey,
          mainWindow: deps.mainWindow,
        },
        transcription,
      );
      activeStreamingTurn = handle;
      try {
        await handle.done;
      } finally {
        if (activeStreamingTurn === handle) activeStreamingTurn = null;
      }
      // Audio frames already delivered via tts:chunk IPC — return success with
      // empty audioBase64 so the existing renderer pipeline (handleAudioResponse)
      // doesn't try to play a single-shot blob. Transcription is still meaningful
      // for the chat history; reply text is empty here because streaming sends
      // tokens directly to the renderer via the SSE → tts:chunk path.
      return {
        success: true,
        data: {
          transcription,
          message: '',
          audioBase64: '',
          audioFormat: 'mp3',
          sttProvider: 'whisper.cpp',
          ttsProvider: 'streaming',
        },
      };
    }

    // Step 3: Send transcribed text to LLM gateway
    console.log('[voice-handler] Sending to LLM gateway...');
    const llmResponse = await fetch(`${deps.config.backendUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deps.config.apiKey}`,
      },
      body: JSON.stringify({ message: transcription }),
    });

    if (!llmResponse.ok) {
      const errMsg = `Gateway error ${llmResponse.status}`;
      console.error('[voice-handler] LLM gateway error:', errMsg);
      return { success: false, error: { code: 'LLM_ERROR', message: errMsg } };
    }

    const llmData = (await llmResponse.json()) as { message: string };
    const reply = llmData.message ?? '';
    console.log('[voice-handler] LLM reply received, length:', reply.length);

    // Step 4: Synthesize TTS — graceful degrade on failure (WAKE-10 precedent)
    // Phase 34: prefer module-scope provider (updated via reinitializeTTS) over injected deps
    const activeTts = _currentTtsProvider ?? deps.ttsProvider;
    console.log('[voice-handler] Synthesizing TTS via', activeTts.name);
    let audioBase64: string | null = null;
    let audioFormat: 'mp3' | 'wav' = 'mp3';
    try {
      const ttsResult = await activeTts.synthesize(reply);
      audioBase64 = ttsResult.audio.toString('base64');
      audioFormat = ttsResult.format === 'wav' ? 'wav' : 'mp3';
    } catch (ttsErr) {
      const ttsMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
      console.warn('[voice-handler] TTS failed (graceful degrade):', ttsMsg);
      // Return text response with null audio — renderer handles text-only gracefully
    }

    return {
      success: true,
      data: {
        transcription,
        message: reply,
        audioBase64: audioBase64 as string,  // null allowed per TTS graceful degrade (WAKE-10)
        audioFormat,
        sttProvider: 'whisper.cpp',
        ttsProvider: activeTts.name,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[voice-handler] Unexpected error:', message);
    return { success: false, error: { code: 'VOICE_HANDLER_ERROR', message } };
  }
}
