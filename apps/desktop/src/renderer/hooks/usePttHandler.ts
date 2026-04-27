import { useEffect } from 'react';
import { useOrbContext } from '../components/Orb/OrbContext';
import { useChat } from '../src/chat/ChatContext';
import { useAudioRecorder } from './useAudioRecorder';
import { sendAudioAndHandle } from '../src/voice/sendAudioAndHandle';
import { voiceInputManager } from '../src/voice/voiceInputManager';

/**
 * usePttHandler — listener global de ptt:action para o modo PTT-only.
 *
 * ChatInput não está montado no App.tsx (orb-only UI), portanto o listener
 * de ptt:action que vivia nele nunca era ativado. Este hook centraliza o
 * handling de PTT no nível do App para que funcione independentemente de
 * qual componente está visível.
 *
 * Deve ser chamado dentro de OrbProvider + ChatProvider.
 */
export function usePttHandler(): void {
  const { setState } = useOrbContext();
  const { addHumanMessage, addAgentMessage, setToast } = useChat();
  const { startRecording, stopRecording } = useAudioRecorder();

  useEffect(() => {
    // Debounce contra ptt:action duplicado. React.StrictMode + contextBridge
    // do Electron resulta em 2 listeners ativos em dev (cleanup do useEffect
    // não remove o wrapper criado por on() porque cada cruzamento da bridge
    // gera proxy novo). Nenhum humano toggla PTT em <200ms — qualquer evento
    // nessa janela é ruído duplicado.
    let lastPttAt = 0;

    const handlePttToggle = async () => {
      const now = performance.now();
      const gap = now - lastPttAt;
      if (gap < 200) {
        console.log(
          `[usePttHandler] ignorando ptt:action duplicado @ ${now.toFixed(0)}ms (gap: ${gap.toFixed(0)}ms)`,
        );
        return;
      }
      lastPttAt = now;

      const currentSource = voiceInputManager.getCurrentSource();
      console.log(
        `[usePttHandler] ptt:action recebido @ ${now.toFixed(0)}ms — currentSource:`,
        currentSource,
      );

      if (currentSource === 'ptt') {
        console.log('[usePttHandler] branch=STOP — chamando stopRecording()');
        voiceInputManager.release('ptt');

        // NÃO checar `isRecording` aqui — closure stale faz o handler sair
        // sem parar o recorder se o React ainda não re-renderizou desde o
        // start. stopRecording() já trata internamente o caso de não ter
        // recorder ativo (retorna null).
        try {
          try {
            const audioBuffer = await stopRecording();
            console.log(
              '[usePttHandler] stopRecording resolveu — audioBuffer:',
              audioBuffer ? audioBuffer.length + ' bytes' : 'null',
            );
            if (!audioBuffer) {
              console.log('[usePttHandler] audioBuffer null — setState(idle) e retornando');
              setToast({
                message: 'Toggle muito rápido — segura uns 2 segundos e fala antes de apertar de novo.',
                variant: 'info',
              });
              setState('idle');
              return;
            }
            console.log(
              '[usePttHandler] chamando sendAudioAndHandle —',
              audioBuffer.length,
              'bytes',
            );
            await sendAudioAndHandle(audioBuffer, {
              setState,
              setToast,
              addHumanMessage,
              addAgentMessage,
              source: 'ptt',
            });
            console.log('[usePttHandler] sendAudioAndHandle completou');
          } catch (error) {
            console.error('[usePttHandler] erro no branch STOP:', error);
            setToast({ message: 'Erro inesperado no PTT.', variant: 'error' });
            setState('idle');
          }
        } finally {
          // Defesa: setState('idle') só se ainda estivermos em 'listening'.
          // sendAudioAndHandle já transita pra processing→responding→idle no
          // caminho feliz; este finally é fallback contra bugs/throws perdidos.
          // NÃO chamar setState('idle') incondicional aqui — sendAudioAndHandle
          // tem invariante de idle no finally interno dele.
          console.log('[usePttHandler] branch STOP finally — fluxo terminou');
        }
      } else {
        console.log('[usePttHandler] branch=START — adquirindo mic');
        const grant = voiceInputManager.acquire('ptt');
        if ('error' in grant) {
          console.warn('[usePttHandler] PTT acquire BUSY — abortando');
          return;
        }
        console.log('[usePttHandler] grant adquirido — chamando startRecording()');

        try {
          await startRecording();

          // Race guard: se o usuário apertou STOP enquanto startRecording
          // estava awaiting (ex: getUserMedia), o STOP branch já liberou o
          // voiceInputManager e chamou setState('idle'). Não devemos sobrescrever
          // com 'listening' aqui — caso contrário o orb fica preso amarelo
          // mesmo após o STOP completar (último setState ganharia).
          if (voiceInputManager.getCurrentSource() !== 'ptt') {
            console.log(
              '[usePttHandler] start cancelado — STOP ocorreu durante startRecording',
            );
            return;
          }

          console.log('[usePttHandler] startRecording resolveu — setState(listening)');
          setState('listening');
        } catch (error) {
          voiceInputManager.release('ptt');
          console.error('[usePttHandler] start error:', error);
          setState('idle');
        }
      }
    };

    window.jarvis?.ipcRenderer?.on('ptt:action', handlePttToggle);
    return () => {
      window.jarvis?.ipcRenderer?.off('ptt:action', handlePttToggle);
    };
  }, [setState, setToast, addHumanMessage, addAgentMessage, startRecording, stopRecording]);
}
