/**
 * analyze_screen LangGraph tool — Phase 63 Vision Pipeline (VISION-01)
 *
 * D-03: Returns a content block array with image_url (responseFormat: 'content')
 *       so OpenAI/Anthropic/Gemini receive the screenshot as a vision input, not
 *       as a plain base64 text string. Without this, the base64 data URL lands in a
 *       ToolMessage as text and costs ~250k tokens — blowing the context window.
 *
 * detail: 'low' — OpenAI scales to 512×512, fixed cost of 85 tokens regardless of
 * original image size. Sufficient for screen content analysis.
 *
 * D-02: If hasVisionFn() returns false, return text error immediately.
 *
 * Pattern follows request-file-action.ts — injectable callback, no direct IPC.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/** Function signature for capturing the screen (injected from Electron main via bridge). */
export type CaptureScreenFn = () => Promise<
  | { success: true; base64: string }
  | { success: false; error: string }
>;

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' | 'auto' } };

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
    async (_args: Record<string, never>): Promise<ContentBlock[]> => {
      if (!hasVisionFn()) {
        return [{ type: 'text', text: 'Este provider não suporta análise de imagens. Configure OpenAI, Anthropic ou Gemini nas Settings.' }];
      }

      let result: Awaited<ReturnType<CaptureScreenFn>>;
      try {
        result = await captureFn();
      } catch (err) {
        return [{ type: 'text', text: `Erro ao capturar a tela: ${(err as Error).message}` }];
      }

      if (!result.success) {
        if (result.error === 'PERMISSION_DENIED') {
          return [{ type: 'text', text: 'Não foi possível capturar a tela. No macOS, verifique as permissões de gravação de tela em Configurações do Sistema → Privacidade e Segurança → Gravação de Tela.' }];
        }
        return [{ type: 'text', text: `Erro ao capturar a tela: ${result.error}` }];
      }

      // Return as image_url content block — LLM receives as vision input (not text tokens)
      // detail: 'low' = 85 tokens fixed (OpenAI), vs ~250k tokens as plain base64 string
      return [
        { type: 'image_url', image_url: { url: result.base64, detail: 'low' } },
      ];
    },
    {
      name: 'analyze_screen',
      description:
        'Captura a tela do usuário e retorna a imagem para análise visual. Use quando o usuário perguntar o que está na tela, pedir para analisar o conteúdo da tela, ou precisar de ajuda com algo visível no monitor.',
      schema: z.object({}),
      responseFormat: 'content',
    },
  );
}
