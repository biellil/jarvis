import { describe, it, expect, vi } from 'vitest';

import type { MemoryManager } from '../memory/index.js';
import { createRecallMemoryTool } from './tools.js';

function makeMemory(buildContextImpl: (q: string) => Promise<string>) {
  return {
    buildContext: vi.fn(buildContextImpl),
  } as unknown as MemoryManager;
}

describe('createRecallMemoryTool', () => {
  it('expõe name = "recall_memory"', () => {
    const memory = makeMemory(async () => '');
    const t = createRecallMemoryTool(memory);
    expect(t.name).toBe('recall_memory');
  });

  it('tem descrição em português mencionando memórias', () => {
    const t = createRecallMemoryTool(makeMemory(async () => ''));
    expect(t.description).toMatch(/memórias/i);
    expect(t.description).toMatch(/perfil/i);
  });

  it('chama memory.buildContext(query) exatamente uma vez e retorna o contexto', async () => {
    const memory = makeMemory(async () => '### User profile\n- gosto: café');
    const t = createRecallMemoryTool(memory);
    const result = await t.invoke({ query: 'café' });
    expect(memory.buildContext).toHaveBeenCalledOnce();
    expect(memory.buildContext).toHaveBeenCalledWith('café');
    expect(result).toBe('### User profile\n- gosto: café');
  });

  it('retorna fallback em pt-BR quando buildContext retorna string vazia', async () => {
    const memory = makeMemory(async () => '');
    const t = createRecallMemoryTool(memory);
    const result = await t.invoke({ query: 'assunto inexistente' });
    expect(result).toBe('Nenhuma memória relevante encontrada.');
  });

  it('retorna mensagem de erro em pt-BR quando buildContext rejeita (não propaga)', async () => {
    const memory = makeMemory(async () => {
      throw new Error('chroma offline');
    });
    const t = createRecallMemoryTool(memory);
    const result = await t.invoke({ query: 'qualquer' });
    expect(result).toBe('Erro ao buscar memórias: chroma offline');
  });

  it('valida schema rejeitando input sem query', async () => {
    const t = createRecallMemoryTool(makeMemory(async () => 'x'));
    // @ts-expect-error propositalmente inválido
    await expect(t.invoke({})).rejects.toThrow();
  });
});
