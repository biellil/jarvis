import { describe, it, expect } from 'vitest';
import { mapErrorCode, isRecoverableWithMessage } from '../errorMessages';

describe('mapErrorCode', () => {
  it('mapeia EMPTY_AUDIO', () => {
    expect(mapErrorCode('EMPTY_AUDIO')).toBe('Não recebi nenhum áudio. Tenta de novo.');
  });

  it('mapeia NO_SPEECH', () => {
    expect(mapErrorCode('NO_SPEECH')).toBe(
      'Não consegui ouvir sua mensagem. Fala mais perto do microfone?',
    );
  });

  it('mapeia STT_FAILED', () => {
    expect(mapErrorCode('STT_FAILED')).toBe('Erro ao transcrever áudio. Tenta de novo.');
  });

  it('mapeia LLM_FAILED', () => {
    expect(mapErrorCode('LLM_FAILED')).toBe('Erro ao processar sua mensagem.');
  });

  it('mapeia TTS_FAILED', () => {
    expect(mapErrorCode('TTS_FAILED')).toBe('Resposta pronta, mas não consegui gerar o áudio.');
  });

  it('mapeia NETWORK', () => {
    expect(mapErrorCode('NETWORK')).toBe('Sem conexão com o servidor.');
  });

  it('mapeia TIMEOUT', () => {
    expect(mapErrorCode('TIMEOUT')).toBe('O servidor demorou pra responder. Tenta de novo.');
  });

  it('mapeia NO_API_KEY', () => {
    expect(mapErrorCode('NO_API_KEY')).toBe('API key do JARVIS não configurada.');
  });

  it('mapeia HTTP_429', () => {
    expect(mapErrorCode('HTTP_429')).toBe('JARVIS está ocupado. Aguarde um instante.');
  });

  it('mapeia HTTP_500 via prefix 5xx', () => {
    expect(mapErrorCode('HTTP_500')).toBe('Erro interno. Tenta de novo em alguns segundos.');
    expect(mapErrorCode('HTTP_503')).toBe('Erro interno. Tenta de novo em alguns segundos.');
  });

  it('mapeia HTTP_4xx outros com fallback', () => {
    expect(mapErrorCode('HTTP_400', 'Payload inválido')).toBe('Payload inválido');
    expect(mapErrorCode('HTTP_404')).toBe('Requisição inválida.');
  });

  it('usa fallback para código desconhecido', () => {
    expect(mapErrorCode('WAT', 'detalhe')).toBe('detalhe');
    expect(mapErrorCode('WAT')).toBe('Erro desconhecido.');
  });
});

describe('isRecoverableWithMessage', () => {
  it('true apenas para TTS_FAILED', () => {
    expect(isRecoverableWithMessage('TTS_FAILED')).toBe(true);
    expect(isRecoverableWithMessage('STT_FAILED')).toBe(false);
    expect(isRecoverableWithMessage('NO_SPEECH')).toBe(false);
    expect(isRecoverableWithMessage('UNKNOWN')).toBe(false);
  });
});
