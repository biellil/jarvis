/**
 * request_file_action — Phase 55 LangGraph tool (LACT-01..05)
 *
 * Direct execution tool (like recall_memory, NOT payload-based like PC tools).
 * Per D-11: does not pass through wrapPcTool.
 * Per D-03: content flows Electron → gateway (WS ACK) → this tool → LLM.
 * Per D-09: fetches http://localhost:3000/internal/dispatch-action with 13s timeout.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const REQUEST_FILE_ACTION_DESCRIPTION =
  'Abre pastas ou arquivos no app padrão, fecha aplicativos por nome de processo, ou lê o conteúdo de arquivos texto (< 1MB) no chat. ' +
  'ATENÇÃO: fecha TODOS os processos com o nome especificado (limitação MVP). ' +
  'Requer confirmação do usuário via toast (timeout 10s = ação abortada silenciosamente). ' +
  'Paths devem estar dentro de: home, Downloads, Documents, Desktop.';

const requestFileActionSchema = z.object({
  action: z
    .enum(['openFolder', 'openFile', 'closeFile', 'viewContent'])
    .describe(
      'Tipo de ação: openFolder (abrir pasta), openFile (abrir arquivo no app padrão), ' +
        'closeFile (fechar app por nome de processo, ex: notepad.exe), ' +
        'viewContent (ler conteúdo de arquivo texto < 1MB)',
    ),
  path: z
    .string()
    .describe(
      'Para openFolder/openFile/viewContent: path absoluto do arquivo ou pasta (deve estar em ~/Downloads, ~/Documents, ~/Desktop ou home). ' +
        'Para closeFile: nome do processo a matar (ex: notepad.exe, code, chrome).',
    ),
});

interface DispatchResult {
  status: 'confirmed' | 'denied' | 'timeout';
  content?: string;
}

function getGatewayHttpUrl(): string {
  const raw = process.env['GATEWAY_URL'] ?? 'http://localhost:3000';
  // Normalize ws:// → http:// if env var uses WebSocket scheme
  return raw.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
}

export function createRequestFileActionTool(clientId: string) {
  const gatewayUrl = getGatewayHttpUrl();

  return tool(
    async ({ action, path }: { action: string; path: string }): Promise<string> => {
      try {
        const response = await fetch(`${gatewayUrl}/internal/dispatch-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, action, path, model: 'unknown' }),
          signal: AbortSignal.timeout(13_000), // 1s margin above sendActionRequest 12s
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          return `Erro ao executar ação: ${(err as { error?: string }).error ?? 'erro desconhecido'}`;
        }

        const result = (await response.json()) as DispatchResult;

        if (result.status === 'confirmed') {
          if (result.content) {
            return `Arquivo lido. Conteúdo:\n${result.content}`;
          }
          return 'Ação confirmada e executada.';
        }
        if (result.status === 'denied') {
          return `Ação negada: ${result.content ?? 'usuário recusou ou execução falhou'}`;
        }
        return 'Ação timeout — sem resposta do usuário.';
      } catch (err) {
        return `Erro ao executar ação: ${(err as Error).message}`;
      }
    },
    {
      name: 'request_file_action',
      description: REQUEST_FILE_ACTION_DESCRIPTION,
      schema: requestFileActionSchema,
    },
  );
}
