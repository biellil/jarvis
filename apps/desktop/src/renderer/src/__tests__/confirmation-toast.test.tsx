/**
 * @vitest-environment happy-dom
 *
 * confirmation-toast tests — Phase 54 Plan 04 (LACT-06)
 *
 * Tests:
 * 1. ACTION_REQUEST received → pendingAction set with requestId/action/path/model
 * 2. sendAck with 'confirmed' clears pendingAction + calls window.jarvis.actions.sendAck
 * 3. sendAck with 'denied' clears pendingAction + calls window.jarvis.actions.sendAck
 * 4. Advance timers 10000ms → onTimeout fires (via ActionConfirmationToast)
 * 5. Second action_request while toast visible → pendingAction updated to new one
 * 6. Unmount clears onRequest subscription
 * 7. ActionConfirmationToast renders Permitir/Negar buttons
 * 8. Clicking Permitir calls onConfirm
 * 9. Clicking Negar calls onDeny
 * 10. 10s timeout calls onTimeout
 * 11. Shows correct label for openFolder
 * 12. Shows correct label for openFile
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { ActionRequestPayload, ActionAckStatus } from '../../../../shared/ipc-types';

// ---- Mock App.tsx heavy dependencies before importing ----
vi.mock('../audio/ttsPlayer', () => ({ stopTTSPlayback: vi.fn() }));
vi.mock('../audio/streamingTtsPlayer', () => ({ wireStreamingTtsListeners: vi.fn(() => vi.fn()) }));
vi.mock('../../hooks/useWakeWord', () => ({ useWakeWord: vi.fn(() => ({ vadInstance: null })) }));
vi.mock('../../hooks/useMultiTurnWindow', () => ({ useMultiTurnWindow: vi.fn() }));
vi.mock('../../hooks/usePttHandler', () => ({ usePttHandler: vi.fn() }));
vi.mock('../chat/ChatContext', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useChat: vi.fn(() => ({ toast: null, setToast: vi.fn() })),
}));
vi.mock('@renderer/components/Orb', () => ({
  OrbProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Orb: () => <div data-testid="orb" />,
}));

// ---- Mock window.jarvis.actions ----
let onRequestCallback: ((payload: ActionRequestPayload) => void) | null = null;
const mockSendAck = vi.fn<[string, ActionAckStatus], Promise<{ success: boolean }>>()
  .mockResolvedValue({ success: true });

const mockActionsApi = {
  onRequest: vi.fn((cb: (payload: ActionRequestPayload) => void) => {
    onRequestCallback = cb;
    return () => { onRequestCallback = null; };
  }),
  sendAck: mockSendAck,
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
  ipcRenderer: {
    on: vi.fn(),
    off: vi.fn(),
  },
  actions: mockActionsApi,
});

// ---- Import components under test AFTER global stub + mocks ----
import { useActionConfirmation } from '../hooks/useActionConfirmation';
import { ActionConfirmationToast } from '../App';

const makePayload = (overrides: Partial<ActionRequestPayload> = {}): ActionRequestPayload => ({
  requestId: 'req-001',
  action: 'openFolder',
  path: '/home/user/Downloads',
  model: 'lm-studio',
  ...overrides,
});

// Helper: re-wire onRequest mock after clearAllMocks
function rewireActionsApi() {
  (window.jarvis.actions as typeof mockActionsApi).onRequest.mockImplementation((cb) => {
    onRequestCallback = cb;
    return () => { onRequestCallback = null; };
  });
  (window.jarvis.actions as typeof mockActionsApi).sendAck.mockResolvedValue({ success: true });
}

describe('useActionConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onRequestCallback = null;
    rewireActionsApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with null pendingAction', () => {
    const { result } = renderHook(() => useActionConfirmation());
    expect(result.current.pendingAction).toBeNull();
  });

  it('sets pendingAction when ACTION_REQUEST arrives', () => {
    const { result } = renderHook(() => useActionConfirmation());
    const payload = makePayload();

    act(() => {
      onRequestCallback?.(payload);
    });

    expect(result.current.pendingAction).toEqual({
      requestId: 'req-001',
      action: 'openFolder',
      path: '/home/user/Downloads',
      model: 'lm-studio',
    });
  });

  it('sendAck with confirmed calls window.jarvis.actions.sendAck and clears pendingAction', () => {
    const { result } = renderHook(() => useActionConfirmation());
    const payload = makePayload();

    act(() => {
      onRequestCallback?.(payload);
    });
    expect(result.current.pendingAction).not.toBeNull();

    act(() => {
      result.current.sendAck('req-001', 'confirmed');
    });

    expect(mockSendAck).toHaveBeenCalledWith('req-001', 'confirmed');
    expect(result.current.pendingAction).toBeNull();
  });

  it('sendAck with denied calls window.jarvis.actions.sendAck and clears pendingAction', () => {
    const { result } = renderHook(() => useActionConfirmation());
    const payload = makePayload();

    act(() => {
      onRequestCallback?.(payload);
    });

    act(() => {
      result.current.sendAck('req-001', 'denied');
    });

    expect(mockSendAck).toHaveBeenCalledWith('req-001', 'denied');
    expect(result.current.pendingAction).toBeNull();
  });

  it('replaces pendingAction when second request arrives while toast visible', () => {
    const { result } = renderHook(() => useActionConfirmation());

    act(() => {
      onRequestCallback?.(makePayload({ requestId: 'req-001' }));
    });
    expect(result.current.pendingAction?.requestId).toBe('req-001');

    act(() => {
      onRequestCallback?.(makePayload({ requestId: 'req-002', path: '/home/user/Documents' }));
    });
    expect(result.current.pendingAction?.requestId).toBe('req-002');
    expect(result.current.pendingAction?.path).toBe('/home/user/Documents');
  });

  it('unsubscribes from onRequest on unmount', () => {
    const { unmount } = renderHook(() => useActionConfirmation());
    expect(onRequestCallback).not.toBeNull();
    unmount();
    expect(onRequestCallback).toBeNull();
  });
});

describe('ActionConfirmationToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    onRequestCallback = null;
    rewireActionsApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Permitir and Negar buttons', () => {
    const onConfirm = vi.fn();
    const onDeny = vi.fn();
    const onTimeout = vi.fn();

    render(
      <ActionConfirmationToast
        action="openFolder"
        path="/home/user/Downloads"
        requestId="req-001"
        onConfirm={onConfirm}
        onDeny={onDeny}
        onTimeout={onTimeout}
      />
    );

    expect(screen.getByText('Permitir')).toBeDefined();
    expect(screen.getByText('Negar')).toBeDefined();
  });

  it('click Permitir calls onConfirm', () => {
    const onConfirm = vi.fn();
    const onDeny = vi.fn();
    const onTimeout = vi.fn();

    render(
      <ActionConfirmationToast
        action="openFolder"
        path="/home/user/Downloads"
        requestId="req-001"
        onConfirm={onConfirm}
        onDeny={onDeny}
        onTimeout={onTimeout}
      />
    );

    fireEvent.click(screen.getByText('Permitir'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('click Negar calls onDeny', () => {
    const onConfirm = vi.fn();
    const onDeny = vi.fn();
    const onTimeout = vi.fn();

    render(
      <ActionConfirmationToast
        action="openFolder"
        path="/home/user/Downloads"
        requestId="req-001"
        onConfirm={onConfirm}
        onDeny={onDeny}
        onTimeout={onTimeout}
      />
    );

    fireEvent.click(screen.getByText('Negar'));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 10000ms and calls onTimeout', () => {
    const onConfirm = vi.fn();
    const onDeny = vi.fn();
    const onTimeout = vi.fn();

    render(
      <ActionConfirmationToast
        action="openFolder"
        path="/home/user/Downloads"
        requestId="req-001"
        onConfirm={onConfirm}
        onDeny={onDeny}
        onTimeout={onTimeout}
      />
    );

    expect(onTimeout).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('shows action label for openFolder', () => {
    render(
      <ActionConfirmationToast
        action="openFolder"
        path="/home/user/Downloads"
        requestId="req-001"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
        onTimeout={vi.fn()}
      />
    );
    expect(screen.getByText(/abrir pasta/)).toBeDefined();
    expect(screen.getByText('/home/user/Downloads')).toBeDefined();
  });

  it('shows action label for openFile', () => {
    render(
      <ActionConfirmationToast
        action="openFile"
        path="/tmp/file.txt"
        requestId="req-001"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
        onTimeout={vi.fn()}
      />
    );
    expect(screen.getByText(/abrir arquivo/)).toBeDefined();
  });
});
