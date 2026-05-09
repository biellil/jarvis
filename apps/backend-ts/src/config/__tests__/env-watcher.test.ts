import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startEnvWatcher } from '../env-watcher.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('env-watcher (Phase 65 D-09 / SC1)', () => {
  let tempRoot: string;
  let stop: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'jarvis-env-watcher-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (stop) {
      await stop();
      stop = null;
    }
    await rm(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('MCP_SERVER_URL change triggers reload (SC1)', async () => {
    await writeFile(join(tempRoot, '.env'), 'MCP_SERVER_URL=http://a\n');
    const onChange = vi.fn();
    stop = startEnvWatcher(onChange, { projectRoot: tempRoot, debounceMs: 50 });
    // Let chokidar finish its initial scan
    await sleep(150);

    await writeFile(join(tempRoot, '.env'), 'MCP_SERVER_URL=http://b\n');
    await sleep(500); // chokidar awaitWriteFinish 200ms + debounce 50ms + slack

    expect(onChange).toHaveBeenCalledOnce();
  }, 5_000);

  it('non-MCP change ignored', async () => {
    await writeFile(
      join(tempRoot, '.env'),
      'MCP_SERVER_URL=http://a\nLLM_PROVIDER=lmstudio\n',
    );
    const onChange = vi.fn();
    stop = startEnvWatcher(onChange, { projectRoot: tempRoot, debounceMs: 50 });
    await sleep(150);

    await writeFile(
      join(tempRoot, '.env'),
      'MCP_SERVER_URL=http://a\nLLM_PROVIDER=openai\n',
    );
    await sleep(500);

    expect(onChange).not.toHaveBeenCalled();
  }, 5_000);

  it('atomic save (unlink+add <100ms) debounced to single reload (Pitfall 3)', async () => {
    await writeFile(join(tempRoot, '.env'), 'MCP_SERVER_URL=http://a\n');
    const onChange = vi.fn();
    stop = startEnvWatcher(onChange, { projectRoot: tempRoot, debounceMs: 50 });
    await sleep(150);

    // Simulate VS Code atomic save: unlink + recreate within ~50ms
    await unlink(join(tempRoot, '.env'));
    await sleep(20);
    await writeFile(join(tempRoot, '.env'), 'MCP_SERVER_URL=http://b\n');
    await sleep(500);

    expect(onChange.mock.calls.length).toBeLessThanOrEqual(1);
    // And it WAS triggered (URL changed), so exactly 1
    expect(onChange).toHaveBeenCalledOnce();
  }, 5_000);
});
