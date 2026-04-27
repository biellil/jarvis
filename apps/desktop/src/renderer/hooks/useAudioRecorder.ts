import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Audio Recording Hook
 * Phase 19.5: WebM/Opus bruto pro backend — conversão STT roda server-side
 *
 * O backend (POST /api/chat/audio) aceita WebM/Opus diretamente via
 * nodejs-whisper + ffmpeg. Versão anterior (Fase 13) decodificava e
 * convertia pra WAV 16kHz no renderer; isso virou workaround.
 *
 * Pattern: MediaRecorder + getUserMedia → Uint8Array WebM cru.
 * - NotAllowedError → "permission denied"
 * - NotFoundError → "no microphone"
 *
 * Quick 260427-qzg fix bug 1 (re-prompt de permissão):
 * Stream cacheado entre gravações pra evitar prompt de permissão de mídia
 * a cada toggle do PTT. Antes: stopRecording() chamava
 * stream.getTracks().forEach(t => t.stop()) e zerava streamRef, então a
 * próxima chamada de startRecording() rodava getUserMedia de novo e o
 * Electron logava `[permission] request: media from: …` em todo aperto.
 *
 * Agora: o MediaStream vive até o unmount do hook (cleanup do useEffect).
 * Apenas o MediaRecorder é reciclado por gravação (MediaRecorder.stop() é
 * terminal — não dá pra reusar a mesma instância). Se uma track morrer
 * (ex: usuário desconectou USB mic), startRecording() detecta via
 * readyState !== 'live' e refaz getUserMedia.
 */

interface AudioRecorderState {
  isRecording: boolean;
  error: string | null;
}

interface AudioRecorderAPI {
  isRecording: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Uint8Array | null>;
}

export function useAudioRecorder(): AudioRecorderAPI {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Quick 260427-qzg: cleanup do stream cacheado SOMENTE no unmount do hook.
   * Cada track só é parada ao desmontar — entre toggles PTT, o stream segue
   * vivo para evitar re-prompt de permissão.
   */
  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  /**
   * Verifica se o stream cacheado ainda está utilizável. Se uma track morreu
   * (readyState !== 'live') — caso típico: USB mic desconectado — descarta
   * o stream e retorna false para forçar novo getUserMedia.
   *
   * Retorna boolean (não type predicate) de propósito — a branch !usable
   * ainda precisa lidar com `stream` possivelmente truthy para chamar
   * track.stop() antes do novo getUserMedia.
   */
  const isStreamUsable = (stream: MediaStream | null): boolean => {
    if (!stream) return false;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return false;
    return tracks.every((t) => t.readyState === 'live');
  };

  /**
   * Start recording from microphone.
   */
  const startRecording = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setState({
          isRecording: false,
          error: 'Audio recording not supported in this browser',
        });
        return;
      }

      chunksRef.current = [];
      setState({ isRecording: false, error: null });

      // Quick 260427-qzg: reusa stream cacheado entre toggles PTT. Só chama
      // getUserMedia se ainda não temos stream OU alguma track morreu.
      let stream: MediaStream;
      const cached = streamRef.current;
      if (isStreamUsable(cached)) {
        stream = cached as MediaStream;
      } else {
        if (cached) {
          // Track morreu — descarta antes de pedir nova.
          cached.getTracks().forEach((t) => t.stop());
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // timeslice 100ms: força emissão de chunks durante a gravação em vez
      // de esperar o stop(). Garante que mesmo uma gravação curta produza
      // pelo menos um cluster webm válido — sem isso, stops muito rápidos
      // saem só com EBML header (~110 bytes) e ffmpeg falha.
      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;

      setState({ isRecording: true, error: null });
    } catch (err) {
      console.error('[useAudioRecorder] startRecording error:', err);

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setState({
            isRecording: false,
            error: 'Microphone permission denied',
          });
        } else if (err.name === 'NotFoundError') {
          setState({
            isRecording: false,
            error: 'No microphone found',
          });
        } else {
          setState({
            isRecording: false,
            error: `Failed to start recording: ${err.message}`,
          });
        }
      } else {
        setState({
          isRecording: false,
          error: 'Failed to start recording',
        });
      }
    }
  }, []);

  /**
   * Stop recording and return raw WebM bytes.
   * Backend converte WebM → 16kHz mono via ffmpeg server-side.
   *
   * Quick 260427-qzg: NÃO chama track.stop() aqui — o stream segue cacheado
   * em streamRef até o unmount do hook. Apenas o MediaRecorder e os chunks
   * são reciclados para a próxima gravação.
   */
  const stopRecording = useCallback(async (): Promise<Uint8Array | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    console.log(
      '[useAudioRecorder] stopRecording chamado — recorder state:',
      mediaRecorder?.state ?? 'null',
    );

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.warn('[useAudioRecorder] stopRecording called but not recording');
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (value: Uint8Array | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const onStop = async () => {
        console.log(
          '[useAudioRecorder] evento stop recebido — chunks:',
          chunksRef.current.length,
        );
        clearTimeout(timeoutId);
        try {
          const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          console.log('[useAudioRecorder] Recorded WebM blob:', webmBlob.size, 'bytes');

          // Defesa em profundidade: com timeslice=100ms qualquer gravação real
          // produz cluster webm válido. Caso degenerado (0 chunks emitidos)
          // resulta em blob ~100 bytes só com EBML header — ffmpeg falha.
          // Threshold baixo só filtra esse caso, sem cortar gravações curtas.
          if (webmBlob.size < 200) {
            console.warn(
              '[useAudioRecorder] WebM muito pequeno (',
              webmBlob.size,
              'bytes) — provavelmente toggle rápido demais. Descartando.',
            );
            setState({ isRecording: false, error: null });
            mediaRecorderRef.current = null;
            chunksRef.current = [];
            safeResolve(null);
            return;
          }

          const arrayBuffer = await webmBlob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          console.log('[useAudioRecorder] resolvendo com', bytes.length, 'bytes');

          setState({ isRecording: false, error: null });

          // NOTE 260427-qzg: streamRef NÃO é zerado — segue vivo entre toggles.
          mediaRecorderRef.current = null;
          chunksRef.current = [];

          safeResolve(bytes);
        } catch (err) {
          console.error('[useAudioRecorder] stopRecording onstop error:', err);

          setState({
            isRecording: false,
            error:
              err instanceof Error
                ? `Failed to process audio: ${err.message}`
                : 'Failed to process audio',
          });

          // NOTE 260427-qzg: streamRef NÃO é zerado mesmo em erro — track segue viva.
          mediaRecorderRef.current = null;
          chunksRef.current = [];

          safeResolve(null);
        }
      };

      // Defesa contra hipótese principal do bug: mediaRecorder.stop() não
      // emite o evento 'stop' (incompatibilidade Electron/Chromium com
      // cached stream + recriação de MediaRecorder). Sem timeout, a Promise
      // trava forever → handler trava → orb fica em listening eterno.
      const timeoutId = setTimeout(() => {
        console.warn(
          '[useAudioRecorder] TIMEOUT 3s — evento stop não disparou. Forçando resolve(null).',
          'recorder.state era:',
          mediaRecorder.state,
        );
        // Limpa listener pendente para evitar resolve duplo (safeResolve já protege).
        mediaRecorder.removeEventListener('stop', onStop);
        setState({ isRecording: false, error: 'stop timeout' });
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        safeResolve(null);
      }, 3000);

      // addEventListener com { once: true } em vez de mediaRecorder.onstop:
      // a propriedade onstop é UMA SLOT — qualquer código (legado ou
      // pipeline externa) que setou onstop antes seria sobrescrito, e
      // o nosso onstop pode ser pisoteado por outro listener. addEventListener
      // é aditivo + { once: true } garante cleanup automático após disparo.
      mediaRecorder.addEventListener('stop', onStop, { once: true });

      console.log('[useAudioRecorder] chamando mediaRecorder.stop() + armando timeout 3s');
      mediaRecorder.stop();
      setState({ isRecording: false, error: null });
    });
  }, []);

  return {
    isRecording: state.isRecording,
    error: state.error,
    startRecording,
    stopRecording,
  };
}
