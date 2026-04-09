/**
 * Desktop IPC Chat Handlers Tests
 * Tests for IPC_CHANNELS.CHAT_SEND_AUDIO handler
 * TDD RED phase: Tests for sendAudio IPC handler
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc-types';
import type { ChatHandlerDeps } from '../chat';

const STUB_DEPS: ChatHandlerDeps = {
  openStream: (async () => {}) as unknown as ChatHandlerDeps['openStream'],
  config: { backendUrl: 'http://localhost:3000', apiKey: 'test' },
  actionExecutor: {
    enqueue: () => {},
    shutdown: async () => {},
  },
};

async function registerHandlers(): Promise<void> {
  const { setupChatHandlers } = await import('../chat.js');
  setupChatHandlers(STUB_DEPS);
}

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

  // CHAT_SEND_AUDIO tests movidos pra chat-send-audio.test.ts (Fase 19_5-01)
  // com response shape novo.
  it('placeholder — ver chat-send-audio.test.ts', () => {
    expect(true).toBe(true);
  });
});
