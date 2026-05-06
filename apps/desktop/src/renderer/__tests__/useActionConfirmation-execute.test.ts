/**
 * @vitest-environment happy-dom
 *
 * useActionConfirmation — executeAndAck tests — Phase 55 Plan 05 (LACT-01..05)
 *
 * Tests the Execute→ACK flow (D-12, D-13):
 * 1. executeAndAck calls window.jarvis.actions.execute (IPC) for the pending action
 * 2. On execute success: calls sendAck('confirmed') with content
 * 3. On execute failure: calls sendAck('denied')
 * 4. executeAndAck clears pendingAction after execution
 * 5. executeAndAck with unknown requestId is a no-op (warns, no IPC call)
 * 6. Hook exports executeAndAck in its return value
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { ActionRequestPayload } from '../../shared/ipc-types';

// ---- Mock window.jarvis.actions ----
let onRequestCallback: ((payload: ActionRequestPayload) => void) | null = null;

const mockSendAck = vi.fn().mockResolvedValue({ success: true });
const mockExecute = vi.fn().mockResolvedValue({ success: true, content: undefined });

const mockActionsApi = {
  onRequest: vi.fn((cb: (payload: ActionRequestPayload) => void) => {
    onRequestCallback = cb;
    return () => { onRequestCallback = null; };
  }),
  sendAck: mockSendAck,
  execute: mockExecute,
  executeAction: mockExecute,
};

vi.stubGlobal('jarvis', {
  sendText: vi.fn(),
  sendAudio: vi.fn(),
  getHotkeyStatus: vi.fn(),
  setIgnoreMouseEvents: vi.fn(),
  moveWindow: vi.fn(),
  saveOrbPosition: vi.fn(),
  wakeWord: {
    loadModels: vi.fn(),
    getPaused: vi.fn().mockResolvedValue(false),
    onPauseToggle: vi.fn(() => () => {}),
  },
  voiceMode: {
    getMode: vi.fn().mockResolvedValue('wake-word'),
    onChange: vi.fn(() => () => {}),
  },
  openSystemSettings: vi.fn(),
  streamingTts: {
    onChunk: vi.fn(() => () => {}),
    onEnd: vi.fn(() => () => {}),
    onStop: vi.fn(() => () => {}),
  },
  ipcRenderer: { on: vi.fn(), off: vi.fn() },
  actions: mockActionsApi,
});

import { useActionConfirmation } from '../src/hooks/useActionConfirmation';

const makePayload = (overrides: Partial<ActionRequestPayload> = {}): ActionRequestPayload => ({
  requestId: 'req-exec-001',
  action: 'openFolder',
  path: '/home/user/Downloads',
  model: 'lm-studio',
  ...overrides,
});

function rewireActionsApi() {
  (window.jarvis.actions as typeof mockActionsApi).onRequest.mockImplementation((cb) => {
    onRequestCallback = cb;
    return () => { onRequestCallback = null; };
  });
  (window.jarvis.actions as typeof mockActionsApi).sendAck.mockResolvedValue({ success: true });
  (window.jarvis.actions as typeof mockActionsApi).execute.mockResolvedValue({ success: true, content: undefined });
}

describe('useActionConfirmation — executeAndAck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onRequestCallback = null;
    rewireActionsApi();
  });

  it('hook exposes executeAndAck function', () => {
    const { result } = renderHook(() => useActionConfirmation());
    expect(typeof result.current.executeAndAck).toBe('function');
  });

  it('executeAndAck calls execute IPC and sends confirmed ACK on success', async () => {
    (window.jarvis.actions as typeof mockActionsApi).execute.mockResolvedValue({ success: true, content: undefined });

    const { result } = renderHook(() => useActionConfirmation());

    act(() => {
      onRequestCallback?.(makePayload());
    });
    expect(result.current.pendingAction).not.toBeNull();

    await act(async () => {
      await result.current.executeAndAck('req-exec-001');
    });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'openFolder', path: '/home/user/Downloads' }),
    );
    expect(mockSendAck).toHaveBeenCalledWith('req-exec-001', 'confirmed', undefined);
    expect(result.current.pendingAction).toBeNull();
  });

  it('executeAndAck sends denied ACK when execute returns ok:false', async () => {
    (window.jarvis.actions as typeof mockActionsApi).execute.mockResolvedValue({ success: false, error: 'Permission denied' });

    const { result } = renderHook(() => useActionConfirmation());

    act(() => {
      onRequestCallback?.(makePayload());
    });

    await act(async () => {
      await result.current.executeAndAck('req-exec-001');
    });

    expect(mockExecute).toHaveBeenCalled();
    expect(mockSendAck).toHaveBeenCalledWith('req-exec-001', 'denied');
    expect(result.current.pendingAction).toBeNull();
  });

  it('executeAndAck carries content in ACK for viewContent actions', async () => {
    const fileContent = 'Hello, world!';
    (window.jarvis.actions as typeof mockActionsApi).execute.mockResolvedValue({ success: true, content: fileContent });

    const { result } = renderHook(() => useActionConfirmation());

    act(() => {
      onRequestCallback?.(makePayload({ action: 'viewContent', path: '/home/user/Documents/notes.txt' }));
    });

    await act(async () => {
      await result.current.executeAndAck('req-exec-001');
    });

    expect(mockSendAck).toHaveBeenCalledWith('req-exec-001', 'confirmed', fileContent);
  });

  it('executeAndAck with unknown requestId is a no-op (no IPC calls)', async () => {
    const { result } = renderHook(() => useActionConfirmation());
    // no pending action set

    await act(async () => {
      await result.current.executeAndAck('unknown-id');
    });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();
  });

  it('executeAndAck sends denied ACK when execute throws', async () => {
    (window.jarvis.actions as typeof mockActionsApi).execute.mockRejectedValue(new Error('IPC error'));

    const { result } = renderHook(() => useActionConfirmation());

    act(() => {
      onRequestCallback?.(makePayload());
    });

    await act(async () => {
      await result.current.executeAndAck('req-exec-001');
    });

    expect(mockSendAck).toHaveBeenCalledWith('req-exec-001', 'denied');
    expect(result.current.pendingAction).toBeNull();
  });
});
