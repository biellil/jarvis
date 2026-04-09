import { describe, it, expect, vi } from 'vitest';
import { handleAudioResponse } from '../handleAudioResponse';
import type { SendAudioResponse } from '../../../../shared/ipc-types';

function makeDeps() {
  return {
    addHumanMessage: vi.fn(),
    addAgentMessage: vi.fn(),
    setToast: vi.fn(),
    playTTS: vi.fn().mockResolvedValue(undefined),
  };
}

describe('handleAudioResponse', () => {
  it('success: insere human+agent e toca TTS', async () => {
    const deps = makeDeps();
    const resp: SendAudioResponse = {
      success: true,
      data: {
        transcription: 'oi',
        message: 'olá, como posso ajudar?',
        audioBase64: 'AAAA',
        audioFormat: 'mp3',
        sttProvider: 'whisper',
        ttsProvider: 'kokoro',
      },
    };
    await handleAudioResponse(resp, deps);
    expect(deps.addHumanMessage).toHaveBeenCalledWith('oi');
    expect(deps.addAgentMessage).toHaveBeenCalledWith('olá, como posso ajudar?');
    expect(deps.playTTS).toHaveBeenCalledWith('AAAA', 'mp3');
    expect(deps.setToast).not.toHaveBeenCalled();
  });

  it('success mas TTS player falha: mensagens ficam, toast warning', async () => {
    const deps = makeDeps();
    deps.playTTS.mockRejectedValueOnce(new Error('decode boom'));
    const resp: SendAudioResponse = {
      success: true,
      data: {
        transcription: 't',
        message: 'm',
        audioBase64: 'zz',
        audioFormat: 'wav',
        sttProvider: 'x',
        ttsProvider: 'y',
      },
    };
    await handleAudioResponse(resp, deps);
    expect(deps.addHumanMessage).toHaveBeenCalledWith('t');
    expect(deps.addAgentMessage).toHaveBeenCalledWith('m');
    expect(deps.setToast).toHaveBeenCalledWith({
      message: 'Resposta pronta, mas não consegui tocar o áudio.',
      variant: 'warning',
    });
  });

  it('error NO_SPEECH: toast error, sem mensagens, sem playTTS', async () => {
    const deps = makeDeps();
    const resp: SendAudioResponse = {
      success: false,
      error: { code: 'NO_SPEECH', message: 'whatever' },
    };
    await handleAudioResponse(resp, deps);
    expect(deps.addHumanMessage).not.toHaveBeenCalled();
    expect(deps.addAgentMessage).not.toHaveBeenCalled();
    expect(deps.playTTS).not.toHaveBeenCalled();
    expect(deps.setToast).toHaveBeenCalledWith({
      message: 'Não consegui ouvir sua mensagem. Fala mais perto do microfone?',
      variant: 'error',
    });
  });

  it('error TTS_FAILED: toast warning', async () => {
    const deps = makeDeps();
    const resp: SendAudioResponse = {
      success: false,
      error: { code: 'TTS_FAILED', message: 'tts down' },
    };
    await handleAudioResponse(resp, deps);
    expect(deps.setToast).toHaveBeenCalledWith({
      message: 'Resposta pronta, mas não consegui gerar o áudio.',
      variant: 'warning',
    });
  });

  it('error HTTP_500: mensagem de erro interno', async () => {
    const deps = makeDeps();
    const resp: SendAudioResponse = {
      success: false,
      error: { code: 'HTTP_500', message: 'boom' },
    };
    await handleAudioResponse(resp, deps);
    expect(deps.setToast).toHaveBeenCalledWith({
      message: 'Erro interno. Tenta de novo em alguns segundos.',
      variant: 'error',
    });
  });
});
