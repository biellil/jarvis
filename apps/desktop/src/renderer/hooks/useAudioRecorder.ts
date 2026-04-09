import { useState, useRef, useCallback } from 'react';

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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
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
   */
  const stopRecording = useCallback(async (): Promise<Uint8Array | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.warn('[useAudioRecorder] stopRecording called but not recording');
      return null;
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        try {
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }

          const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          console.log('[useAudioRecorder] Recorded WebM blob:', webmBlob.size, 'bytes');

          const arrayBuffer = await webmBlob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          setState({ isRecording: false, error: null });

          mediaRecorderRef.current = null;
          streamRef.current = null;
          chunksRef.current = [];

          resolve(bytes);
        } catch (err) {
          console.error('[useAudioRecorder] stopRecording error:', err);

          setState({
            isRecording: false,
            error:
              err instanceof Error
                ? `Failed to process audio: ${err.message}`
                : 'Failed to process audio',
          });

          mediaRecorderRef.current = null;
          streamRef.current = null;
          chunksRef.current = [];

          resolve(null);
        }
      };

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
