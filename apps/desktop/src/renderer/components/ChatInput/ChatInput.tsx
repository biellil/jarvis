import { useState, useRef, useEffect } from 'react';
import { useOrbContext } from '../Orb/OrbContext';

/**
 * ChatInput Component
 * Phase 12, Plan 02 - Text input UI with button toggle
 * 
 * D-01: Button with keyboard icon toggles input visibility
 * D-02: Text input field below orb
 * D-03: Discrete positioning near orb
 * D-04: Enter key submits message via window.jarvis.sendText
 */
export function ChatInput() {
  const [showInput, setShowInput] = useState(false);
  const [message, setMessage] = useState('');
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

    // Set orb to processing state
    setState('processing');

    try {
      // Call IPC handler
      await window.jarvis.sendText(trimmed);
      
      // Clear input after successful send
      setMessage('');
      
      // Return to idle state (Plan 04 will add 'responding' state with bubble)
      setState('idle');
      
      // Keep input focused for next message
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setState('idle');
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
