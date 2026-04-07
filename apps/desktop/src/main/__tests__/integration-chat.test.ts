/**
 * Integration Test: IPC → Gateway → Mock Response Chain
 * Validates full end-to-end message flow without real services
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { SendTextResponse } from '../../shared/ipc-types';
import { ipcMain } from 'electron';
import express, { type Express } from 'express';
import type { Server } from 'http';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe('Chat Integration: IPC → HTTP → Response Chain', () => {
  let mockGatewayServer: Server;
  let mockGatewayApp: Express;
  let chatHandler: (event: any, message: string) => Promise<SendTextResponse>;
  const TEST_PORT = 3001; // Use different port to avoid conflicts

  beforeAll(() => {
    // Setup mock gateway server
    mockGatewayApp = express();
    mockGatewayApp.use(express.json());

    // Mock /api/chat endpoint
    mockGatewayApp.post('/api/chat', (req, res) => {
      const { message } = req.body;

      // Simulate gateway behavior
      if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message required' });
      }

      // Return mock JARVIS response
      res.json({ response: `Echo: ${message}` });
    });

    // Start server
    return new Promise<void>((resolve) => {
      mockGatewayServer = mockGatewayApp.listen(TEST_PORT, () => {
        console.log(`[Integration Test] Mock gateway listening on port ${TEST_PORT}`);
        resolve();
      });
    });
  });

  afterAll(() => {
    // Cleanup server
    return new Promise<void>((resolve, reject) => {
      if (mockGatewayServer) {
        mockGatewayServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  });

  beforeEach(async () => {
    // Mock fetch to point to our test server
    const originalFetch = global.fetch;
    global.fetch = vi.fn((url, options) => {
      // Redirect to test port
      const testUrl = (url as string).replace(':3000', `:${TEST_PORT}`);
      return originalFetch(testUrl, options);
    });

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

  it('should complete full chain: IPC → Gateway → Response', async () => {
    // Arrange
    const testMessage = 'Hello from integration test';

    // Act - Send message through IPC handler
    const result = await chatHandler({}, testMessage);

    // Assert - Verify full chain worked
    expect(result.success).toBe(true);
    expect(result.data?.reply).toBe(`Echo: ${testMessage}`);

    // Verify fetch was called with correct URL
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: testMessage }),
      })
    );
  });

  it('should handle gateway error responses', async () => {
    // Arrange - Mock gateway to return 500 error
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    })) as any;

    // Act
    const result = await chatHandler({}, 'test message');

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP 500');

    // Restore
    global.fetch = originalFetch;
  });

  it('should handle network errors in the chain', async () => {
    // Arrange - Mock fetch to throw network error
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

    // Act
    const result = await chatHandler({}, 'test message');

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');

    // Restore
    global.fetch = originalFetch;
  });

  it('should validate mock server receives correct request structure', async () => {
    // This test is validated by the first test - the mock server
    // successfully receives and processes the message.
    // The request structure is validated by the mock endpoint itself.
    // If the structure was wrong, the mock would return an error or
    // the response wouldn't match expectations.

    const testMessage = 'Validation test message';
    const result = await chatHandler({}, testMessage);

    // Assert - If we get a successful response with the expected format,
    // it proves the request structure was correct
    expect(result.success).toBe(true);
    expect(result.data?.reply).toBe(`Echo: ${testMessage}`);
  });

  it('should complete chain with different message content', async () => {
    // Arrange
    const messages = [
      'What is the weather?',
      'Open calculator',
      'Tell me a joke',
      'Analyze my screen',
    ];

    // Act & Assert - Test multiple messages through the chain
    for (const message of messages) {
      const result = await chatHandler({}, message);

      expect(result.success).toBe(true);
      expect(result.data?.reply).toBe(`Echo: ${message}`);
    }
  });
});
