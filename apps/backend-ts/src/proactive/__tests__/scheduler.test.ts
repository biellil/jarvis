import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mock variables (must be hoisted before vi.mock factories) ────────
const {
  mockDestroy,
  mockScheduledTask,
  mockSchedule,
  mockGet,
  mockAll,
  mockRun,
  mockSet,
  mockWhere,
  mockFrom,
  mockSelect,
  mockUpdate,
  mockIsInQuietHours,
  mockNextQuietEnd,
} = vi.hoisted(() => {
  const mockDestroy = vi.fn();
  const mockScheduledTask = { destroy: mockDestroy };
  const mockSchedule = vi.fn().mockReturnValue(mockScheduledTask);

  const mockGet = vi.fn();
  const mockAll = vi.fn().mockReturnValue([]);
  const mockRun = vi.fn();

  // Fluent chain: update().set().where().run()
  const mockRun2 = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ run: mockRun2, all: vi.fn(), get: vi.fn() });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  // Fluent chain: select().from().where().{all,get}()
  const mockFrom = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ all: mockAll, get: mockGet, run: mockRun }),
    all: mockAll,
    get: mockGet,
  });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  const mockIsInQuietHours = vi.fn().mockReturnValue(false);
  const mockNextQuietEnd = vi.fn().mockReturnValue(new Date(Date.now() + 8 * 60 * 60 * 1000));

  return {
    mockDestroy,
    mockScheduledTask,
    mockSchedule,
    mockGet,
    mockAll,
    mockRun,
    mockSet,
    mockWhere,
    mockFrom,
    mockSelect,
    mockUpdate,
    mockIsInQuietHours,
    mockNextQuietEnd,
  };
});

// ─── Mocks (factories can safely reference hoisted vars) ──────────────────────

vi.mock('node-cron', () => ({
  schedule: mockSchedule,
}));

vi.mock('../../memory/db.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('../quiet-hours.js', () => ({
  isInQuietHours: mockIsInQuietHours,
  nextQuietEnd: mockNextQuietEnd,
}));

// ─── Import the module under test (after mocks) ───────────────────────────────
import { ProactiveScheduler, proactiveEmitter } from '../scheduler.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePendingRow(id: number, dueAtMs: number) {
  return {
    id,
    due_at: dueAtMs,
    message: `lembrete ${id}`,
    kind: 'reminder' as const,
    status: 'pending' as const,
    created_at: Date.now(),
    fired_at: null,
    deferred_until: null,
  };
}

// Helper to rebuild the fluent chain mocks to the correct shape each test
function rebuildChains() {
  mockSchedule.mockReturnValue(mockScheduledTask);
  mockIsInQuietHours.mockReturnValue(false);
  mockNextQuietEnd.mockReturnValue(new Date(Date.now() + 8 * 60 * 60 * 1000));

  // select().from().where().{all,get}()
  const whereResult = { all: mockAll, get: mockGet, run: mockRun };
  mockWhere.mockReturnValue(whereResult);
  mockFrom.mockReturnValue({ where: mockWhere, all: mockAll, get: mockGet });
  mockSelect.mockReturnValue({ from: mockFrom });

  // update().set().where().run()
  mockWhere.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockUpdate.mockReturnValue({ set: mockSet });

  // Default: no rows
  mockAll.mockReturnValue([]);
  mockGet.mockReturnValue(null);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProactiveScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rebuildChains();

    // Start with an empty jobs map
    mockAll.mockReturnValue([]);
    ProactiveScheduler.bootstrap();
  });

  afterEach(() => {
    proactiveEmitter.removeAllListeners('event');
  });

  it('bootstrap: registers cron jobs for all pending reminders', () => {
    const now = Date.now();
    const pending1 = makePendingRow(1, now + 60_000);
    const pending2 = makePendingRow(2, now + 120_000);

    mockAll.mockReturnValue([pending1, pending2]);
    vi.clearAllMocks();
    rebuildChains();
    mockAll.mockReturnValue([pending1, pending2]);

    ProactiveScheduler.bootstrap();

    // cron.schedule should have been called once per reminder
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(ProactiveScheduler.jobCount).toBe(2);
  });

  it('bootstrap: registers cron jobs for all deferred reminders', () => {
    const now = Date.now();
    const deferred = {
      ...makePendingRow(3, now + 60_000),
      status: 'deferred' as const,
      deferred_until: now + 3_600_000, // adiado 1h
    };

    vi.clearAllMocks();
    rebuildChains();
    mockAll.mockReturnValue([deferred]);

    ProactiveScheduler.bootstrap();

    // 1 job registrado usando deferred_until (não due_at)
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(ProactiveScheduler.jobCount).toBe(1);
  });

  it('fireReminder: updates status to fired and emits SSE event', async () => {
    const reminderId = 10;
    const now = Date.now();
    const row = makePendingRow(reminderId, now - 1000); // já vencido

    vi.clearAllMocks();
    rebuildChains();
    // select().from().where().get() retorna a row
    const whereResult = { all: mockAll, get: vi.fn().mockReturnValue(row), run: mockRun };
    mockWhere.mockReturnValue(whereResult);
    mockFrom.mockReturnValue({ where: mockWhere, all: mockAll, get: mockGet });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // Quiet hours desativado
    mockIsInQuietHours.mockReturnValue(false);

    const emitted: unknown[] = [];
    proactiveEmitter.on('event', (e) => emitted.push(e));

    await ProactiveScheduler.fireReminder(reminderId);

    // DB update chamado com status=fired
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fired' }),
    );

    // proactiveEmitter emitiu o evento
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      kind: 'reminder',
      id: reminderId,
      message: row.message,
      dueAt: row.due_at,
    });
  });

  it('fireReminder: defers when in quiet hours, sets deferred_until', async () => {
    const reminderId = 20;
    const now = Date.now();
    const row = makePendingRow(reminderId, now - 1000);

    vi.clearAllMocks();
    rebuildChains();

    const whereResult = { all: mockAll, get: vi.fn().mockReturnValue(row), run: mockRun };
    mockWhere.mockReturnValue(whereResult);
    mockFrom.mockReturnValue({ where: mockWhere, all: mockAll, get: mockGet });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    mockIsInQuietHours.mockReturnValue(true); // EM quiet
    const deferredTime = new Date(now + 6 * 60 * 60 * 1000); // 6h depois
    mockNextQuietEnd.mockReturnValue(deferredTime);

    // Habilitar quiet hours no scheduler
    ProactiveScheduler.updateQuietHours(true, '22:00', '08:00');

    const emitted: unknown[] = [];
    proactiveEmitter.on('event', (e) => emitted.push(e));

    await ProactiveScheduler.fireReminder(reminderId);

    // DB update chamado com status=deferred e deferred_until definido
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'deferred',
        deferred_until: deferredTime.getTime(),
      }),
    );

    // Nenhum evento SSE emitido
    expect(emitted).toHaveLength(0);

    // Um novo cron job foi registrado (re-agendamento para deferred_until)
    expect(mockSchedule).toHaveBeenCalled();

    // Restaurar quiet hours off para outros testes
    ProactiveScheduler.updateQuietHours(false, '22:00', '08:00');
  });

  it('cancel: destroys cron job and updates status to cancelled', () => {
    const reminderId = 30;
    const now = Date.now();

    vi.clearAllMocks();
    rebuildChains();

    // Bootstrap com um lembrete pending para o job entrar no map
    mockAll.mockReturnValue([makePendingRow(reminderId, now + 60_000)]);
    ProactiveScheduler.bootstrap();

    expect(ProactiveScheduler.jobCount).toBe(1);

    // Rebuild chains for the cancel call
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // Cancelar
    vi.clearAllMocks();
    rebuildChains();
    ProactiveScheduler.cancelReminder(reminderId);

    // destroy() foi chamado na scheduled task
    expect(mockDestroy).toHaveBeenCalled();

    // DB atualizado para cancelled
    expect(mockSet).toHaveBeenCalledWith({ status: 'cancelled' });

    // Job removido do map
    expect(ProactiveScheduler.jobCount).toBe(0);
  });
});
