/**
 * Gateway Chat Route Tests
 * Tests for /api/chat endpoint that proxies to FastAPI
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { chatRouter } from '../routes/chat.js';

// Mock undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

describe('Gateway Chat Routes', () => {
  let app: Express;
  let mockFetch: any;

  beforeEach(async () => {
    // Import mocked fetch
    const { fetch } = await import('undici');
    mockFetch = fetch as any;

    // Setup Express app with chat router
    app = express();
    app.use(express.json());
    app.use('/api', chatRouter);

    // Add error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        code: err.code || 'UNKNOWN_ERROR',
      });
    });
  });

  describe('POST /api/chat', () => {
    it('should proxy message to FastAPI and return response', async () => {
      // Arrange
      const testMessage = 'Hello JARVIS';
      const mockResponse = { response: 'Hello! How can I help you?' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Act
      const response = await request(app)
        .post('/api/chat')
        .send({ message: testMessage })
        .expect(200);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: testMessage }),
        })
      );
      expect(response.body).toEqual(mockResponse);
    });

    it('should return error when FastAPI returns non-200 status', async () => {
      // Arrange
      const testMessage = 'Test message';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal server error' }),
      });

      // Act
      const response = await request(app)
        .post('/api/chat')
        .send({ message: testMessage })
        .expect(500);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('UPSTREAM_ERROR');
    });

    it('should handle network errors gracefully', async () => {
      // Arrange
      const testMessage = 'Test message';

      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act
      const response = await request(app)
        .post('/api/chat')
        .send({ message: testMessage })
        .expect(500);

      // Assert
      expect(response.body).toHaveProperty('error');
    });

    it('should validate request body schema', async () => {
      // Act - missing message field
      const response = await request(app).post('/api/chat').send({}).expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
