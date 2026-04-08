/**
 * Unit tests para o wrapper `tool-dispatch.ts` (Plan 18-03 Task 1).
 *
 * Mocka ToolLogger (logDispatch spy) e um listener spy. Verifica:
 *   - logDispatch é chamado com o nome da tool e os args do payload.
 *   - listener recebe DispatchEvent com toolCallId, action, args, requiresConfirmation.
 *   - delete_file propaga requiresConfirmation=true.
 *   - Sem listener ativo: logDispatch ainda roda, sem erro.
 *   - logDispatch retornando null: listener NÃO é chamado.
 *   - listener throwing: warning mas sem propagar.
 *   - wrapper preserva o JSON string original como retorno pro agent.
 *   - wrapAllPcTools preserva name/description/count.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  createOpenAppTool,
  createDeleteFileTool,
  createAllPcTools,
} from '../../src/session/pc-tools.js';
import {
  wrapPcTool,
  wrapAllPcTools,
  type DispatchContext,
  type OnToolDispatched,
} from '../../src/session/tool-dispatch.js';
import type { ToolLogger } from '../../src/memory/store.js';

function makeLogger(returnId: number | null = 42) {
  return {
    logDispatch: vi.fn(() => returnId),
    updateOutcome: vi.fn(),
    log: vi.fn(),
    close: vi.fn(),
  } as unknown as ToolLogger;
}

function makeCtx(logger: ToolLogger, listener: OnToolDispatched | null = null): DispatchContext {
  return {
    logger,
    getListener: () => listener,
  };
}

describe('wrapPcTool', () => {
  it('invoca a tool original, grava logDispatch e chama listener com DispatchEvent', async () => {
    const logger = makeLogger(42);
    const listener = vi.fn();
    const wrapped = wrapPcTool(createOpenAppTool(), makeCtx(logger, listener));

    const result = await wrapped.invoke({ app_name: 'firefox' });

    expect((logger.logDispatch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(logger.logDispatch).toHaveBeenCalledWith('open_app', { app: 'firefox' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      toolCallId: 42,
      action: 'open_app',
      args: { app: 'firefox' },
      requiresConfirmation: false,
    });

    // Retorna exatamente o JSON string original ao agent
    expect(typeof result).toBe('string');
    expect(JSON.parse(result as string)).toEqual({
      action: 'open_app',
      args: { app: 'firefox' },
    });
  });

  it('delete_file propaga requiresConfirmation=true no DispatchEvent', async () => {
    const logger = makeLogger(7);
    const listener = vi.fn();
    const wrapped = wrapPcTool(createDeleteFileTool(), makeCtx(logger, listener));

    await wrapped.invoke({ file_path: '/tmp/x' });

    expect(listener).toHaveBeenCalledWith({
      toolCallId: 7,
      action: 'delete_file',
      args: { path: '/tmp/x' },
      requiresConfirmation: true,
    });
  });

  it('sem listener ativo: logDispatch ainda roda e o resultado é retornado', async () => {
    const logger = makeLogger(42);
    const wrapped = wrapPcTool(createOpenAppTool(), makeCtx(logger, null));

    const result = await wrapped.invoke({ app_name: 'vlc' });

    expect(logger.logDispatch).toHaveBeenCalledOnce();
    expect(JSON.parse(result as string)).toEqual({
      action: 'open_app',
      args: { app: 'vlc' },
    });
  });

  it('logDispatch retornando null: listener NÃO é chamado', async () => {
    const logger = makeLogger(null);
    const listener = vi.fn();
    const wrapped = wrapPcTool(createOpenAppTool(), makeCtx(logger, listener));

    const result = await wrapped.invoke({ app_name: 'firefox' });

    expect(logger.logDispatch).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
    expect(typeof result).toBe('string');
  });

  it('listener throwing: wrapper loga warning mas não propaga', async () => {
    const logger = makeLogger(42);
    const listener = vi.fn(() => {
      throw new Error('boom');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapped = wrapPcTool(createOpenAppTool(), makeCtx(logger, listener));

    await expect(wrapped.invoke({ app_name: 'firefox' })).resolves.toBeDefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserva name e description da tool original', () => {
    const original = createOpenAppTool();
    const wrapped = wrapPcTool(original, makeCtx(makeLogger()));
    expect(wrapped.name).toBe('open_app');
    expect(wrapped.description).toBe(original.description);
  });
});

describe('wrapAllPcTools', () => {
  it('wrappa as 9 PC tools preservando nomes', () => {
    const logger = makeLogger();
    const pcTools = createAllPcTools();
    const wrapped = wrapAllPcTools(pcTools, makeCtx(logger));

    expect(wrapped).toHaveLength(9);
    const names = wrapped.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'close_app',
        'delete_file',
        'list_files',
        'list_processes',
        'move_file',
        'open_app',
        'search_files',
        'set_brightness',
        'set_volume',
      ].sort(),
    );
  });
});
