/**
 * Gateway Chat Route Tests - Audio Endpoint
 * Tests for POST /api/chat/audio endpoint (multipart audio upload)
 * TDD RED phase: Tests for audio endpoint functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { chatRouter } from '../chat.js';

// Mock undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

describe('Gateway Chat Audio Route', () => {
  let app: Express;
  let mockFetch: any;

  beforeEach(async () => {
    // Import mocked fetch
    const { fetch } = await import('undici');
    mockFetch = fetch as any;

    // Setup Express app with chat router
    app = express();
    app.use(express.json());
    app.use('/api/chat', chatRouter);

    // Add error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        code: err.code || 'UNKNOWN_ERROR',
      });
    });
  });

  describe('POST /api/chat/audio', () => {
    it('should accept multipart audio and return JSON response', async () => {
      // Arrange
      const mockResponse = { message: 'Transcribed text and response' };
      const audioBuffer = Buffer.from('fake-audio-data');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Act
      const response = await request(app)
        .post('/api/chat/audio')
        .attach('audio', audioBuffer, 'test-audio.wav')
        .expect(200);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/audio'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(response.body).toEqual(mockResponse);
    });

    it('should return 400 when no audio file is provided', async () => {
      // Act
      const response = await request(app)
        .post('/api/chat/audio')
        .send({})
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('MISSING_FILE');
    });

    it('should handle FastAPI errors gracefully', async () => {
      // Arrange
      const audioBuffer = Buffer.from('fake-audio-data');

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Transcription failed' }),
      });

      // Act
      const response = await request(app)
        .post('/api/chat/audio')
        .attach('audio', audioBuffer, 'test-audio.wav')
        .expect(500);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('UPSTREAM_ERROR');
    });

    it('should reject files larger than 10MB', async () => {
      // Arrange - Create 11MB buffer
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      // Act
      const response = await request(app)
        .post('/api/chat/audio')
        .attach('audio', largeBuffer, 'large-audio.wav')
        .expect(413); // Payload Too Large

      // Assert - multer rejects before reaching handler
      expect(response.body).toBeDefined();
    });
  });
});
