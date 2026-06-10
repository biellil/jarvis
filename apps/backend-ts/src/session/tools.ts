/**
 * Tools do ChatSession.
 *
 * Plan 17-02 introduz `recall_memory` — a primeira tool real exposta ao agente ReAct.
 * Ela delega para `MemoryManager.buildContext(query)` e lida com os casos degenerados
 * (contexto vazio, erro de busca) retornando strings em pt-BR, para que o LLM local
 * (LM Studio) tenha feedback claro do que aconteceu dentro do ciclo Reason→Act→Observe.
 *
 * Plan 67-02 adiciona três tools de lembretes proativos:
 * createReminderTool, listRemindersTool, cancelReminderTool.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import type { MemoryManager } from '../memory/index.js';

const RECALL_MEMORY_DESCRIPTION =
  'Busca memórias relevantes de conversas passadas e fatos do perfil do usuário. ' +
  'Use quando precisar lembrar algo que o usuário disse antes ou referenciar preferências dele. ' +
  'Use o parâmetro target_speaker quando o usuário mencionar explicitamente outra pessoa pelo nome.';

const EMPTY_FALLBACK = 'Nenhuma memória relevante encontrada.';

const recallSchema = z.object({
  query: z
    .string()
    .describe('Termos de busca em linguagem natural para encontrar memórias relevantes.'),
  target_speaker: z
    .string()
    .optional()
    .describe(
      'Nome do falante cujas memórias devem ser consultadas. ' +
      'Use SOMENTE quando o usuário mencionar explicitamente outra pessoa pelo nome ' +
      '(ex: "o que a Maria pediu?", "o que o João disse sobre X?"). ' +
      'Quando ausente, busca apenas as memórias do falante atual.',
    ),
});

/**
 * Cria uma instância da tool `recall_memory` ligada a um `MemoryManager`.
 *
 * A tool nunca propaga erros — em caso de falha retorna uma mensagem em pt-BR explicando
 * o problema, para não travar o ciclo ReAct do agente.
 *
 * Phase 94 (D-05/D-06): aceita target_speaker opcional para cross-speaker recall.
 * Apenas falantes reconhecidos (não "unknown") podem cruzar memórias de outros.
 */
export function createRecallMemoryTool(memory: MemoryManager, getSpeakerId?: () => string | undefined) {
  return tool(
    async ({ query, target_speaker }: { query: string; target_speaker?: string }): Promise<string> => {
      try {
        const currentSpeaker = getSpeakerId?.();

        // D-05: only recognized (non-unknown) speakers may cross-query
        if (target_speaker) {
          if (!currentSpeaker || currentSpeaker === 'unknown') {
            return 'Acesso negado: apenas falantes reconhecidos podem consultar memórias de outras pessoas.';
          }
          // D-12: normalize — trim + space→underscore, no lowercasing
          const { normalizeSpeakerId } = await import('../memory/speaker-id.js');
          const resolvedTarget = normalizeSpeakerId(target_speaker);
          const ctx = await memory.buildContext(query, undefined, resolvedTarget);
          return ctx || EMPTY_FALLBACK;
        }

        // Strict mode: use current speaker
        const ctx = await memory.buildContext(query, undefined, currentSpeaker);
        return ctx || EMPTY_FALLBACK;
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

export { createRequestFileActionTool } from './request-file-action.js';

// Plan 67-02 — Proactive reminder tools
export { createReminderTool, listRemindersTool, cancelReminderTool } from '../proactive/tools.js';
export { RemindersRepository } from '../proactive/repository.js';
