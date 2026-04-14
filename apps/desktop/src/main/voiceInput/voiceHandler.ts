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
import { normalizeAudioToWav } from './audioNormalizer.js';
import { getWhisperInstance } from './whisperResources.js';
import type { TTSProvider } from './tts/provider.js';
import type { SendAudioResponse } from '../../shared/ipc-types.js';
import type { BackendConfig } from '../backend-client.js';

export interface VoiceHandlerDeps {
  config: BackendConfig;
  selectedModel: 'tiny' | 'base' | 'large';
  ttsProvider: TTSProvider;
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
    console.log('[voice-handler] Transcribing with model:', deps.selectedModel);
    const whisper = await getWhisperInstance(deps.selectedModel);
    const transcribeResult = await whisper.transcribe(wavBuffer);
    const transcription = transcribeResult.result ?? '';

    if (!transcription || transcription.trim().length === 0) {
      console.warn('[voice-handler] Empty transcription — no speech detected');
      return {
        success: false,
        error: { code: 'NO_SPEECH', message: 'empty transcription — no speech detected' },
      };
    }
    console.log('[voice-handler] Transcription:', transcription);

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

    const llmData = (await llmResponse.json()) as { reply: string };
    const reply = llmData.reply ?? '';
    console.log('[voice-handler] LLM reply received, length:', reply.length);

    // Step 4: Synthesize TTS — graceful degrade on failure (WAKE-10 precedent)
    console.log('[voice-handler] Synthesizing TTS via', deps.ttsProvider.name);
    let audioBase64: string | null = null;
    let audioFormat: 'mp3' | 'wav' = 'mp3';
    try {
      const ttsResult = await deps.ttsProvider.synthesize(reply);
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
        ttsProvider: deps.ttsProvider.name,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[voice-handler] Unexpected error:', message);
    return { success: false, error: { code: 'VOICE_HANDLER_ERROR', message } };
  }
}
