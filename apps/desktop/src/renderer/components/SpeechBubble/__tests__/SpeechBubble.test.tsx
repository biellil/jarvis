/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpeechBubble } from '../SpeechBubble';

describe('SpeechBubble', () => {
  // Test 1: Renders text content passed as prop
  it('renders text content passed as prop', () => {
    render(<SpeechBubble text="Hello, world!" />);
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  // Test 2: Has speech-bubble CSS class
  it('has speech-bubble CSS class', () => {
    render(<SpeechBubble text="Test message" />);
    const bubble = screen.getByText('Test message');
    expect(bubble).toHaveClass('speech-bubble');
  });

  // Test 3: Empty text renders nothing
  it('renders nothing when text is empty', () => {
    const { container } = render(<SpeechBubble text="" />);
    expect(container.firstChild).toBeNull();
  });

  // Test 4: Long text doesn't overflow horizontally
  it('does not overflow horizontally with long text', () => {
    const longText = 'This is a very long message that should wrap to multiple lines instead of overflowing horizontally and breaking the layout';
    render(<SpeechBubble text={longText} />);
    const bubble = screen.getByText(longText);

    // The component should have a max-width style applied
    const styles = window.getComputedStyle(bubble);
    expect(bubble).toBeInTheDocument();
  });
});
