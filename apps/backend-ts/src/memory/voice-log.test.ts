/**
 * Tests for MemoryStore.logVoiceCall / updateVoiceCall (Phase 19-05).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryStore } from './store.js';

describe('MemoryStore voice_calls', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('logVoiceCall insere linha e retorna id', () => {
    const convId = store.startConversation();
    expect(convId).not.toBeNull();

    const id = store.logVoiceCall({
      conversationId: convId,
      audioBytes: 12345,
      transcription: 'hello jarvis',
      sttProvider: 'faster-whisper',
      sttLatencyMs: 250,
      success: true,
    });

    expect(id).not.toBeNull();
    expect(typeof id).toBe('number');
  });

  it('logVoiceCall aceita conversationId null e transcription null', () => {
    const id = store.logVoiceCall({
      conversationId: null,
      audioBytes: 100,
      transcription: null,
      sttProvider: 'whisper',
      sttLatencyMs: null,
      success: false,
      error: 'stt timeout',
    });
    expect(id).not.toBeNull();
  });

  it('updateVoiceCall patch parcial só atualiza campos presentes', () => {
    const id = store.logVoiceCall({
      conversationId: null,
      audioBytes: 100,
      transcription: 'oi',
      sttProvider: 'whisper',
      sttLatencyMs: 50,
      success: true,
    })!;

    store.updateVoiceCall(id, {
      ttsProvider: 'kokoro',
      ttsLatencyMs: 120,
      ttsBytes: 9999,
    });

    const row = store.getVoiceCall(id);
    expect(row).not.toBeNull();
    expect(row!.ttsProvider).toBe('kokoro');
    expect(row!.ttsLatencyMs).toBe(120);
    expect(row!.ttsBytes).toBe(9999);
    // campos anteriores preservados
    expect(row!.transcription).toBe('oi');
    expect(row!.sttProvider).toBe('whisper');
    expect(row!.success).toBe(1);
  });

  it('updateVoiceCall converte success boolean→integer', () => {
    const id = store.logVoiceCall({
      conversationId: null,
      audioBytes: 1,
      transcription: null,
      sttProvider: 'x',
      sttLatencyMs: null,
      success: true,
    })!;

    store.updateVoiceCall(id, { success: false, error: 'tts crash' });
    const row = store.getVoiceCall(id);
    expect(row!.success).toBe(0);
    expect(row!.error).toBe('tts crash');
  });

  it('logVoiceCall retorna null após close (graceful)', () => {
    store.close();
    const id = store.logVoiceCall({
      conversationId: null,
      audioBytes: 0,
      transcription: null,
      sttProvider: 'x',
      sttLatencyMs: null,
      success: false,
    });
    expect(id).toBeNull();
  });
});
