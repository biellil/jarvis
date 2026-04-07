import { useState, useRef, useEffect } from 'react';
import { useOrbContext } from '../Orb/OrbContext';
import { SpeechBubble } from '../SpeechBubble';
import '../SpeechBubble/SpeechBubble.css';

/**
 * ChatInput Component
 * Phase 12, Plan 02 - Text input UI with button toggle
 * Phase 12, Plan 04 - Speech bubble integration and state orchestration
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { setState } = useOrbContext();

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

  return (
    <div className="chat-input-container">
      {/* Speech bubble appears above orb */}
      {reply && <SpeechBubble text={reply} />}

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
