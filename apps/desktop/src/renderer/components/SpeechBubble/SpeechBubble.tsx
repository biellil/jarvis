/**
 * SpeechBubble Component
 * Phase 12, Plan 04 - Speech bubble display for JARVIS responses
 *
 * D-11: CSS-only bubble styling with clip-path
 * D-12: Grows to fit content without max-height
 * D-13: Persists until next message
 */

interface SpeechBubbleProps {
  text: string;
}

export function SpeechBubble({ text }: SpeechBubbleProps) {
  // Return null if text is empty
  if (!text) {
    return null;
  }

  return (
    <div className="speech-bubble">
      {text}
    </div>
  );
}
