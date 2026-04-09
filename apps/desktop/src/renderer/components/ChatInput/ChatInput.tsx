import { useState, useRef, useEffect } from 'react';
import { useOrbContext } from '../Orb/OrbContext';
import { SpeechBubble } from '../SpeechBubble';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useChat } from '../../src/chat/ChatContext';
import { handleAudioResponse } from '../../src/voice/handleAudioResponse';
import { playTTSResponse } from '../../src/audio/ttsPlayer';
import '../SpeechBubble/SpeechBubble.css';

/**
 * ChatInput Component
 * Phase 12, Plan 02 - Text input UI with button toggle
 * Phase 12, Plan 04 - Speech bubble integration and state orchestration
 * Phase 13, Plan 03 - Temporary audio recording button (will be replaced by PTT in Wave 3)
 * Phase 13, Plan 04 - PTT hotkey integration with orb state transitions
 *
 * D-01: Button with keyboard icon toggles input visibility
 * D-02: Text input field below orb
 * D-03: Discrete positioning near orb
 * D-04: Enter key submits message via window.jarvis.sendText
 * D-16: PTT start → listening state with "Gravando..." tooltip
 * D-17/D-18: PTT stop → processing → responding → idle (2s)
 */
export function ChatInput() {
  const [showInput, setShowInput] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
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
   * D-17/D-18: Stop recording, process audio, show response
   * D-19: Return to idle after 2 seconds
   */
  const handleStopRecording = async () => {
    if (!isRecording) {
      console.warn('[ChatInput] PTT stop called but not recording');
      return;
    }

    try {
      // D-17: Stop recording and get audio buffer
      const audioBuffer = await stopRecording();

      if (!audioBuffer) {
        setReply('Error: Failed to process audio');
        setState('idle');
        return;
      }

      // D-17: Set orb to processing state
      setState('processing');

      console.log('[ChatInput] PTT audio recorded, sending to backend...');

      // D-18: Send audio via IPC (Fase 19.5 Plan 04 — shape novo + handleAudioResponse)
      const result = await window.jarvis.sendAudio(audioBuffer);

      if (result.success) {
        setState('responding');
        setReply(result.data.message);
      } else {
        setState('idle');
      }

      await handleAudioResponse(result, {
        addHumanMessage,
        addAgentMessage,
        setToast,
        playTTS: playTTSResponse,
      });

      if (result.success) {
        // D-19: After 2 seconds, return to idle
        setTimeout(() => {
          setState('idle');
        }, 2000);
      }
    } catch (error) {
      console.error('[ChatInput] Failed to process PTT audio:', error);
      setState('idle');
      setReply('Error: ' + (error instanceof Error ? error.message : 'Failed to process audio'));
    }
  };

  // PTT event listener (Phase 13, Plan 04)
  useEffect(() => {
    const handlePttAction = (_event: any, action: 'start' | 'stop') => {
      console.log('[ChatInput] PTT action received:', action);
      if (action === 'start') {
        handleStartRecording();
      } else {
        handleStopRecording();
      }
    };

    // Register IPC listener for PTT events
    window.jarvis?.ipcRenderer?.on('ptt:action', handlePttAction);

    // Cleanup on unmount
    return () => {
      window.jarvis?.ipcRenderer?.off('ptt:action', handlePttAction);
    };
  }, [isRecording]); // Re-register when recording state changes

  const handleToggle = () => {
    setShowInput((prev) => !prev);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();

    // D-04: Don't submit empty messages
    if (!trimmed) {
      return;
    }

    // Clear previous reply before sending new message
    setReply('');

    // Set orb to processing state
    setState('processing');

    try {
      // Call IPC handler
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
    <div className="chat-input-container">
      {/* Speech bubble appears above orb */}
      {reply && <SpeechBubble text={reply} />}

      {/* Show recording error if any */}
      {recordError && <div className="record-error">{recordError}</div>}

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
