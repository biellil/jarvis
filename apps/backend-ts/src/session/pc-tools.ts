/**
 * PC Control Tools — Plan 18-01.
 *
 * 9 factories LangChain `tool()` que retornam payloads `{action, args}` espelhando
 * exatamente as equivalentes Python em `src/jarvis/tools/{apps,files,system}.py`.
 *
 * IMPORTANTE: as tools são PURAS — zero side effects. Nada de subprocess, fs ou
 * network. O executor real vive no cliente Electron (Fase 18.5), que lê o payload
 * via SSE e dispatcha a operação no SO.
 *
 * Cada tool usa `responseFormat: 'content_and_artifact'` e retorna
 * `[JSON.stringify(payload), payload]`. Isso dá ao middleware do plano 18-03
 * acesso ao payload estruturado como `artifact` sem precisar re-parsear a string.
 *
 * Paridade com Python é validada via snapshot tests contra
 * `test/fixtures/tools/<name>.json`, gerados rodando as tools Python.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

type PcToolPayload = {
  action: string;
  args: Record<string, unknown>;
  requires_confirmation?: boolean;
};

function buildResult(payload: PcToolPayload): [string, PcToolPayload] {
  return [JSON.stringify(payload), payload];
}

// ---------- apps ----------

export function createOpenAppTool() {
  return tool(
    async ({ app_name }: { app_name: string }) => {
      return buildResult({ action: 'open_app', args: { app: app_name } });
    },
    {
      name: 'open_app',
      description:
        'Abre um aplicativo pelo nome. Use quando o usuário pedir para abrir, iniciar ou lançar ' +
        'um aplicativo ou programa (ex: "abre o Firefox", "inicia o terminal").',
      schema: z.object({
        app_name: z
          .string()
          .describe('Nome do aplicativo a abrir (ex: "firefox", "gnome-terminal").'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createCloseAppTool() {
  return tool(
    async ({ app_name }: { app_name: string }) => {
      return buildResult({ action: 'close_app', args: { app: app_name } });
    },
    {
      name: 'close_app',
      description:
        'Fecha um aplicativo pelo nome. Use quando o usuário pedir para fechar, encerrar ou ' +
        'parar um aplicativo que está em execução.',
      schema: z.object({
        app_name: z
          .string()
          .describe('Nome do aplicativo a fechar (ex: "firefox", "vlc").'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

// ---------- files ----------

export function createListFilesTool() {
  return tool(
    async ({ directory }: { directory: string }) => {
      return buildResult({ action: 'list_files', args: { directory } });
    },
    {
      name: 'list_files',
      description:
        'Lista os arquivos de um diretório. Use quando o usuário pedir para ver, listar ou ' +
        'explorar o conteúdo de uma pasta.',
      schema: z.object({
        directory: z
          .string()
          .describe('Caminho absoluto ou relativo do diretório a listar.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createSearchFilesTool() {
  return tool(
    async ({ pattern, directory }: { pattern: string; directory: string }) => {
      return buildResult({
        action: 'search_files',
        args: { pattern, directory },
      });
    },
    {
      name: 'search_files',
      description:
        'Busca arquivos por padrão glob em um diretório. Use quando o usuário pedir para ' +
        'encontrar, buscar ou localizar arquivos por nome, extensão ou padrão (ex: "*.py").',
      schema: z.object({
        pattern: z
          .string()
          .describe('Padrão glob para busca (ex: "*.py", "relatorio*.txt").'),
        directory: z
          .string()
          .default('.')
          .describe('Diretório raiz da busca. Padrão: diretório atual.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createMoveFileTool() {
  return tool(
    async ({ source, destination }: { source: string; destination: string }) => {
      return buildResult({
        action: 'move_file',
        args: { source, destination },
      });
    },
    {
      name: 'move_file',
      description:
        'Move ou renomeia um arquivo. Use quando o usuário pedir para mover, renomear ou ' +
        'copiar um arquivo de um caminho para outro.',
      schema: z.object({
        source: z.string().describe('Caminho atual do arquivo (origem).'),
        destination: z.string().describe('Caminho de destino do arquivo.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createDeleteFileTool() {
  return tool(
    async ({ file_path }: { file_path: string }) => {
      return buildResult({
        action: 'delete_file',
        args: { path: file_path },
        requires_confirmation: true,
      });
    },
    {
      name: 'delete_file',
      description:
        'Deleta um arquivo permanentemente. ATENÇÃO: operação destrutiva — requer confirmação ' +
        'do usuário antes de executar. Use apenas quando o usuário confirmar explicitamente.',
      schema: z.object({
        file_path: z
          .string()
          .describe('Caminho absoluto ou relativo do arquivo a deletar.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

// ---------- system ----------

export function createSetVolumeTool() {
  return tool(
    async ({ level }: { level: number }) => {
      return buildResult({ action: 'set_volume', args: { level } });
    },
    {
      name: 'set_volume',
      description:
        'Define o volume do sistema. Use quando o usuário pedir para ajustar, aumentar, ' +
        'diminuir ou definir o volume.',
      schema: z.object({
        level: z.number().int().describe('Nível de volume de 0 a 100.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createSetBrightnessTool() {
  return tool(
    async ({ level }: { level: number }) => {
      return buildResult({ action: 'set_brightness', args: { level } });
    },
    {
      name: 'set_brightness',
      description:
        'Define o brilho da tela. Use quando o usuário pedir para ajustar, aumentar, ' +
        'diminuir ou definir o brilho da tela ou monitor.',
      schema: z.object({
        level: z.number().int().describe('Nível de brilho de 0 a 100.'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createListProcessesTool() {
  return tool(
    async (_: Record<string, never>) => {
      return buildResult({ action: 'list_processes', args: {} });
    },
    {
      name: 'list_processes',
      description:
        'Lista os processos em execução. Use quando o usuário pedir para ver, listar ou ' +
        'verificar quais programas ou processos estão rodando no sistema.',
      schema: z.object({}),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createAdjustVolumeTool() {
  return tool(
    async ({ delta }: { delta: number }) => {
      return buildResult({ action: 'adjust_volume', args: { delta } });
    },
    {
      name: 'adjust_volume',
      description:
        'Aumenta ou diminui o volume do sistema por um valor relativo (delta). Use quando o usuário pedir ' +
        'para aumentar ou diminuir o volume sem especificar um valor absoluto (ex: "aumenta o volume", ' +
        '"diminui um pouco", "aumenta bastante"). O LLM escolhe o delta: valores maiores (+20, +30) para ' +
        '"bastante", menores (+5, +10) para "um pouco". Use `set_volume` para comandos de nível absoluto.',
      schema: z.object({
        delta: z
          .number()
          .int()
          .min(-100)
          .max(100)
          .describe(
            'Variação de volume em pontos percentuais. Positivo = aumentar, negativo = diminuir. ' +
            'Exemplo: +15 para "aumenta bastante", -5 para "diminui um pouco". Intervalo: [-100, 100].',
          ),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createToggleMuteTool() {
  return tool(
    async (_: Record<string, never>) => {
      return buildResult({ action: 'toggle_mute', args: {} });
    },
    {
      name: 'toggle_mute',
      description:
        'Muta ou desmuta o volume do sistema. Use quando o usuário pedir para mutar, silenciar, ' +
        'tirar o mudo ou fazer unmute (ex: "muta o som", "silencia", "tira o mudo", "unmute").',
      schema: z.object({}),
      responseFormat: 'content_and_artifact',
    },
  );
}

export function createAllPcTools() {
  return [
    createOpenAppTool(),
    createCloseAppTool(),
    createListFilesTool(),
    createSearchFilesTool(),
    createMoveFileTool(),
    createDeleteFileTool(),
    createSetVolumeTool(),
    createSetBrightnessTool(),
    createListProcessesTool(),
  ];
}
