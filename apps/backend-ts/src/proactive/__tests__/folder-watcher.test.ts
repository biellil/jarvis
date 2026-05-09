import { describe, it } from 'vitest';

describe('FolderWatcher', () => {
  it.todo('ignores initial files on startup (ignoreInitial: true)');
  it.todo('buffers multiple add events and fires once after 2s debounce');
  it.todo('resets debounce timer on each new add event');
  it.todo('stopWatching: clears pending debounce and closes watcher');
  it.todo('startWatching with new path: closes old watcher first');
});
