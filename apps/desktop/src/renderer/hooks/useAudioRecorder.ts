import { useState, useRef, useCallback } from 'react';
import audioBufferToWav from 'audiobuffer-to-wav';

/**
 * Audio Recording Hook
 * Phase 13, Plan 03 - Browser audio recording with WAV conversion
 *
 * Pattern 1 (D-07): MediaRecorder with getUserMedia for browser audio capture
 * Pattern 2 (D-08/D-09): AudioContext decoding + audiobuffer-to-wav conversion
 * D-11: 16kHz sample rate for Whisper compatibility
 * D-12: NotAllowedError → clear permission denial message
 *
 * Pitfall 2: Check navigator.mediaDevices exists (older browsers)
 * Pitfall 3: Resume suspended AudioContext before decode
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
   * Start recording from microphone
   * D-07: getUserMedia → MediaRecorder → collect chunks
   */
  const startRecording = useCallback(async () => {
    try {
      // Pitfall 2: Check navigator.mediaDevices exists
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setState({
          isRecording: false,
          error: 'Audio recording not supported in this browser',
        });
        return;
      }

      // Clear previous state
      chunksRef.current = [];
      setState({ isRecording: false, error: null });

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create MediaRecorder with WebM/Opus codec
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      // Collect audio chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      setState({ isRecording: true, error: null });
    } catch (err) {
      console.error('[useAudioRecorder] startRecording error:', err);

      // D-12: Specific error messages for common cases
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
   * Stop recording and convert to WAV
   * D-08/D-09: WebM Blob → ArrayBuffer → AudioContext decode → WAV
   * D-11: 16kHz sample rate for Whisper
   */
  const stopRecording = useCallback(async (): Promise<Uint8Array | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.warn('[useAudioRecorder] stopRecording called but not recording');
      return null;
    }

    return new Promise((resolve) => {
      // Handle stop event
      mediaRecorder.onstop = async () => {
        try {
          // Stop all tracks to release microphone
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }

          // Create Blob from chunks
          const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          console.log('[useAudioRecorder] Recorded WebM blob:', webmBlob.size, 'bytes');

          // Convert Blob to ArrayBuffer
          const arrayBuffer = await webmBlob.arrayBuffer();

          // D-11: Create AudioContext with 16kHz for Whisper
          const audioContext = new AudioContext({ sampleRate: 16000 });

          // Pitfall 3: Resume suspended AudioContext
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }

          // Decode audio data
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          console.log(
            '[useAudioRecorder] Decoded audio:',
            audioBuffer.duration,
            'seconds',
            audioBuffer.sampleRate,
            'Hz'
          );

          // Convert to WAV using audiobuffer-to-wav
          const wavArrayBuffer = audioBufferToWav(audioBuffer);
          const wavUint8Array = new Uint8Array(wavArrayBuffer);
          console.log('[useAudioRecorder] WAV size:', wavUint8Array.length, 'bytes');

          // Update state
          setState({ isRecording: false, error: null });

          // Clean up
          await audioContext.close();
          mediaRecorderRef.current = null;
          streamRef.current = null;
          chunksRef.current = [];

          resolve(wavUint8Array);
        } catch (err) {
          console.error('[useAudioRecorder] stopRecording conversion error:', err);

          setState({
            isRecording: false,
            error:
              err instanceof Error ? `Failed to process audio: ${err.message}` : 'Failed to process audio',
          });

          // Clean up on error
          mediaRecorderRef.current = null;
          streamRef.current = null;
          chunksRef.current = [];

          resolve(null);
        }
      };

      // Stop the MediaRecorder
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
