import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// Hoisted mock state — shared between vi.mock factory and test helpers
const mockWatcherState = vi.hoisted(() => {
  // Each call to chokidar.watch returns a fresh mock watcher
  // We keep a reference to the last created one for helpers
  let currentWatcher: { on: Mock; close: Mock } | null = null;

  const createFakeWatcher = () => {
    const watcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    currentWatcher = watcher;
    return watcher;
  };

  return { createFakeWatcher, getCurrentWatcher: () => currentWatcher };
});

// Mock chokidar — fresh watcher per watch() call
vi.mock('chokidar', () => ({
  watch: vi.fn().mockImplementation(() => mockWatcherState.createFakeWatcher()),
}));

// Mock quiet-hours before importing FolderWatcher
vi.mock('../quiet-hours.js', () => ({
  isInQuietHours: vi.fn().mockReturnValue(false),
  nextQuietEnd: vi.fn().mockReturnValue(new Date(Date.now() + 60_000)),
}));

import { watch as chokidarWatch } from 'chokidar';
import { isInQuietHours, nextQuietEnd } from '../quiet-hours.js';
import { FolderWatcher } from '../folder-watcher.js';

// Helper to get the current fake watcher
function getFakeWatcher() {
  return mockWatcherState.getCurrentWatcher() as { on: Mock; close: Mock };
}

// Helper to trigger 'add' event on the current fake watcher
function triggerAdd(filePath: string) {
  const watcher = getFakeWatcher();
  const addHandler = watcher.on.mock.calls.find(([evt]: string[]) => evt === 'add')?.[1] as
    | ((path: string) => void)
    | undefined;
  if (addHandler) addHandler(filePath);
}

describe('FolderWatcher', () => {
  let folderWatcher: FolderWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    (chokidarWatch as Mock).mockClear();
    (isInQuietHours as Mock).mockReturnValue(false);
    (nextQuietEnd as Mock).mockReturnValue(new Date(Date.now() + 60_000));
    folderWatcher = new FolderWatcher(() => ({
      enabled: false,
      start: '22:00',
      end: '08:00',
    }));
  });

  afterEach(async () => {
    await folderWatcher.stopWatching();
    vi.useRealTimers();
  });

  it('ignores initial files on startup (ignoreInitial: true)', async () => {
    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    expect(chokidarWatch).toHaveBeenCalledWith('/some/folder', {
      ignoreInitial: true,
      persistent: true,
      depth: 0,
    });
  });

  it('buffers multiple add events and fires once after 2s debounce', async () => {
    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    triggerAdd('/some/folder/file1.txt');
    triggerAdd('/some/folder/file2.txt');
    triggerAdd('/some/folder/file3.txt');

    // Not called yet (debounce pending)
    expect(onFolderEvent).not.toHaveBeenCalled();

    // Advance 2s — debounce fires
    vi.advanceTimersByTime(2000);

    expect(onFolderEvent).toHaveBeenCalledTimes(1);
    expect(onFolderEvent).toHaveBeenCalledWith([
      { name: 'file1.txt', path: '/some/folder/file1.txt' },
      { name: 'file2.txt', path: '/some/folder/file2.txt' },
      { name: 'file3.txt', path: '/some/folder/file3.txt' },
    ]);
  });

  it('resets debounce timer on each new add event', async () => {
    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    triggerAdd('/some/folder/file1.txt');
    vi.advanceTimersByTime(1000); // 1s elapsed — debounce not yet fired

    triggerAdd('/some/folder/file2.txt'); // resets timer
    vi.advanceTimersByTime(1000); // 1s more — still 1s to go

    expect(onFolderEvent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000); // final 1s — debounce fires

    expect(onFolderEvent).toHaveBeenCalledTimes(1);
    expect(onFolderEvent).toHaveBeenCalledWith([
      { name: 'file1.txt', path: '/some/folder/file1.txt' },
      { name: 'file2.txt', path: '/some/folder/file2.txt' },
    ]);
  });

  it('stopWatching: clears pending debounce and closes watcher', async () => {
    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    triggerAdd('/some/folder/file1.txt');

    // Stop before debounce fires
    await folderWatcher.stopWatching();

    // Advance timer — should NOT call onFolderEvent
    vi.advanceTimersByTime(2000);

    expect(onFolderEvent).not.toHaveBeenCalled();

    const watcher = getFakeWatcher();
    expect(watcher.close).toHaveBeenCalled();
  });

  it('startWatching with new path: closes old watcher first', async () => {
    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/folder/one', onFolderEvent);

    const firstWatcher = getFakeWatcher();

    // Start watching a different folder
    await folderWatcher.startWatching('/folder/two', onFolderEvent);

    expect(firstWatcher.close).toHaveBeenCalled();
    expect(chokidarWatch).toHaveBeenCalledTimes(2);
    expect(chokidarWatch).toHaveBeenLastCalledWith('/folder/two', expect.any(Object));
  });

  it('during quiet hours: debounce fires but defers to quiet end instead of calling onFolderEvent', async () => {
    const quietEndTime = Date.now() + 3_600_000; // 1h from "now"
    (isInQuietHours as Mock).mockReturnValue(true);
    (nextQuietEnd as Mock).mockReturnValue(new Date(quietEndTime));

    folderWatcher = new FolderWatcher(() => ({
      enabled: true,
      start: '22:00',
      end: '08:00',
    }));

    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    triggerAdd('/some/folder/file1.txt');

    // Debounce fires at 2s — but quiet hours active → should NOT call onFolderEvent
    vi.advanceTimersByTime(2000);

    expect(onFolderEvent).not.toHaveBeenCalled();
  });

  it('quiet hours defer: emits aggregated batch at quiet end', async () => {
    // Start in quiet hours → quiet ends in 1h
    const quietEndMs = 3_600_000; // 1 hour
    (isInQuietHours as Mock).mockReturnValue(true);
    (nextQuietEnd as Mock).mockReturnValue(new Date(Date.now() + quietEndMs));

    folderWatcher = new FolderWatcher(() => ({
      enabled: true,
      start: '22:00',
      end: '08:00',
    }));

    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    triggerAdd('/some/folder/file1.txt');

    // Debounce fires — defers to quiet end
    vi.advanceTimersByTime(2000);
    expect(onFolderEvent).not.toHaveBeenCalled();

    // Quiet ends
    vi.advanceTimersByTime(quietEndMs);

    expect(onFolderEvent).toHaveBeenCalledTimes(1);
    expect(onFolderEvent).toHaveBeenCalledWith([
      { name: 'file1.txt', path: '/some/folder/file1.txt' },
    ]);
  });

  it('two files in quiet from different debounce batches: aggregated into single emission at quiet end', async () => {
    const quietEndMs = 3_600_000; // 1 hour
    (isInQuietHours as Mock).mockReturnValue(true);
    (nextQuietEnd as Mock).mockReturnValue(new Date(Date.now() + quietEndMs));

    folderWatcher = new FolderWatcher(() => ({
      enabled: true,
      start: '22:00',
      end: '08:00',
    }));

    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    // First file → debounce batch 1
    triggerAdd('/some/folder/file1.txt');
    vi.advanceTimersByTime(2000); // debounce fires, deferred to quiet end

    // Second file → debounce batch 2 (quiet timer already running)
    triggerAdd('/some/folder/file2.txt');
    vi.advanceTimersByTime(2000); // second debounce fires, appended to quietBuffer

    expect(onFolderEvent).not.toHaveBeenCalled();

    // Quiet ends — both files should be in one emission
    vi.advanceTimersByTime(quietEndMs - 4000); // remaining time to quiet end

    expect(onFolderEvent).toHaveBeenCalledTimes(1);
    expect(onFolderEvent).toHaveBeenCalledWith([
      { name: 'file1.txt', path: '/some/folder/file1.txt' },
      { name: 'file2.txt', path: '/some/folder/file2.txt' },
    ]);
  });

  it('stopWatching during quiet deferral: does NOT call onFolderEvent, clears quietDeferTimer', async () => {
    const quietEndMs = 3_600_000;
    (isInQuietHours as Mock).mockReturnValue(true);
    (nextQuietEnd as Mock).mockReturnValue(new Date(Date.now() + quietEndMs));

    folderWatcher = new FolderWatcher(() => ({
      enabled: true,
      start: '22:00',
      end: '08:00',
    }));

    const onFolderEvent = vi.fn();
    await folderWatcher.startWatching('/some/folder', onFolderEvent);

    triggerAdd('/some/folder/file1.txt');
    vi.advanceTimersByTime(2000); // debounce fires → deferred

    // Stop while quiet defer timer is running
    await folderWatcher.stopWatching();

    // Advance past quiet end — should NOT call onFolderEvent
    vi.advanceTimersByTime(quietEndMs);

    expect(onFolderEvent).not.toHaveBeenCalled();
  });
});
