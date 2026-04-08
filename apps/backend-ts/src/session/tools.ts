/**
 * Tools do ChatSession.
 *
 * Plan 17-02 introduz `recall_memory` — a primeira tool real exposta ao agente ReAct.
 * Ela delega para `MemoryManager.buildContext(query)` e lida com os casos degenerados
 * (contexto vazio, erro de busca) retornando strings em pt-BR, para que o LLM local
 * (LM Studio) tenha feedback claro do que aconteceu dentro do ciclo Reason→Act→Observe.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import type { MemoryManager } from '../memory/index.js';

const RECALL_MEMORY_DESCRIPTION =
  'Busca memórias relevantes de conversas passadas e fatos do perfil do usuário. ' +
  'Use quando precisar lembrar algo que o usuário disse antes ou referenciar preferências dele.';

const EMPTY_FALLBACK = 'Nenhuma memória relevante encontrada.';

const recallSchema = z.object({
  query: z
    .string()
    .describe('Termos de busca em linguagem natural para encontrar memórias relevantes.'),
});

/**
 * Cria uma instância da tool `recall_memory` ligada a um `MemoryManager`.
 *
 * A tool nunca propaga erros — em caso de falha retorna uma mensagem em pt-BR explicando
 * o problema, para não travar o ciclo ReAct do agente.
 */
export function createRecallMemoryTool(memory: MemoryManager) {
  return tool(
    async ({ query }: { query: string }): Promise<string> => {
      try {
        const ctx = await memory.buildContext(query);
        if (ctx === '') {
          return EMPTY_FALLBACK;
        }
        return ctx;
      } catch (exc) {
        return `Erro ao buscar memórias: ${(exc as Error).message}`;
      }
    },
    {
      name: 'recall_memory',
      description: RECALL_MEMORY_DESCRIPTION,
      schema: recallSchema,
    },
  );
}
