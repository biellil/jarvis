/**
 * Snapshot tests para as 9 PC tools TS vs fixtures JSON geradas do Python.
 *
 * Fixtures: apps/backend-ts/test/fixtures/tools/<name>.json
 * Regenerar: pnpm fixtures:tools
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createAllPcTools,
  createCloseAppTool,
  createDeleteFileTool,
  createListFilesTool,
  createListProcessesTool,
  createMoveFileTool,
  createOpenAppTool,
  createSearchFilesTool,
  createSetBrightnessTool,
  createSetVolumeTool,
} from '../../src/session/pc-tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../fixtures/tools');

function loadFixture(name: string): unknown {
  const raw = readFileSync(resolve(FIXTURES_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw);
}

async function invokePayload(toolInstance: {
  invoke: (input: unknown) => Promise<unknown>;
}, input: unknown): Promise<unknown> {
  const result = (await toolInstance.invoke(input)) as unknown;
  // content_and_artifact response format makes invoke() return the content string
  // (the JSON-stringified payload). Parse back to object for comparison.
  if (typeof result === 'string') {
    return JSON.parse(result);
  }
  return result;
}

describe('PC tools — paridade com fixtures Python', () => {
  it('open_app matches Python fixture', async () => {
    const t = createOpenAppTool();
    const payload = await invokePayload(t, { app_name: 'firefox' });
    expect(payload).toEqual(loadFixture('open_app'));
  });

  it('close_app matches Python fixture', async () => {
    const t = createCloseAppTool();
    const payload = await invokePayload(t, { app_name: 'vlc' });
    expect(payload).toEqual(loadFixture('close_app'));
  });

  it('list_files matches Python fixture', async () => {
    const t = createListFilesTool();
    const payload = await invokePayload(t, { directory: '/tmp' });
    expect(payload).toEqual(loadFixture('list_files'));
  });

  it('search_files matches Python fixture (com directory explícito)', async () => {
    const t = createSearchFilesTool();
    const payload = await invokePayload(t, { pattern: '*.py', directory: '.' });
    expect(payload).toEqual(loadFixture('search_files'));
  });

  it('search_files usa directory="." como default quando omitido', async () => {
    const t = createSearchFilesTool();
    const payload = await invokePayload(t, { pattern: '*.py' });
    expect(payload).toEqual(loadFixture('search_files'));
  });

  it('move_file matches Python fixture', async () => {
    const t = createMoveFileTool();
    const payload = await invokePayload(t, { source: 'a.txt', destination: 'b.txt' });
    expect(payload).toEqual(loadFixture('move_file'));
  });

  it('delete_file matches Python fixture e marca requires_confirmation', async () => {
    const t = createDeleteFileTool();
    const payload = (await invokePayload(t, { file_path: '/tmp/x' })) as Record<string, unknown>;
    expect(payload).toEqual(loadFixture('delete_file'));
    expect(payload.requires_confirmation).toBe(true);
    // garante paridade com Python: chave em args é `path`, NÃO `file_path`
    expect((payload.args as Record<string, unknown>).path).toBe('/tmp/x');
  });

  it('set_volume matches Python fixture', async () => {
    const t = createSetVolumeTool();
    const payload = await invokePayload(t, { level: 50 });
    expect(payload).toEqual(loadFixture('set_volume'));
  });

  it('set_brightness matches Python fixture', async () => {
    const t = createSetBrightnessTool();
    const payload = await invokePayload(t, { level: 70 });
    expect(payload).toEqual(loadFixture('set_brightness'));
  });

  it('list_processes matches Python fixture (args é objeto vazio)', async () => {
    const t = createListProcessesTool();
    const payload = (await invokePayload(t, {})) as Record<string, unknown>;
    expect(payload).toEqual(loadFixture('list_processes'));
    expect(payload.args).toEqual({});
  });
});

describe('createAllPcTools', () => {
  it('retorna as 9 tools na ordem esperada', () => {
    const tools = createAllPcTools();
    expect(tools).toHaveLength(9);
    expect(tools.map((t) => t.name)).toEqual([
      'open_app',
      'close_app',
      'list_files',
      'search_files',
      'move_file',
      'delete_file',
      'set_volume',
      'set_brightness',
      'list_processes',
    ]);
  });

  it('todas as descriptions são em pt-BR (começam com verbo pt)', () => {
    const tools = createAllPcTools();
    const verbs = ['Abre', 'Fecha', 'Lista', 'Busca', 'Move', 'Deleta', 'Define'];
    for (const t of tools) {
      const desc = t.description ?? '';
      expect(verbs.some((v) => desc.startsWith(v))).toBe(true);
    }
  });
});
