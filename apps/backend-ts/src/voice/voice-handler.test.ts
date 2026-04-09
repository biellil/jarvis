import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceHandler } from "./voice-handler.js";
import type { STTProvider } from "./stt/index.js";
import type { TTSProvider, TTSResult } from "./tts/index.js";
import type { ChatSession } from "../session/chat-session.js";
import type { MemoryStore } from "../memory/store.js";

function makeDeps(overrides: {
  stt?: Partial<STTProvider>;
  tts?: Partial<TTSProvider>;
  sessionSend?: (text: string) => Promise<string>;
  logReturn?: number | null;
} = {}) {
  const stt: STTProvider = {
    name: "local",
    transcribe: vi.fn().mockResolvedValue("olá jarvis"),
    ...overrides.stt,
  } as STTProvider;

  const ttsResult: TTSResult = {
    audio: Buffer.from([1, 2, 3]),
    format: "mp3",
    providerUsed: "elevenlabs",
  };
  const tts: TTSProvider = {
    name: "elevenlabs+local",
    synthesize: vi.fn().mockResolvedValue(ttsResult),
    ...overrides.tts,
  } as TTSProvider;

  const session = {
    send: vi.fn(overrides.sessionSend ?? (async () => "oi humano!")),
  } as unknown as ChatSession;

  const store = {
    logVoiceCall: vi.fn().mockReturnValue(overrides.logReturn ?? 42),
    updateVoiceCall: vi.fn(),
  } as unknown as MemoryStore;

  return { stt, tts, session, store };
}

describe("VoiceHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("happy path: STT → session.send → TTS → audit success", async () => {
    const { stt, tts, session, store } = makeDeps();
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    const out = await h.handle(Buffer.from([9, 9, 9]));
    expect(out).toMatchObject({
      transcription: "olá jarvis",
      message: "oi humano!",
      audioFormat: "mp3",
      sttProvider: "local",
      ttsProvider: "elevenlabs",
    });
    expect(out.audio).toEqual(Buffer.from([1, 2, 3]));
    expect(stt.transcribe).toHaveBeenCalledWith(expect.any(Buffer));
    expect(session.send).toHaveBeenCalledWith("olá jarvis");
    expect(tts.synthesize).toHaveBeenCalledWith("oi humano!");
    expect(store.logVoiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 1,
        audioBytes: 3,
        transcription: "olá jarvis",
        sttProvider: "local",
        success: true,
      }),
    );
    const logCall = (store.logVoiceCall as any).mock.calls[0][0];
    expect(typeof logCall.sttLatencyMs).toBe("number");
    expect(logCall.sttLatencyMs).toBeGreaterThanOrEqual(0);
    expect(store.updateVoiceCall).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        success: true,
        ttsProvider: "elevenlabs",
        ttsBytes: 3,
      }),
    );
    const upd = (store.updateVoiceCall as any).mock.calls[0][1];
    expect(typeof upd.ttsLatencyMs).toBe("number");
    expect(upd.ttsLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("empty audio buffer → throws EMPTY_AUDIO before calling STT", async () => {
    const { stt, tts, session, store } = makeDeps();
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    await expect(h.handle(Buffer.alloc(0))).rejects.toMatchObject({
      code: "EMPTY_AUDIO",
    });
    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(store.logVoiceCall).not.toHaveBeenCalled();
  });

  it("STT returns empty string → NO_SPEECH + audit row success=false", async () => {
    const { stt, tts, session, store } = makeDeps({
      stt: { transcribe: vi.fn().mockResolvedValue("   ") },
    });
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    await expect(h.handle(Buffer.from([1]))).rejects.toMatchObject({
      code: "NO_SPEECH",
    });
    expect(store.logVoiceCall).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) }),
    );
    expect(session.send).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("STT throws → STT_FAILED + audit row success=false", async () => {
    const { stt, tts, session, store } = makeDeps({
      stt: { transcribe: vi.fn().mockRejectedValue(new Error("whisper boom")) },
    });
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    await expect(h.handle(Buffer.from([1]))).rejects.toMatchObject({
      code: "STT_FAILED",
    });
    expect(store.logVoiceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("whisper boom"),
        transcription: null,
      }),
    );
    expect(session.send).not.toHaveBeenCalled();
  });

  it("session.send throws → LLM_FAILED + updateVoiceCall success=false", async () => {
    const { stt, tts, session, store } = makeDeps({
      sessionSend: async () => {
        throw new Error("llm down");
      },
    });
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    await expect(h.handle(Buffer.from([1]))).rejects.toMatchObject({
      code: "LLM_FAILED",
    });
    expect(store.logVoiceCall).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    expect(store.updateVoiceCall).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("llm down"),
      }),
    );
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("tts.synthesize throws → TTS_FAILED + updateVoiceCall success=false", async () => {
    const { stt, tts, session, store } = makeDeps({
      tts: { synthesize: vi.fn().mockRejectedValue(new Error("tts explode")) },
    });
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    await expect(h.handle(Buffer.from([1]))).rejects.toMatchObject({
      code: "TTS_FAILED",
    });
    expect(store.updateVoiceCall).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        success: false,
        error: expect.stringContaining("tts explode"),
      }),
    );
  });

  it("fallback providerUsed='local' → ttsProvider output === 'local'", async () => {
    const { stt, tts, session, store } = makeDeps({
      tts: {
        name: "elevenlabs+local",
        synthesize: vi.fn().mockResolvedValue({
          audio: Buffer.from([7]),
          format: "wav",
          providerUsed: "local",
        }),
      },
    });
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: 1 });
    const out = await h.handle(Buffer.from([1]));
    expect(out.ttsProvider).toBe("local");
    expect(out.audioFormat).toBe("wav");
    expect(store.updateVoiceCall).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ ttsProvider: "local", success: true }),
    );
  });

  it("latências são números >= 0", async () => {
    const { stt, tts, session, store } = makeDeps();
    const h = new VoiceHandler({ session, stt, tts, store, conversationId: null });
    await h.handle(Buffer.from([1, 2]));
    const logArgs = (store.logVoiceCall as any).mock.calls[0][0];
    const updArgs = (store.updateVoiceCall as any).mock.calls[0][1];
    expect(logArgs.sttLatencyMs).toBeGreaterThanOrEqual(0);
    expect(updArgs.ttsLatencyMs).toBeGreaterThanOrEqual(0);
    expect(logArgs.conversationId).toBeNull();
  });
});
