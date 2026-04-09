/**
 * VoiceHandler — orquestra o pipeline de voz:
 *   audio → STT → ChatSession.send → TTS → audit log
 *
 * É puro (sem Express). O lock (SessionLock) é responsabilidade do endpoint
 * consumidor (19-07) — VoiceHandler assume que já está protegido.
 *
 * Toda invocação gera pelo menos uma linha em voice_calls, mesmo em falha.
 * Erros são rethrown com `code` estruturado pro endpoint mapear pro HTTP status:
 *   - EMPTY_AUDIO   → 400
 *   - NO_SPEECH     → 400
 *   - STT_FAILED    → 502
 *   - LLM_FAILED    → 502
 *   - TTS_FAILED    → 502
 */

import type { ChatSession } from "../session/chat-session.js";
import type { MemoryStore } from "../memory/store.js";
import type { STTProvider } from "./stt/index.js";
import type { TTSProvider, TTSAudioFormat } from "./tts/index.js";

export interface VoiceHandlerOptions {
  session: ChatSession;
  stt: STTProvider;
  tts: TTSProvider;
  store: MemoryStore;
  /** Conversation FK pro audit. null = loga sem FK (endpoint sem sessão). */
  conversationId?: number | null;
}

export interface VoiceHandlerResult {
  transcription: string;
  message: string;
  audio: Buffer;
  audioFormat: TTSAudioFormat;
  sttProvider: string;
  ttsProvider: string;
}

export type VoiceErrorCode =
  | "EMPTY_AUDIO"
  | "NO_SPEECH"
  | "STT_FAILED"
  | "LLM_FAILED"
  | "TTS_FAILED";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  constructor(code: VoiceErrorCode, message: string) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class VoiceHandler {
  private readonly session: ChatSession;
  private readonly stt: STTProvider;
  private readonly tts: TTSProvider;
  private readonly store: MemoryStore;
  private readonly conversationId: number | null;

  constructor(opts: VoiceHandlerOptions) {
    this.session = opts.session;
    this.stt = opts.stt;
    this.tts = opts.tts;
    this.store = opts.store;
    this.conversationId = opts.conversationId ?? null;
  }

  async handle(audioBuffer: Buffer): Promise<VoiceHandlerResult> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new VoiceError("EMPTY_AUDIO", "empty audio buffer");
    }

    const audioBytes = audioBuffer.length;

    // 1. STT
    const t0 = Date.now();
    let transcription: string;
    try {
      transcription = await this.stt.transcribe(audioBuffer);
    } catch (exc) {
      const sttLatencyMs = Date.now() - t0;
      const msg = errMsg(exc);
      this.store.logVoiceCall({
        conversationId: this.conversationId,
        audioBytes,
        transcription: null,
        sttProvider: this.stt.name,
        sttLatencyMs,
        success: false,
        error: `stt: ${msg}`,
      });
      throw new VoiceError("STT_FAILED", `STT failed: ${msg}`);
    }
    const sttLatencyMs = Date.now() - t0;

    const trimmed = (transcription ?? "").trim();
    if (trimmed.length === 0) {
      this.store.logVoiceCall({
        conversationId: this.conversationId,
        audioBytes,
        transcription: "",
        sttProvider: this.stt.name,
        sttLatencyMs,
        success: false,
        error: "empty transcription",
      });
      throw new VoiceError("NO_SPEECH", "no speech detected");
    }

    // 2. Log parcial (STT ok) — registra audit antes de LLM/TTS
    const voiceCallId = this.store.logVoiceCall({
      conversationId: this.conversationId,
      audioBytes,
      transcription: trimmed,
      sttProvider: this.stt.name,
      sttLatencyMs,
      success: true,
    });

    // 3. ChatSession.send
    let message: string;
    try {
      message = await this.session.send(trimmed);
    } catch (exc) {
      const msg = errMsg(exc);
      if (voiceCallId != null) {
        this.store.updateVoiceCall(voiceCallId, {
          success: false,
          error: `llm: ${msg}`,
        });
      }
      throw new VoiceError("LLM_FAILED", `ChatSession.send failed: ${msg}`);
    }

    // 4. TTS
    const t2 = Date.now();
    let ttsAudio: Buffer;
    let ttsFormat: TTSAudioFormat;
    let ttsProviderName: string;
    try {
      const result = await this.tts.synthesize(message);
      ttsAudio = result.audio;
      ttsFormat = result.format;
      ttsProviderName = result.providerUsed ?? this.tts.name;
    } catch (exc) {
      const msg = errMsg(exc);
      if (voiceCallId != null) {
        this.store.updateVoiceCall(voiceCallId, {
          success: false,
          error: `tts: ${msg}`,
        });
      }
      throw new VoiceError("TTS_FAILED", `TTS failed: ${msg}`);
    }
    const ttsLatencyMs = Date.now() - t2;

    // 5. Audit final: success + métricas TTS
    if (voiceCallId != null) {
      this.store.updateVoiceCall(voiceCallId, {
        ttsProvider: ttsProviderName,
        ttsLatencyMs,
        ttsBytes: ttsAudio.length,
        success: true,
      });
    }

    return {
      transcription: trimmed,
      message,
      audio: ttsAudio,
      audioFormat: ttsFormat,
      sttProvider: this.stt.name,
      ttsProvider: ttsProviderName,
    };
  }
}
