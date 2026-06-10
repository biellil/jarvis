import { describe, it, expect, vi } from 'vitest';

import type { MemoryManager } from '../memory/index.js';
import { createRecallMemoryTool } from './tools.js';

function makeMemory(buildContextImpl: (q: string, r?: string, s?: string) => Promise<string>) {
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

  it('chama memory.buildContext com speakerId do closure quando target_speaker ausente', async () => {
    const memory = makeMemory(async () => '### User profile\n- gosto: café');
    const t = createRecallMemoryTool(memory, () => 'Ana');
    const result = await t.invoke({ query: 'café' });
    expect(memory.buildContext).toHaveBeenCalledOnce();
    expect(memory.buildContext).toHaveBeenCalledWith('café', undefined, 'Ana');
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

  // Phase 94 — cross-speaker recall tests
  describe('target_speaker', () => {
    it('consulta memórias do target_speaker quando falante atual é reconhecido', async () => {
      const memory = makeMemory(async () => '### Memórias de João');
      const t = createRecallMemoryTool(memory, () => 'Ana');
      const result = await t.invoke({ query: 'pizza', target_speaker: 'João' });
      expect(memory.buildContext).toHaveBeenCalledOnce();
      // target is normalized: 'João' → 'João' (no spaces to replace)
      expect(memory.buildContext).toHaveBeenCalledWith('pizza', undefined, 'João');
      expect(result).toBe('### Memórias de João');
    });

    it('normaliza target_speaker: espaços viram underscore', async () => {
      const memory = makeMemory(async () => 'ok');
      const t = createRecallMemoryTool(memory, () => 'Ana');
      await t.invoke({ query: 'pizza', target_speaker: 'João Silva' });
      expect(memory.buildContext).toHaveBeenCalledWith('pizza', undefined, 'João_Silva');
    });

    it('recusa cross-speaker quando falante atual é "unknown" (D-05)', async () => {
      const memory = makeMemory(async () => 'dados secretos');
      const t = createRecallMemoryTool(memory, () => 'unknown');
      const result = await t.invoke({ query: 'pizza', target_speaker: 'João' });
      expect(memory.buildContext).not.toHaveBeenCalled();
      expect(result).toMatch(/Acesso negado/);
    });

    it('recusa cross-speaker quando falante atual é undefined (D-05)', async () => {
      const memory = makeMemory(async () => 'dados secretos');
      const t = createRecallMemoryTool(memory); // no getSpeakerId
      const result = await t.invoke({ query: 'pizza', target_speaker: 'João' });
      expect(memory.buildContext).not.toHaveBeenCalled();
      expect(result).toMatch(/Acesso negado/);
    });

    it('schema aceita target_speaker opcional (sem target_speaker no input)', async () => {
      const memory = makeMemory(async () => 'ok');
      const t = createRecallMemoryTool(memory, () => 'Ana');
      // Should not throw — target_speaker is optional
      await expect(t.invoke({ query: 'teste' })).resolves.toBe('ok');
    });
  });
});
