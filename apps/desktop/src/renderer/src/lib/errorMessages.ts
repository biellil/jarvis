/**
 * errorMessages — Plano 19_5-04
 *
 * Mapeia códigos de erro do backend/gateway pra mensagens pt-BR exibidas no Toast.
 * Função pura, sem side-effects, sem deps externas.
 */

const STATIC_MESSAGES: Record<string, string> = {
  EMPTY_AUDIO: 'Não recebi nenhum áudio. Tenta de novo.',
  NO_SPEECH: 'Não consegui ouvir sua mensagem. Fala mais perto do microfone?',
  STT_FAILED: 'Erro ao transcrever áudio. Tenta de novo.',
  LLM_FAILED: 'Erro ao processar sua mensagem.',
  TTS_FAILED: 'Resposta pronta, mas não consegui gerar o áudio.',
  NETWORK: 'Sem conexão com o servidor.',
  TIMEOUT: 'O servidor demorou pra responder. Tenta de novo.',
  NO_API_KEY: 'API key do JARVIS não configurada.',
  HTTP_429: 'JARVIS está ocupado. Aguarde um instante.',
  SESSION_BUSY: 'JARVIS está ocupado. Aguarde um instante.',
  SERVER_ERROR: 'Erro interno. Tenta de novo em alguns segundos.',
  NETWORK_ERROR: 'Sem conexão com o servidor.',
  UNKNOWN: 'Erro desconhecido.',
};

/**
 * Retorna uma mensagem pt-BR para o código. Usa `fallback` quando:
 * - o código não está na tabela E não bate com prefixo HTTP_;
 * - o código bate com HTTP_4xx (diferente de 429) — usamos a `message` do backend
 *   quando disponível, senão um default genérico.
 */
export function mapErrorCode(code: string, fallback?: string): string {
  const known = STATIC_MESSAGES[code];
  if (known) return known;

  if (code.startsWith('HTTP_5')) {
    return 'Erro interno. Tenta de novo em alguns segundos.';
  }

  if (code.startsWith('HTTP_4')) {
    return fallback ?? 'Requisição inválida.';
  }

  return fallback ?? 'Erro desconhecido.';
}

/**
 * TTS_FAILED é o único caso onde o backend ainda tem conteúdo útil
 * (a `message` textual) — mostramos aviso warning ao invés de erro hard.
 */
export function isRecoverableWithMessage(code: string): boolean {
  return code === 'TTS_FAILED';
}
