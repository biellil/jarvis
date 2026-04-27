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
    const handlePttToggle = async () => {
      if (voiceInputManager.getCurrentSource() === 'ptt') {
        voiceInputManager.release('ptt');

        // NÃO checar `isRecording` aqui — closure stale faz o handler sair
        // sem parar o recorder se o React ainda não re-renderizou desde o
        // start. stopRecording() já trata internamente o caso de não ter
        // recorder ativo (retorna null).
        try {
          const audioBuffer = await stopRecording();
          if (!audioBuffer) {
            setState('idle');
            return;
          }
          await sendAudioAndHandle(audioBuffer, {
            setState,
            setToast,
            addHumanMessage,
            addAgentMessage,
            source: 'ptt',
          });
        } catch (error) {
          console.error('[usePttHandler] stop error:', error);
          setToast({ message: 'Erro inesperado no PTT.', variant: 'error' });
          setState('idle');
        }
      } else {
        const grant = voiceInputManager.acquire('ptt');
        if ('error' in grant) {
          console.warn('[usePttHandler] PTT acquire BUSY — abortando');
          return;
        }

        try {
          await startRecording();
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
