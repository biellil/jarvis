import { useState, useRef, useEffect } from 'react';
import { useOrbContext } from '../Orb/OrbContext';
import { SpeechBubble } from '../SpeechBubble';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import '../SpeechBubble/SpeechBubble.css';

/**
 * ChatInput Component
 * Phase 12, Plan 02 - Text input UI with button toggle
 * Phase 12, Plan 04 - Speech bubble integration and state orchestration
 * Phase 13, Plan 03 - Temporary audio recording button (will be replaced by PTT in Wave 3)
 *
 * D-01: Button with keyboard icon toggles input visibility
 * D-02: Text input field below orb
 * D-03: Discrete positioning near orb
 * D-04: Enter key submits message via window.jarvis.sendText
 */
export function ChatInput() {
  const [showInput, setShowInput] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setState } = useOrbContext();
  const { isRecording, error: recordError, startRecording, stopRecording } = useAudioRecorder();

  // Auto-focus input when shown
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

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

  /**
   * Handle audio recording toggle
   * Phase 13, Plan 03 - Temporary test button
   * NOTE: This will be replaced by PTT hotkey in Wave 3
   */
  const handleRecordClick = async () => {
    if (isRecording) {
      // Stop recording and process
      setIsProcessing(true);
      setState('processing');

      try {
        const audioBuffer = await stopRecording();

        if (!audioBuffer) {
          setReply('Error: Failed to process audio');
          setState('idle');
          setIsProcessing(false);
          return;
        }

        console.log('[ChatInput] Audio recorded, sending to backend...');

        // Send audio via IPC
        const result = await window.jarvis.sendAudio(audioBuffer);

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
      } catch (error) {
        console.error('[ChatInput] Failed to send audio:', error);
        setState('idle');
        setReply('Error: ' + (error instanceof Error ? error.message : 'Failed to send audio'));
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Start recording
      await startRecording();
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

      {/* Phase 13, Plan 03: Temporary record button (will be replaced by PTT hotkey) */}
      <button
        className="chat-button"
        onClick={handleRecordClick}
        aria-label="Record audio message"
        title={isRecording ? 'Stop recording' : 'Record audio'}
        disabled={isProcessing}
        style={{
          WebkitAppRegion: 'no-drag',
          backgroundColor: isRecording ? '#ef4444' : '#3b82f6',
          marginLeft: '8px',
        }}
      >
        {isRecording ? '⏹' : '🎤'}
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
