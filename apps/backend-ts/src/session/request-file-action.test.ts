/**
 * Tests for createRequestFileActionTool — Phase 55 (LACT-01..05)
 *
 * Uses vi.stubGlobal to mock fetch so no real HTTP is made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createRequestFileActionTool } from './request-file-action.js';

function makeResponse(body: object, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('createRequestFileActionTool', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expõe name = "request_file_action"', () => {
    const t = createRequestFileActionTool('client-123');
    expect(t.name).toBe('request_file_action');
  });

  it('status=confirmed sem content → retorna "Ação confirmada e executada."', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ status: 'confirmed' })),
    );
    const t = createRequestFileActionTool('client-abc');
    const result = await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });
    expect(result).toBe('Ação confirmada e executada.');
  });

  it('status=confirmed com content → retorna prefixo "Arquivo lido. Conteúdo:\\n{content}"', async () => {
    const fileContent = 'line1\nline2';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ status: 'confirmed', content: fileContent })),
    );
    const t = createRequestFileActionTool('client-abc');
    const result = await t.invoke({ action: 'viewContent', path: '/home/user/docs/notes.txt' });
    expect(result).toBe(`Arquivo lido. Conteúdo:\n${fileContent}`);
  });

  it('status=denied → retorna "Ação negada: {content}"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ status: 'denied', content: 'usuário recusou' })),
    );
    const t = createRequestFileActionTool('client-abc');
    const result = await t.invoke({ action: 'openFile', path: '/home/user/secret.txt' });
    expect(result).toBe('Ação negada: usuário recusou');
  });

  it('status=timeout → retorna "Ação timeout — sem resposta do usuário."', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ status: 'timeout' })),
    );
    const t = createRequestFileActionTool('client-abc');
    const result = await t.invoke({ action: 'closeFile', path: 'notepad.exe' });
    expect(result).toBe('Ação timeout — sem resposta do usuário.');
  });

  it('fetch lança erro de rede → retorna "Erro ao executar ação: {message}" sem propagar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network failure');
      }),
    );
    const t = createRequestFileActionTool('client-abc');
    const result = await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });
    expect(result).toBe('Erro ao executar ação: network failure');
  });
});
