/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatInput } from '../ChatInput';
import { OrbProvider } from '../../Orb/OrbContext';

// Mock window.jarvis API
const mockSendText = vi.fn();
(global as any).window = {
  ...global.window,
  jarvis: {
    sendText: mockSendText,
  },
};

// Helper to render with OrbProvider
function renderWithProvider(ui: React.ReactElement) {
  return render(<OrbProvider>{ui}</OrbProvider>);
}

describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('Test 1: Button renders with keyboard icon', () => {
    renderWithProvider(<ChatInput />);
    const button = screen.getByRole('button', { name: /toggle chat input/i });
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('⌨');
  });

  it('Test 2: Clicking button toggles input visibility', () => {
    renderWithProvider(<ChatInput />);
    const button = screen.getByRole('button', { name: /toggle chat input/i });

    // Input should not be visible initially
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Click to show input
    fireEvent.click(button);
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Click again to hide input
    fireEvent.click(button);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Test 3: Input auto-focuses when shown', () => {
    renderWithProvider(<ChatInput />);
    const button = screen.getByRole('button', { name: /toggle chat input/i });

    fireEvent.click(button);

    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
  });

  it('Test 4: Enter key submits form', async () => {
    mockSendText.mockResolvedValue({ success: true, data: { received: 'test message' } });
    renderWithProvider(<ChatInput />);

    // Show input
    const button = screen.getByRole('button', { name: /toggle chat input/i });
    fireEvent.click(button);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Give async operation time to complete
    await vi.waitFor(() => {
      expect(mockSendText).toHaveBeenCalledWith('test message');
    });
  });

  it('Test 5: Input clears after submit', async () => {
    mockSendText.mockResolvedValue({ success: true, data: { received: 'test' } });
    renderWithProvider(<ChatInput />);

    const button = screen.getByRole('button', { name: /toggle chat input/i });
    fireEvent.click(button);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await vi.waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('Test 6: Empty input does not submit', async () => {
    renderWithProvider(<ChatInput />);

    const button = screen.getByRole('button', { name: /toggle chat input/i });
    fireEvent.click(button);

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait a bit to ensure no call was made
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockSendText).not.toHaveBeenCalled();
  });
});
