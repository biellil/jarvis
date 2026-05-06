/**
 * Path Validator Tests
 * Tests for isPathValid whitelist logic and Zod message schemas
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';

// Use the actual homedir for cross-platform compatibility
// The validator uses os.homedir() internally, so we test with real paths
const HOME = os.homedir();

describe('isPathValid — whitelist validation', () => {
  // Import the module after the mock — use dynamic import for isolation
  let isPathValid: (p: string) => boolean;
  let ActionRequestSchema: any;
  let ActionAckSchema: any;

  beforeAll(async () => {
    const mod = await import('../lib/path-validator.js');
    isPathValid = mod.isPathValid;
    ActionRequestSchema = mod.ActionRequestSchema;
    ActionAckSchema = mod.ActionAckSchema;
  });

  it('allows home directory itself', () => {
    expect(isPathValid(HOME)).toBe(true);
  });

  it('allows home/Downloads', () => {
    expect(isPathValid(path.join(HOME, 'Downloads'))).toBe(true);
  });

  it('allows deep path inside Downloads', () => {
    expect(isPathValid(path.join(HOME, 'Downloads', 'report.pdf'))).toBe(true);
  });

  it('allows home/Documents', () => {
    expect(isPathValid(path.join(HOME, 'Documents'))).toBe(true);
  });

  it('allows home/Desktop/file.txt', () => {
    expect(isPathValid(path.join(HOME, 'Desktop', 'file.txt'))).toBe(true);
  });

  it('rejects unknown top-level dir (secret)', () => {
    expect(isPathValid(path.join(HOME, 'secret'))).toBe(false);
  });

  it('rejects path outside home entirely', () => {
    // Use a path that is definitely outside home on the current platform
    const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd';
    expect(isPathValid(outsidePath)).toBe(false);
  });

  it('rejects path traversal via ..', () => {
    // Path traversal: start inside Downloads but escape via ..
    const traversalPath = path.join(HOME, 'Downloads', '..', '..', 'etc', 'passwd');
    expect(isPathValid(traversalPath)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isPathValid('')).toBe(false);
  });

  describe('ActionRequestSchema — Zod validation', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('accepts valid action_request with whitelisted path', () => {
      const result = ActionRequestSchema.safeParse({
        type: 'action_request',
        requestId: validUuid,
        action: 'openFolder',
        path: path.join(HOME, 'Downloads'),
        model: 'lmstudio/x',
      });
      expect(result.success).toBe(true);
    });

    it('rejects action_request with path outside whitelist', () => {
      const badPath = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd';
      const result = ActionRequestSchema.safeParse({
        type: 'action_request',
        requestId: validUuid,
        action: 'openFolder',
        path: badPath,
        model: 'lmstudio/x',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('whitelist');
      }
    });

    it('rejects action_request with invalid requestId (not uuid)', () => {
      const result = ActionRequestSchema.safeParse({
        type: 'action_request',
        requestId: 'not-a-uuid',
        action: 'openFolder',
        path: path.join(HOME, 'Downloads'),
        model: 'lmstudio/x',
      });
      expect(result.success).toBe(false);
    });

    it('rejects action_request with invalid action type', () => {
      const result = ActionRequestSchema.safeParse({
        type: 'action_request',
        requestId: validUuid,
        action: 'deleteFile',
        path: path.join(HOME, 'Downloads'),
        model: 'lmstudio/x',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid action types', () => {
      const validActions = ['openFolder', 'openFile', 'closeFile', 'viewContent'];
      for (const action of validActions) {
        const result = ActionRequestSchema.safeParse({
          type: 'action_request',
          requestId: validUuid,
          action,
          path: path.join(HOME, 'Documents', 'test.txt'),
          model: 'lmstudio/x',
        });
        expect(result.success, `action '${action}' should be valid`).toBe(true);
      }
    });
  });

  describe('ActionAckSchema — Zod validation', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('accepts valid action_ack with confirmed status', () => {
      const result = ActionAckSchema.safeParse({
        type: 'action_ack',
        requestId: validUuid,
        status: 'confirmed',
      });
      expect(result.success).toBe(true);
    });

    it('accepts denied status', () => {
      const result = ActionAckSchema.safeParse({
        type: 'action_ack',
        requestId: validUuid,
        status: 'denied',
      });
      expect(result.success).toBe(true);
    });

    it('accepts timeout status', () => {
      const result = ActionAckSchema.safeParse({
        type: 'action_ack',
        requestId: validUuid,
        status: 'timeout',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = ActionAckSchema.safeParse({
        type: 'action_ack',
        requestId: validUuid,
        status: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing requestId', () => {
      const result = ActionAckSchema.safeParse({
        type: 'action_ack',
        status: 'confirmed',
      });
      expect(result.success).toBe(false);
    });
  });
});
