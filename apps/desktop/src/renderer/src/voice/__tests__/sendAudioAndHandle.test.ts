/**
 * sendAudioAndHandle — Phase 24 Plan 02 (D-07)
 *
 * Testes unitários da função pura que orquestra o pipeline renderer:
 *   setState('processing') → window.jarvis.sendAudio → handleAudioResponse → setState('idle')
 *
 * Cobertura:
 *   - Happy path (5 casos)
 *   - Error response path via handleAudioResponse (2 casos)
 *   - TTS failure degrade — D-06 (1 caso)
 *   - Thrown exception path (1 caso)
 *   - Invariant: final state = 'idle' (1 caso)
 *   - D-08 exact pt-BR toast strings regression guard (5 casos via it.each)
 *
 * Total: ≥15 `it` assertions, ≥11 `it`/`it.each` blocks.
 *
 * Strategy note sobre D-08: as 5 strings canônicas do CONTEXT.md §D-08 (linhas 103-109)
 * não existem em `lib/errorMessages.mapErrorCode`. `sendAudioAndHandle` mapeia os códigos
 * de erro dos cenários D-08 diretamente para as strings literais antes de delegar pra
 * `handleAudioResponse`. Esses testes travam o contrato — qualquer drift nas strings
 * quebra a suite da Phase 24 imediatamente.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sendAudioAndHandle,
  type SendAudioAndHandleDeps,
} from '../sendAudioAndHandle';
import type { SendAudioResponse } from '../../../../shared/ipc-types';

vi.mock('../../audio/ttsPlayer', () => ({
  playTTSResponse: vi.fn().mockResolvedValue(undefined),
}));

// Importa DEPOIS do vi.mock pra pegar a versão mockada
import { playTTSResponse } from '../../audio/ttsPlayer';

type TestDeps = SendAudioAndHandleDeps & { stateHistory: string[] };

function makeDeps(): TestDeps {
  const stateHistory: string[] = [];
  return {
    setState: vi.fn((s: string) => {
      stateHistory.push(s);
    }) as unknown as SendAudioAndHandleDeps['setState'],
    setToast: vi.fn(),
    addHumanMessage: vi.fn(),
    addAgentMessage: vi.fn(),
    stateHistory,
  };
}

function successResponse(): SendAudioResponse {
  return {
    success: true,
    data: {
      transcription: 'que horas são',
      message: 'São 14:30, senhor.',
      audioBase64: 'dGVzdA==',
      audioFormat: 'mp3',
      sttProvider: 'whisper',
      ttsProvider: 'kokoro',
    },
  };
}

function errorResponse(code = 'HTTP_500', message = 'boom'): SendAudioResponse {
  return { success: false, error: { code, message } };
}

describe('sendAudioAndHandle', () => {
  let deps: TestDeps;
  let sendAudioMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (playTTSResponse as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    sendAudioMock = vi.fn();
    (globalThis as unknown as { window: { jarvis: unknown } }).window = {
      jarvis: { sendAudio: sendAudioMock },
    };
    deps = makeDeps();
  });

  // ---------- Happy path ----------

  it('happy path: transições de estado são processing → responding → idle', async () => {
    sendAudioMock.mockResolvedValueOnce(successResponse());
    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);
    expect(deps.stateHistory).toEqual(['processing', 'responding', 'idle']);
  });

  it('happy path: window.jarvis.sendAudio chamado com o Uint8Array exato', async () => {
    sendAudioMock.mockResolvedValueOnce(successResponse());
    const buffer = new Uint8Array([10, 20, 30, 40]);
    await sendAudioAndHandle(buffer, deps);
    expect(sendAudioMock).toHaveBeenCalledTimes(1);
    expect(sendAudioMock).toHaveBeenCalledWith(buffer);
  });

  it('happy path: addHumanMessage recebe a transcription (via handleAudioResponse)', async () => {
    sendAudioMock.mockResolvedValueOnce(successResponse());
    await sendAudioAndHandle(new Uint8Array([1]), deps);
    expect(deps.addHumanMessage).toHaveBeenCalledWith('que horas são');
  });

  it('happy path: addAgentMessage recebe a message (via handleAudioResponse)', async () => {
    sendAudioMock.mockResolvedValueOnce(successResponse());
    await sendAudioAndHandle(new Uint8Array([1]), deps);
    expect(deps.addAgentMessage).toHaveBeenCalledWith('São 14:30, senhor.');
  });

  it('happy path: nenhum toast quando TTS toca com sucesso', async () => {
    sendAudioMock.mockResolvedValueOnce(successResponse());
    await sendAudioAndHandle(new Uint8Array([1]), deps);
    expect(deps.setToast).not.toHaveBeenCalled();
  });

  // ---------- Error response path (via handleAudioResponse) ----------

  it('error response: estado vai processing → idle (nunca responding)', async () => {
    sendAudioMock.mockResolvedValueOnce(errorResponse('HTTP_500'));
    await sendAudioAndHandle(new Uint8Array([1]), deps);
    expect(deps.stateHistory).toEqual(['processing', 'idle']);
    expect(deps.stateHistory).not.toContain('responding');
  });

  it('error response: setToast recebe objeto ToastState em pt-BR', async () => {
    sendAudioMock.mockResolvedValueOnce(errorResponse('HTTP_500'));
    await sendAudioAndHandle(new Uint8Array([1]), deps);
    expect(deps.setToast).toHaveBeenCalledTimes(1);
    const call = (deps.setToast as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      message: expect.stringContaining('Erro interno'),
      variant: 'error',
    });
  });

  // ---------- TTS failure degrade (D-06) ----------

  it('TTS failure: addAgentMessage ainda é chamado, toast warning emitido, estado termina idle', async () => {
    sendAudioMock.mockResolvedValueOnce(successResponse());
    (playTTSResponse as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('audio context closed'),
    );
    await sendAudioAndHandle(new Uint8Array([1]), deps);

    // D-06: texto já estava na história ANTES do playTTS falhar
    expect(deps.addAgentMessage).toHaveBeenCalledWith('São 14:30, senhor.');

    // handleAudioResponse emite warning toast quando playTTS rejeita
    expect(deps.setToast).toHaveBeenCalledWith({
      message: 'Resposta pronta, mas não consegui tocar o áudio.',
      variant: 'warning',
    });

    // Invariante: final state é idle mesmo com TTS quebrado
    expect(deps.stateHistory[deps.stateHistory.length - 1]).toBe('idle');
  });

  // ---------- Thrown exception path ----------

  it('thrown exception: setToast recebe "Erro inesperado", estado termina idle', async () => {
    sendAudioMock.mockRejectedValueOnce(new Error('IPC crashed'));
    await sendAudioAndHandle(new Uint8Array([1]), deps);

    expect(deps.setToast).toHaveBeenCalledWith({
      message: 'Erro inesperado ao enviar áudio.',
      variant: 'error',
    });
    expect(deps.stateHistory[deps.stateHistory.length - 1]).toBe('idle');
  });

  // ---------- Idle invariant ----------

  it('invariant: final state é sempre idle (happy, error, exception)', async () => {
    // Happy
    sendAudioMock.mockResolvedValueOnce(successResponse());
    let happyDeps = makeDeps();
    await sendAudioAndHandle(new Uint8Array([1]), happyDeps);
    expect(happyDeps.stateHistory[happyDeps.stateHistory.length - 1]).toBe('idle');
    expect(happyDeps.stateHistory.length).toBeGreaterThanOrEqual(2);

    // Error response
    sendAudioMock.mockResolvedValueOnce(errorResponse('HTTP_500'));
    let errorDeps = makeDeps();
    await sendAudioAndHandle(new Uint8Array([1]), errorDeps);
    expect(errorDeps.stateHistory[errorDeps.stateHistory.length - 1]).toBe('idle');
    expect(errorDeps.stateHistory.length).toBeGreaterThanOrEqual(2);

    // Thrown exception
    sendAudioMock.mockRejectedValueOnce(new Error('IPC crashed'));
    let throwDeps = makeDeps();
    await sendAudioAndHandle(new Uint8Array([1]), throwDeps);
    expect(throwDeps.stateHistory[throwDeps.stateHistory.length - 1]).toBe('idle');
    expect(throwDeps.stateHistory.length).toBeGreaterThanOrEqual(2);
  });

  // ---------- D-08 exact pt-BR toast strings (regression guard) ----------
  // Contrato: CONTEXT.md §D-08 (linhas 101-111) trava estas 5 strings pt-BR EXATAS.
  // Este bloco é o regression guard da Phase 24 contra drift. Qualquer mudança
  // em `sendAudioAndHandle` (ou numa camada futura de mapping) que altere uma
  // dessas strings DEVE quebrar esta suite imediatamente.

  it.each([
    ['BACKEND_DOWN', 'JARVIS offline. Verifique o backend.'],
    ['LLM_TIMEOUT', 'JARVIS demorou demais. Tente de novo.'],
    ['MIC_MUTED', 'Microfone mudo — verifique permissões.'],
    ['SILENT_STREAM', 'Não ouvi nada. Diga Hey JARVIS de novo.'],
    ['VAD_ERROR', 'Erro na captura de áudio.'],
  ])(
    'D-08 exact pt-BR toast strings: emite string exata para o código %s',
    async (errorCode, expectedString) => {
      sendAudioMock.mockResolvedValueOnce({
        success: false,
        error: { code: errorCode, message: 'synthetic error for regression test' },
      });

      await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

      const toastCalls = (deps.setToast as ReturnType<typeof vi.fn>).mock.calls;
      const messages = toastCalls
        .map((call: unknown[]) => (call[0] as { message?: string } | null)?.message)
        .filter(Boolean);
      expect(messages).toContain(expectedString);

      // Invariante D-08: todos os cenários retornam a idle
      expect(deps.stateHistory[deps.stateHistory.length - 1]).toBe('idle');
    },
  );

  it('D-08 exact pt-BR toast strings: thrown exception também termina em idle', async () => {
    sendAudioMock.mockRejectedValueOnce(new Error('IPC crashed'));
    await sendAudioAndHandle(new Uint8Array([1]), deps);
    expect(deps.stateHistory[deps.stateHistory.length - 1]).toBe('idle');
  });
});
