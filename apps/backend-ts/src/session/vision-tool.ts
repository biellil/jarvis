/**
 * analyze_screen LangGraph tool — Phase 63 Vision Pipeline (VISION-01)
 *
 * D-03: New LangGraph tool; calls captureFn (injected callback) to capture
 *       screen via Electron IPC; returns data URL as tool observation string.
 *
 * IMPORTANT: Returns the data URL as a plain string (not an object).
 * Reason: LangGraph tool() expects string return unless responseFormat:
 * 'content_and_artifact'. Returning an object would serialize as "[object Object]".
 *
 * D-02: If hasVisionFn() returns false, return Portuguese error message immediately.
 *       Do NOT call captureFn when vision is unsupported.
 *
 * Pattern follows request-file-action.ts — injectable callback, no direct IPC.
 * The captureFn is provided by the main process via the gateway HTTP bridge.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/** Function signature for capturing the screen (injected from Electron main via bridge). */
export type CaptureScreenFn = () => Promise<
  | { success: true; base64: string }
  | { success: false; error: string }
>;

/**
 * createAnalyzeScreenTool — factory for the analyze_screen LangGraph tool.
 *
 * @param captureFn - Async function that calls Electron CAPTURE_SCREEN IPC and returns result
 * @param hasVisionFn - Called at tool invocation time (not cached) to check current provider
 */
export function createAnalyzeScreenTool(
  captureFn: CaptureScreenFn,
  hasVisionFn: () => boolean,
) {
  return tool(
    async (_args: Record<string, never>): Promise<string> => {
      // D-02: Check vision support at call time (live check, not cached at session creation)
      if (!hasVisionFn()) {
        return 'Este provider não suporta análise de imagens. Configure OpenAI, Anthropic ou Gemini nas Settings.';
      }

      let result: Awaited<ReturnType<CaptureScreenFn>>;
      try {
        result = await captureFn();
      } catch (err) {
        return `Erro ao capturar a tela: ${(err as Error).message}`;
      }

      if (!result.success) {
        if (result.error === 'PERMISSION_DENIED') {
          return 'Não foi possível capturar a tela. No macOS, verifique as permissões de gravação de tela em Configurações do Sistema → Privacidade e Segurança → Gravação de Tela.';
        }
        return `Erro ao capturar a tela: ${result.error}`;
      }

      // Return data URL as plain string — LLM receives it as ToolMessage content
      // LangChain routes image content in tool observations to provider vision API
      return result.base64;
    },
    {
      name: 'analyze_screen',
      description:
        'Captura a tela do usuário e retorna a imagem para análise visual. Use quando o usuário perguntar o que está na tela, pedir para analisar o conteúdo da tela, ou precisar de ajuda com algo visível no monitor.',
      schema: z.object({}),
    },
  );
}
