/**
 * IPC Chat Handler Tests
 * Tests for chat.ts IPC handler that calls gateway
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SendTextResponse } from '../../shared/ipc-types';
import { ipcMain } from 'electron';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe('Chat IPC Handler', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let chatHandler: (event: any, message: string) => Promise<SendTextResponse>;

  beforeEach(async () => {
    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Import and setup the handlers
    const { setupChatHandlers } = await import('../ipc/chat');
    setupChatHandlers();

    // Extract the handler function from ipcMain.handle calls
    const handleCalls = (ipcMain.handle as any).mock.calls;
    const chatCall = handleCalls.find((call: any) => call[0] === 'chat:send-text');
    if (chatCall) {
      chatHandler = chatCall[1];
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully POST message to gateway and return reply', async () => {
    // Arrange
    const testMessage = 'Hello JARVIS';
    const mockResponse = { response: 'Hello! How can I help you?' };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await chatHandler({}, testMessage);

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage }),
      })
    );
    expect(result).toEqual({
      success: true,
      data: { reply: 'Hello! How can I help you?' },
    });
  });

  it('should return error when network request fails', async () => {
    // Arrange
    const testMessage = 'Test message';
    mockFetch.mockRejectedValue(new Error('Network error'));

    // Act
    const result = await chatHandler({}, testMessage);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should timeout after 10 seconds', async () => {
    // Arrange
    const testMessage = 'Test message';

    // Mock fetch to throw AbortError (simulating timeout)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    // Act
    const result = await chatHandler({}, testMessage);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should return error for non-200 status code', async () => {
    // Arrange
    const testMessage = 'Test message';
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });

    // Act
    const result = await chatHandler({}, testMessage);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP 500');
  });

  it('should handle invalid JSON response gracefully', async () => {
    // Arrange
    const testMessage = 'Test message';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    // Act
    const result = await chatHandler({}, testMessage);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });
});
