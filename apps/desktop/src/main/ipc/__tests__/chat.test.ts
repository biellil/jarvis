/**
 * Desktop IPC Chat Handlers Tests
 * Tests for IPC_CHANNELS.CHAT_SEND_AUDIO handler
 * TDD RED phase: Tests for sendAudio IPC handler
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc-types';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('Chat IPC Handlers - Audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CHAT_SEND_AUDIO handler', () => {
    it('should send audio buffer to gateway and return response', async () => {
      // Arrange
      const mockAudioBuffer = new Uint8Array([1, 2, 3, 4]);
      const mockResponse = { message: 'Hello! I heard you say something.' };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Import module to trigger handler registration
      await import('../chat.js');

      // Get the handler function that was registered
      const handleCall = (ipcMain.handle as any).mock.calls.find(
        (call: any[]) => call[0] === IPC_CHANNELS.CHAT_SEND_AUDIO
      );
      expect(handleCall).toBeDefined();
      const handler = handleCall[1];

      // Act
      const result = await handler({}, mockAudioBuffer);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ reply: mockResponse.message });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/audio'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return error when gateway is unreachable', async () => {
      // Arrange
      const mockAudioBuffer = new Uint8Array([1, 2, 3, 4]);

      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      // Import module to trigger handler registration
      await import('../chat.js');

      // Get the handler
      const handleCall = (ipcMain.handle as any).mock.calls.find(
        (call: any[]) => call[0] === IPC_CHANNELS.CHAT_SEND_AUDIO
      );
      const handler = handleCall[1];

      // Act
      const result = await handler({}, mockAudioBuffer);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle HTTP error responses from gateway', async () => {
      // Arrange
      const mockAudioBuffer = new Uint8Array([1, 2, 3, 4]);

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Import module
      await import('../chat.js');

      // Get the handler
      const handleCall = (ipcMain.handle as any).mock.calls.find(
        (call: any[]) => call[0] === IPC_CHANNELS.CHAT_SEND_AUDIO
      );
      const handler = handleCall[1];

      // Act
      const result = await handler({}, mockAudioBuffer);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle timeout after 10 seconds', async () => {
      // Arrange
      const mockAudioBuffer = new Uint8Array([1, 2, 3, 4]);

      // Mock fetch to simulate timeout
      (global.fetch as any).mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          setTimeout(() => reject(error), 100);
        });
      });

      // Import module
      await import('../chat.js');

      // Get the handler
      const handleCall = (ipcMain.handle as any).mock.calls.find(
        (call: any[]) => call[0] === IPC_CHANNELS.CHAT_SEND_AUDIO
      );
      const handler = handleCall[1];

      // Act
      const result = await handler({}, mockAudioBuffer);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
});
