import { useState, useRef, useEffect } from 'react';
import { useOrbContext } from '../Orb/OrbContext';
import { SpeechBubble } from '../SpeechBubble';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useChat } from '../../src/chat/ChatContext';
import { sendAudioAndHandle } from '../../src/voice/sendAudioAndHandle';
import { voiceInputManager } from '../../src/voice/voiceInputManager';
import '../SpeechBubble/SpeechBubble.css';
import type { VisionScreenshotPayload } from '../../../shared/ipc-types';

/**
 * Reads a File and returns a base64 data URL.
 * Used for paste and drop image handling (D-06, VISION-02).
 */
async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}

/**
 * ChatInput Component
 * Phase 12, Plan 02 - Text input UI with button toggle
 * Phase 12, Plan 04 - Speech bubble integration and state orchestration
 * Phase 13, Plan 03 - Temporary audio recording button (will be replaced by PTT in Wave 3)
 * Phase 13, Plan 04 - PTT hotkey integration with orb state transitions
 * Phase 63 - Vision Pipeline: paste/drop image, screenshot hotkey, CHAT_SEND_IMAGE
 *
 * D-01: Button with keyboard icon toggles input visibility
 * D-02: Text input field below orb
 * D-03: Discrete positioning near orb
 * D-04: Enter key submits message via window.jarvis.sendText
 * D-06: Paste / drag-drop image → thumbnail preview + CHAT_SEND_IMAGE on submit
 * D-16: PTT start → listening state with "Gravando..." tooltip
 * D-17/D-18: PTT stop → processing → responding → idle (2s)
 */
export function ChatInput() {
  const [showInput, setShowInput] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setState } = useOrbContext();
  const { addHumanMessage, addAgentMessage, setToast } = useChat();
  const { isRecording, error: recordError, startRecording, stopRecording } = useAudioRecorder();

  // Auto-focus input when shown
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  /**
   * Handle PTT start recording
   * D-16: Start recording and set orb to listening state
   */
  const handleStartRecording = async () => {
    // Check if already recording
    if (isRecording) {
      console.warn('[ChatInput] PTT start called but already recording');
      return;
    }

    try {
      // Clear previous reply
      setReply('');

      // Start recording
      await startRecording();

      // D-16: Set orb to listening state
      setState('listening');

      console.log('[ChatInput] PTT recording started');
    } catch (error) {
      console.error('[ChatInput] Failed to start PTT recording:', error);
      setState('idle');
      setReply('Error: Failed to start recording');
    }
  };

  /**
   * Handle PTT stop recording
   * Phase 24 Plan 03 (WAKE-13): delegates to shared sendAudioAndHandle helper
   * (eliminates duplication with useWakeWord, D-07). Branch A: wraps
   * addAgentMessage to capture the last agent text into local `reply` state
   * so the SpeechBubble (which reads from local `reply` prop, not ChatContext)
   * continues to render the latest response.
   */
  const handleStopRecording = async () => {
    if (!isRecording) {
      console.warn('[ChatInput] PTT stop called but not recording');
      return;
    }

    try {
      const audioBuffer = await stopRecording();

      if (!audioBuffer) {
        setReply('Error: Failed to process audio');
        setState('idle');
        return;
      }

      console.log('[ChatInput] PTT audio recorded, delegating to sendAudioAndHandle...');

      // Branch A: closure-capture agent reply so SpeechBubble keeps working.
      // PTT is serialized (voiceInputManager guarantees single source) so the
      // closure capture cannot race across concurrent invocations.
      let agentReplyCapture = '';
      await sendAudioAndHandle(audioBuffer, {
        setState,
        setToast,
        addHumanMessage,
        addAgentMessage: (text: string) => {
          agentReplyCapture = text;
          addAgentMessage(text);
        },
        source: 'ptt', // Phase 28 Plan 02 (D-02): source tracking
      });

      if (agentReplyCapture) {
        setReply(agentReplyCapture);
      }
    } catch (error) {
      // sendAudioAndHandle is contractually non-throwing; this is a safety net
      // for unexpected errors from stopRecording() itself.
      console.error('[ChatInput] Failed to process PTT audio:', error);
      setToast({ message: 'Erro inesperado no PTT.', variant: 'error' });
      setState('idle');
      setReply('Error: ' + (error instanceof Error ? error.message : 'Failed to process audio'));
    }
  };

  // PTT event listener (Phase 13, Plan 04 → Phase 22 Plan 01 refactor)
  // Phase 22: payload do IPC é sempre 'toggle'. Consulta o VoiceInputManager
  // (WAKE-07) antes de start/stop — PTT preempta wakeword, rejeitado se BUSY.
  useEffect(() => {
    const handlePttToggle = async () => {
      console.log('[ChatInput] PTT toggle received');
      if (voiceInputManager.getCurrentSource() === 'ptt') {
        voiceInputManager.release('ptt');
        await handleStopRecording();
      } else {
        const grant = voiceInputManager.acquire('ptt');
        if ('error' in grant) {
          console.warn('[ChatInput] PTT acquire BUSY — aborting');
          return;
        }
        await handleStartRecording();
      }
    };

    // Register IPC listener for PTT events
    window.jarvis?.ipcRenderer?.on('ptt:action', handlePttToggle);

    // Cleanup on unmount
    return () => {
      window.jarvis?.ipcRenderer?.off('ptt:action', handlePttToggle);
    };
  }, [isRecording]); // Re-register when recording state changes

  // Phase 63 (VISION-03): Listen for screenshot hotkey trigger
  useEffect(() => {
    const handleScreenshotCaptured = (payload: VisionScreenshotPayload) => {
      if (payload.base64) {
        setPendingImage(payload.base64);
        setShowInput(true); // show text input so user can type their question
      }
    };

    const unsub = window.jarvis.vision?.onScreenshotCaptured(handleScreenshotCaptured);
    return () => {
      unsub?.();
    };
  }, []);

  // Phase 63 (VISION-02): Paste image from clipboard
  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return; // not an image paste — let default text paste proceed
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    try {
      const base64 = await readFileAsBase64(file);
      setPendingImage(base64);
    } catch (err) {
      console.error('[ChatInput] Failed to read pasted image:', err);
    }
  };

  // Phase 63 (VISION-02): Drag-over handler (required to allow drop)
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Phase 63 (VISION-02): Drop image file onto container
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith('image/'));
    if (!imageFile) return;
    try {
      const base64 = await readFileAsBase64(imageFile);
      setPendingImage(base64);
    } catch (err) {
      console.error('[ChatInput] Failed to read dropped image:', err);
    }
  };

  const handleToggle = () => {
    setShowInput((prev) => !prev);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();

    // D-04: Don't submit empty messages (require text even when image attached)
    if (!trimmed && !pendingImage) {
      return;
    }

    // Clear previous reply before sending new message
    setReply('');

    // Set orb to processing state
    setState('processing');

    try {
      if (pendingImage) {
        // Phase 63 (VISION-02 / VISION-03): send message + image via CHAT_SEND_IMAGE
        const result = await window.jarvis.vision?.sendImage({
          message: trimmed || 'O que está nesta imagem?',
          imageBase64: pendingImage,
        });
        setPendingImage(null); // clear after send
        setMessage('');

        if (result?.success && result.data) {
          setState('responding');
          setReply(result.data.reply);
          addHumanMessage(trimmed || '[imagem]');
          addAgentMessage(result.data.reply);
          setTimeout(() => setState('idle'), 2000);
        } else {
          setState('idle');
          setReply('Erro: ' + (result?.error ?? 'Falha ao analisar imagem'));
        }
      } else {
        // Original text-only path — unchanged
        const result = await window.jarvis.sendText(trimmed);

        // Clear input after successful send
        setMessage('');

        if (result.success && result.data) {
          // Set orb to responding state
          setState('responding');

          // Show response in bubble
          setReply(result.data.reply);

          // After 2 seconds, return to idle
          setTimeout(() => {
            setState('idle');
          }, 2000);
        } else {
          // Handle error response
          setState('idle');
          setReply('Error: ' + (result.error || 'Unknown error'));
        }
      }

      // Keep input focused for next message
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setState('idle');
      setReply('Error: ' + (error instanceof Error ? error.message : 'Failed to send message'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };


  return (
    <div
      className="chat-input-container"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Speech bubble appears above orb */}
      {reply && <SpeechBubble text={reply} />}

      {/* Show recording error if any */}
      {recordError && <div className="record-error">{recordError}</div>}

      {/* Phase 63 D-06: Thumbnail preview when image is pending */}
      {pendingImage && (
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            marginBottom: 4,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          <img
            src={pendingImage}
            alt="Pending image"
            style={{ maxHeight: 80, maxWidth: 120, borderRadius: 4, display: 'block' }}
          />
          <button
            onClick={() => setPendingImage(null)}
            aria-label="Remove image"
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: 18,
              height: 18,
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
          >
            ✕
          </button>
        </div>
      )}

      {/* D-01: Toggle button with keyboard icon */}
      <button
        className="chat-button"
        onClick={handleToggle}
        aria-label="Toggle chat input"
        title="Text input"
        style={{
          // D-13: Prevent button from being draggable
          WebkitAppRegion: 'no-drag',
        }}
      >
        ⌨
      </button>

      {/* D-02: Input field (conditionally rendered) */}
      {showInput && (
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message..."
          aria-label="Message input"
          style={{
            // Prevent input from being draggable
            WebkitAppRegion: 'no-drag',
          }}
        />
      )}
    </div>
  );
}
