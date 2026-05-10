/**
 * ProactiveSSEConsumer + setupProactiveIpc — Phase 67 Plan 08 (PROACT-02, PROACT-03)
 *
 * Testa:
 * - ProactiveSSEConsumer.handleProactiveEvent: Notification título correto por kind
 * - ProactiveSSEConsumer: webContents.send('proactive:event') chamado a cada evento
 * - ProactiveSSEConsumer: mainWindow.focus() chamado ao clicar na notificação
 * - setupProactiveIpc: handlers IPC registrados para os 3 canais de configuração proativa
 * - pushProactiveConfigToBackend: POST correto para backend nas 3 rotas
 *
 * [Phase 67]: vi.hoisted() obrigatório para vi.mock factories que referenciam variáveis
 * externas no Vitest — evita "Cannot access before initialization".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// vi.hoisted() — declara mocks ANTES do hoist de vi.mock()
// ============================================================

const {
  notificationShowMock,
  notificationOnMock,
  NotificationConstructorMock,
  ipcHandleMock,
  fakeWebContentsSend,
  fakeMainWindowFocus,
  getAllWindowsMock,
  setQuietHoursMock,
  setFolderWatchMock,
  setDailySummaryMock,
  getQuietHoursMock,
  getFolderWatchMock,
  getDailySummaryMock,
  fetchMock,
} = vi.hoisted(() => {
  const notificationShowMock = vi.fn();
  const notificationOnMock = vi.fn();
  // vi.fn() com arrow function não é construível com `new` (ES6 arrow não tem [[Construct]])
  // — usar function keyword via mockImplementation para compatibilidade com `new Notification()`
  // [Phase 67]: padrão obrigatório para mocks de construtores em Vitest
  const NotificationConstructorMock = vi.fn().mockImplementation(function (
    this: { show: typeof notificationShowMock; on: typeof notificationOnMock },
    _opts: { title: string; body: string; silent?: boolean },
  ) {
    this.show = notificationShowMock;
    this.on = notificationOnMock;
  });

  const ipcHandleMock = vi.fn();
  const fakeWebContentsSend = vi.fn();
  const fakeMainWindowFocus = vi.fn();
  const getAllWindowsMock = vi.fn(() => [
    { webContents: { send: fakeWebContentsSend }, isDestroyed: () => false },
  ]);

  const setQuietHoursMock = vi.fn();
  const setFolderWatchMock = vi.fn();
  const setDailySummaryMock = vi.fn();
  const getQuietHoursMock = vi.fn(() => ({ enabled: false, start: '22:00', end: '08:00' }));
  const getFolderWatchMock = vi.fn(() => ({ enabled: false, path: '' }));
  const getDailySummaryMock = vi.fn(() => ({ enabled: true, time: '09:00' }));

  const fetchMock = vi.fn();

  return {
    notificationShowMock,
    notificationOnMock,
    NotificationConstructorMock,
    ipcHandleMock,
    fakeWebContentsSend,
    fakeMainWindowFocus,
    getAllWindowsMock,
    setQuietHoursMock,
    setFolderWatchMock,
    setDailySummaryMock,
    getQuietHoursMock,
    getFolderWatchMock,
    getDailySummaryMock,
    fetchMock,
  };
});

// ============================================================
// Mocks de módulos — DEVEM vir antes de qualquer import dos módulos sob teste
// ============================================================

vi.mock('electron', () => ({
  Notification: NotificationConstructorMock,
  ipcMain: {
    handle: (...args: unknown[]) => ipcHandleMock(...args),
  },
  BrowserWindow: {
    getAllWindows: () => getAllWindowsMock(),
  },
}));

vi.mock('../../store', () => ({
  setQuietHours: (...args: unknown[]) => setQuietHoursMock(...args),
  setFolderWatch: (...args: unknown[]) => setFolderWatchMock(...args),
  setDailySummary: (...args: unknown[]) => setDailySummaryMock(...args),
  getQuietHours: () => getQuietHoursMock(),
  getFolderWatch: () => getFolderWatchMock(),
  getDailySummary: () => getDailySummaryMock(),
}));

vi.stubGlobal('fetch', fetchMock);

// Importar APÓS os mocks
import { ProactiveSSEConsumer } from '../../proactive-handler';
import { setupProactiveIpc, pushProactiveConfigToBackend } from '../proactive';
import type { ProactiveEvent } from '../../../shared/ipc-types';

// ============================================================
// Helpers
// ============================================================

function makeFakeMainWindow(isDestroyed = false): Electron.BrowserWindow {
  return {
    webContents: { send: fakeWebContentsSend },
    isDestroyed: () => isDestroyed,
    focus: fakeMainWindowFocus,
  } as unknown as Electron.BrowserWindow;
}

// ============================================================
// ProactiveSSEConsumer — Notifications + IPC dispatch
// ============================================================

describe('ProactiveSSEConsumer', () => {
  let consumer: ProactiveSSEConsumer;
  let mainWindow: Electron.BrowserWindow;

  beforeEach(() => {
    consumer = new ProactiveSSEConsumer();
    mainWindow = makeFakeMainWindow();
    notificationShowMock.mockReset();
    notificationOnMock.mockReset();
    NotificationConstructorMock.mockReset();
    // Re-registra a implementação com function keyword (arrow não é construtável com `new`)
    NotificationConstructorMock.mockImplementation(function (
      this: { show: typeof notificationShowMock; on: typeof notificationOnMock },
      _opts: { title: string; body: string; silent?: boolean },
    ) {
      this.show = notificationShowMock;
      this.on = notificationOnMock;
    });
    fakeWebContentsSend.mockReset();
    fakeMainWindowFocus.mockReset();
  });

  it('shows Electron Notification with title "Lembrete" on reminder event', () => {
    const evt: ProactiveEvent = {
      kind: 'reminder',
      id: 1,
      message: 'Revisar o PR',
      dueAt: Date.now(),
    };

    consumer.dispatchEventForTest(evt, mainWindow);

    expect(NotificationConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lembrete', body: 'Revisar o PR' }),
    );
    expect(notificationShowMock).toHaveBeenCalled();
  });

  it('shows Electron Notification with title "Resumo diário pronto" on daily_summary', () => {
    const evt: ProactiveEvent = {
      kind: 'daily_summary',
      text: 'Hoje conversamos sobre o PR e fizemos algumas ações.',
      generatedAt: Date.now(),
    };

    consumer.dispatchEventForTest(evt, mainWindow);

    expect(NotificationConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Resumo diário pronto' }),
    );
    expect(notificationShowMock).toHaveBeenCalled();
  });

  it('shows Electron Notification with correct title on folder_event (single file)', () => {
    const evt: ProactiveEvent = {
      kind: 'folder_event',
      folderPath: '/home/user/Downloads',
      files: [{ name: 'relatorio.pdf', path: '/home/user/Downloads/relatorio.pdf' }],
    };

    consumer.dispatchEventForTest(evt, mainWindow);

    expect(NotificationConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('Downloads') }),
    );
    expect(notificationShowMock).toHaveBeenCalled();
  });

  it('calls mainWindow.webContents.send("proactive:event") on every event', () => {
    const evt: ProactiveEvent = {
      kind: 'reminder',
      id: 2,
      message: 'Beber água',
      dueAt: Date.now(),
    };

    consumer.dispatchEventForTest(evt, mainWindow);

    expect(fakeWebContentsSend).toHaveBeenCalledWith('proactive:event', evt);
  });

  it('does NOT call webContents.send when mainWindow is destroyed', () => {
    const localSend = vi.fn();
    const destroyedWindow = {
      webContents: { send: localSend },
      isDestroyed: () => true,
      focus: vi.fn(),
    } as unknown as Electron.BrowserWindow;

    const evt: ProactiveEvent = {
      kind: 'reminder',
      id: 3,
      message: 'Reunião',
      dueAt: Date.now(),
    };

    consumer.dispatchEventForTest(evt, destroyedWindow);

    expect(localSend).not.toHaveBeenCalled();
  });

  it('mainWindow.focus() called when notification is clicked', () => {
    const evt: ProactiveEvent = {
      kind: 'reminder',
      id: 4,
      message: 'Review code',
      dueAt: Date.now(),
    };

    consumer.dispatchEventForTest(evt, mainWindow);

    // Encontra o handler registrado com 'click'
    const clickCall = notificationOnMock.mock.calls.find((c) => c[0] === 'click');
    expect(clickCall).toBeDefined();

    // Simula o click na notificação
    (clickCall![1] as () => void)();
    expect(fakeMainWindowFocus).toHaveBeenCalled();
  });
});

// ============================================================
// setupProactiveIpc — IPC handler registration
// ============================================================

describe('setupProactiveIpc', () => {
  beforeEach(() => {
    ipcHandleMock.mockReset();
    setQuietHoursMock.mockReset();
    setFolderWatchMock.mockReset();
    setDailySummaryMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });

  it('registers proactive:apply-quiet-hours handler', () => {
    setupProactiveIpc('http://localhost:8001', 'test-bearer');
    const channels = ipcHandleMock.mock.calls.map((c) => c[0]);
    expect(channels).toContain('proactive:apply-quiet-hours');
  });

  it('registers proactive:apply-folder-watch handler', () => {
    setupProactiveIpc('http://localhost:8001', 'test-bearer');
    const channels = ipcHandleMock.mock.calls.map((c) => c[0]);
    expect(channels).toContain('proactive:apply-folder-watch');
  });

  it('registers proactive:apply-daily-summary handler', () => {
    setupProactiveIpc('http://localhost:8001', 'test-bearer');
    const channels = ipcHandleMock.mock.calls.map((c) => c[0]);
    expect(channels).toContain('proactive:apply-daily-summary');
  });

  it('apply-quiet-hours: persists to store and calls backend on valid HH:MM', async () => {
    setupProactiveIpc('http://localhost:8001', 'test-bearer');
    const handler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === 'proactive:apply-quiet-hours',
    )?.[1] as
      | ((_event: unknown, config: { enabled: boolean; start: string; end: string }) => Promise<{
          success: boolean;
        }>)
      | undefined;
    expect(handler).toBeDefined();

    const config = { enabled: true, start: '22:00', end: '08:00' };
    const result = await handler!({}, config);

    expect(result.success).toBe(true);
    expect(setQuietHoursMock).toHaveBeenCalledWith(config);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/settings/quiet-hours'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('apply-quiet-hours: returns error on invalid HH:MM format', async () => {
    setupProactiveIpc('http://localhost:8001', 'test-bearer');
    const handler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === 'proactive:apply-quiet-hours',
    )?.[1] as
      | ((_event: unknown, config: unknown) => Promise<{ success: boolean; error?: string }>)
      | undefined;

    const result = await handler!({}, { enabled: true, start: '25:99', end: '08:00' });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(setQuietHoursMock).not.toHaveBeenCalled();
  });

  it('apply-folder-watch: rejects non-absolute path', async () => {
    setupProactiveIpc('http://localhost:8001', 'test-bearer');
    const handler = ipcHandleMock.mock.calls.find(
      (c) => c[0] === 'proactive:apply-folder-watch',
    )?.[1] as
      | ((_event: unknown, config: unknown) => Promise<{ success: boolean; error?: string }>)
      | undefined;

    const result = await handler!({}, { enabled: true, path: 'relative/path' });

    expect(result.success).toBe(false);
    expect(setFolderWatchMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// pushProactiveConfigToBackend — startup config push
// ============================================================

describe('pushProactiveConfigToBackend', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    getQuietHoursMock.mockReturnValue({ enabled: false, start: '22:00', end: '08:00' });
    getFolderWatchMock.mockReturnValue({ enabled: false, path: '' });
    getDailySummaryMock.mockReturnValue({ enabled: true, time: '09:00' });
  });

  it('POSTs quiet-hours config to backend', async () => {
    await pushProactiveConfigToBackend('http://localhost:8001', 'test-bearer');
    const quietHoursCall = fetchMock.mock.calls.find((c) =>
      (c[0] as string).includes('/api/settings/quiet-hours'),
    );
    expect(quietHoursCall).toBeDefined();
  });

  it('POSTs folder-watch config to backend', async () => {
    await pushProactiveConfigToBackend('http://localhost:8001', 'test-bearer');
    const folderWatchCall = fetchMock.mock.calls.find((c) =>
      (c[0] as string).includes('/api/settings/folder-watch'),
    );
    expect(folderWatchCall).toBeDefined();
  });

  it('POSTs daily-summary config to backend', async () => {
    await pushProactiveConfigToBackend('http://localhost:8001', 'test-bearer');
    const dailySummaryCall = fetchMock.mock.calls.find((c) =>
      (c[0] as string).includes('/api/settings/daily-summary'),
    );
    expect(dailySummaryCall).toBeDefined();
  });
});
