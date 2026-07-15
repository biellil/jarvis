import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { planSchema, type Plan } from './types.js';

export const PLANNER_SYSTEM_PROMPT = `Você é o planejador do JARVIS. Dado o pedido do usuário, gere um plano numerado de 1 a 15 passos em português brasileiro.

Regras:
- Cada passo é uma frase imperativa curta em pt-BR ("Listar arquivos", "Filtrar por extensão", "Mover para pasta").
- expectedOutcome é uma frase curta descrevendo o critério de sucesso ("14 arquivos listados", "5 PDFs filtrados").
- Se a tarefa é trivial (1 ação), gere apenas 1 passo.
- Se a tarefa é ambígua, gere o plano mais provável — não peça esclarecimento.
- NÃO inclua nomes de tools, NÃO inclua argumentos. O executor decide isso.
- IDs são inteiros positivos sequenciais (1, 2, 3...).
- Se a mensagem é conversacional (saudação, pergunta, comentário sem ação no PC), gere exatamente 1 passo: "Responder ao usuário" com expectedOutcome "Resposta entregue".`;

/**
 * Quick 260715-07o: providers cujo endpoint OpenAI-compatible rejeita o `tool_choice`
 * em formato objeto do método `functionCalling` default do `withStructuredOutput`
 * (confirmado via curl real contra LM Studio: HTTP 400 `Invalid tool_choice type`).
 * Para esses providers usamos o método `jsonSchema`, que envia
 * `response_format: { type: 'json_schema', ... }` — confirmado funcional.
 * NÃO incluir 'openrouter' aqui sem evidência de falha (Fase 92 já shipada/testada).
 */
const JSON_SCHEMA_STRUCTURED_OUTPUT_PROVIDERS = new Set(['lmstudio']);

export interface GeneratePlanOptions {
  /** Optional feedback string when re-prompting after user clicked "Editar" (D-07). */
  editFeedback?: string;
  /** Optional previous plan for context when re-prompting (D-07). */
  previousPlan?: Plan;
  /**
   * Quick 260715-07o: valor de `LLM_PROVIDER` (config.ts: 'lmstudio' | 'openai' |
   * 'anthropic' | 'gemini' | 'openrouter'). Quando `'lmstudio'`, força o método
   * `jsonSchema` no `withStructuredOutput` — ver JSON_SCHEMA_STRUCTURED_OUTPUT_PROVIDERS.
   */
  provider?: string;
}

/**
 * Generate a structured Plan using BaseChatModel.withStructuredOutput(planSchema).
 * Throws OutputParserException (or mock error) if LLM returns invalid schema — caller handles fallback.
 *
 * D-05: planSchema enforced by Zod via withStructuredOutput.
 * D-07: editFeedback builds a re-prompt including previous plan + user feedback.
 */
export async function generatePlan(
  llm: BaseChatModel,
  userInput: string,
  options: GeneratePlanOptions = {},
): Promise<Plan> {
  // Quick 260715-07o: provider-aware method — lmstudio needs jsonSchema (functionCalling
  // default sends tool_choice as an object, rejected by LM Studio with HTTP 400).
  // All other providers (or provider omitted) keep the original call — unchanged.
  const structured =
    options.provider && JSON_SCHEMA_STRUCTURED_OUTPUT_PROVIDERS.has(options.provider)
      ? llm.withStructuredOutput(planSchema, { method: 'jsonSchema' })
      : llm.withStructuredOutput(planSchema);

  let prompt = `${PLANNER_SYSTEM_PROMPT}\n\nPedido do usuário: ${userInput}`;
  if (options.editFeedback) {
    const previousPlanText = options.previousPlan
      ? `\n\nPlano anterior:\n${options.previousPlan.steps
          .map((s) => `${s.id}. ${s.description} (esperado: ${s.expectedOutcome})`)
          .join('\n')}`
      : '';
    prompt += `${previousPlanText}\n\nFeedback do usuário sobre o plano anterior: ${options.editFeedback}\nGere um plano novo levando esse feedback em conta.`;
  }

  // Throws OutputParserException if LLM returns invalid JSON / schema violation.
  // Caller (graph.ts plannerNode) catches and handles fallback.
  const result = await structured.invoke([new HumanMessage(prompt)]);
  return result as Plan;
}
