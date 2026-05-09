// @vitest-environment happy-dom
/**
 * sendAudioAndHandle — Phase 66 task short-circuit tests (AGENT-02, AGENT-04)
 *
 * Verifies that sendAudioAndHandle correctly short-circuits to task endpoints
 * when an active task matches a voice keyword, and falls through to /api/chat
 * when no task is active or utterance is non-keyword.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sendAudioAndHandle,
  type SendAudioAndHandleDeps,
  type ActiveTaskRef,
} from '../sendAudioAndHandle.js';
import type { SendAudioResponse, TaskUiState } from '../../../../shared/ipc-types';

// Mock ttsPlayer to avoid AudioContext in tests
vi.mock('../../audio/ttsPlayer', () => ({
  playTTSResponse: vi.fn().mockResolvedValue(undefined),
}));

function makeAudioResponse(transcription: string): SendAudioResponse {
  return {
    success: true,
    data: {
      transcription,
      message: 'ok',
      audioBase64: 'dGVzdA==',
      audioFormat: 'mp3',
      sttProvider: 'whisper',
      ttsProvider: 'kokoro',
    },
  };
}

function makeAwaitingTask(taskId = 'task-123'): ActiveTaskRef {
  return {
    taskId,
    state: {
      kind: 'awaiting-confirmation',
      plan: { steps: [{ id: 1, description: 'Listar arquivos', expectedOutcome: 'Lista' }] },
      editMode: false,
    } satisfies TaskUiState,
  };
}

function makeExecutingTask(taskId = 'task-456'): ActiveTaskRef {
  return {
    taskId,
    state: {
      kind: 'executing',
      plan: { steps: [{ id: 1, description: 'Listar arquivos', expectedOutcome: 'Lista' }] },
      steps: [{ id: 1, description: 'Listar arquivos', status: 'running' }],
      currentStepId: 1,
    } satisfies TaskUiState,
  };
}

function makeDeps(overrides: Partial<SendAudioAndHandleDeps> = {}): SendAudioAndHandleDeps {
  return {
    setState: vi.fn(),
    setToast: vi.fn(),
    addHumanMessage: vi.fn(),
    addAgentMessage: vi.fn(),
    ...overrides,
  };
}

describe('sendAudioAndHandle — task short-circuit', () => {
  let resumeTaskMock: ReturnType<typeof vi.fn>;
  let cancelTaskMock: ReturnType<typeof vi.fn>;
  let sendAudioMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resumeTaskMock = vi.fn().mockResolvedValue({ success: true });
    cancelTaskMock = vi.fn().mockResolvedValue({ success: true });
    sendAudioMock = vi.fn();

    // Set up window.jarvis mock
    Object.defineProperty(globalThis, 'window', {
      value: {
        jarvis: {
          sendAudio: sendAudioMock,
          tasks: {
            resumeTask: resumeTaskMock,
            cancelTask: cancelTaskMock,
            getBackendUrl: vi.fn(),
          },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('when no active task, falls through to existing /api/chat path', async () => {
    sendAudioMock.mockResolvedValue(makeAudioResponse('que horas são'));
    const deps = makeDeps({ activeTask: null });
    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

    // Should NOT call task endpoints
    expect(resumeTaskMock).not.toHaveBeenCalled();
    expect(cancelTaskMock).not.toHaveBeenCalled();
    // Should go through normal flow (setState responding → idle)
    expect(deps.setState).toHaveBeenCalledWith('processing');
    expect(deps.setState).toHaveBeenCalledWith('responding');
  });

  it('when task is awaiting-confirmation and STT returns "vai", calls resumeTask with kind:confirm', async () => {
    sendAudioMock.mockResolvedValue(makeAudioResponse('vai'));
    const activeTask = makeAwaitingTask('task-123');
    const deps = makeDeps({ activeTask });

    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

    expect(resumeTaskMock).toHaveBeenCalledWith('task-123', { kind: 'confirm' });
    expect(cancelTaskMock).not.toHaveBeenCalled();
    // Should short-circuit — NOT call setState('responding')
    expect(deps.setState).toHaveBeenCalledWith('processing');
    expect(deps.setState).not.toHaveBeenCalledWith('responding');
  });

  it('when task is executing and STT returns "cancela", calls cancelTask', async () => {
    sendAudioMock.mockResolvedValue(makeAudioResponse('cancela'));
    const activeTask = makeExecutingTask('task-456');
    const deps = makeDeps({ activeTask });

    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

    expect(cancelTaskMock).toHaveBeenCalledWith('task-456');
    expect(resumeTaskMock).not.toHaveBeenCalled();
    expect(deps.setState).not.toHaveBeenCalledWith('responding');
  });

  it('when task is awaiting-confirmation and STT returns "muda o passo 1", calls resumeTask with kind:edit + feedback', async () => {
    sendAudioMock.mockResolvedValue(makeAudioResponse('muda o passo 1'));
    const activeTask = makeAwaitingTask('task-123');
    const deps = makeDeps({ activeTask });

    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

    expect(resumeTaskMock).toHaveBeenCalledWith('task-123', {
      kind: 'edit',
      feedback: 'o passo 1',
    });
    expect(cancelTaskMock).not.toHaveBeenCalled();
  });

  it('when STT returns non-keyword utterance during active task, falls through to /api/chat (no short-circuit)', async () => {
    sendAudioMock.mockResolvedValue(makeAudioResponse('o tempo está bom hoje'));
    const activeTask = makeAwaitingTask('task-123');
    const deps = makeDeps({ activeTask });

    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

    // Non-keyword → no task endpoint called
    expect(resumeTaskMock).not.toHaveBeenCalled();
    expect(cancelTaskMock).not.toHaveBeenCalled();
    // Falls through to normal chat flow
    expect(deps.setState).toHaveBeenCalledWith('responding');
  });

  it('bare edit prefix "edita" with no feedback calls onTaskEditMode instead of resumeTask', async () => {
    sendAudioMock.mockResolvedValue(makeAudioResponse('edita'));
    const onTaskEditMode = vi.fn();
    const activeTask = makeAwaitingTask('task-123');
    const deps = makeDeps({ activeTask, onTaskEditMode });

    await sendAudioAndHandle(new Uint8Array([1, 2, 3]), deps);

    expect(onTaskEditMode).toHaveBeenCalledWith('task-123');
    expect(resumeTaskMock).not.toHaveBeenCalled();
  });
});
