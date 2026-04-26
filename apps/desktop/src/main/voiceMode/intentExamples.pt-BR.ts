/**
 * intentExamples.pt-BR.ts — Few-shot examples pt-BR para intent classifier (D-06, VLISTEN-02).
 *
 * 15 positivos (comandos/perguntas que JARVIS deve processar) +
 * 10 negativos (ruído ambiente, filler words, conversas casuais descartáveis).
 *
 * Rationale de seleção (Claude's Discretion — D-06):
 *   - Positivos cobrem: comandos curtos (abre/fecha/liga), perguntas WH (qual/como/quando),
 *     confirmações com contexto (oi JARVIS + intent), pedidos de ação complexos
 *   - Negativos cobrem: filler words universais (uh/hmm), confirmações sem intent (tá bom/sim),
 *     fragmentos de frase, conversas que não pedem ação do JARVIS
 *
 * Embeddings desses exemplos são pré-computados em build time pelo IntentClassifier
 * (cache na primeira invocação de load()) — não recomputados a cada classify().
 *
 * @see .planning/phases/40-always-listening-intent-classifier/40-CONTEXT.md D-06
 * @see .planning/phases/40-always-listening-intent-classifier/40-RESEARCH.md §Pitfall 5
 */
export const INTENT_EXAMPLES_PT_BR = {
  positive: [
    'abre o terminal',
    'abre o navegador',
    'fecha essa janela',
    'qual a hora agora',
    'como tá o tempo hoje',
    'liga a música',
    'pausa a música',
    'próxima música',
    'reproduz a playlist do trabalho',
    'aumenta o volume',
    'diminui o volume',
    'qual é a previsão do tempo para amanhã',
    'me faz um resumo do dia',
    'ei JARVIS preciso de ajuda',
    'oi JARVIS qual a data de hoje',
  ],
  negative: [
    'uh',
    'hmm',
    'deixa aí',
    'tá bom',
    'é isso aí',
    'então tá',
    'ah tá',
    'sei lá',
    'vamos ver',
    'hm hm',
  ],
} as const;
