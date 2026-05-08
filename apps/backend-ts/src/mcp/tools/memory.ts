// Phase 64 — MCP recall_memory tool wrapper (MCP-SRV-02, D-03, D-07)
// Delegates to existing createRecallMemoryTool() — no business logic duplication.
// CRITICAL: never use console.log() — corrupts stdio JSON-RPC (D-04).
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRecallMemoryTool } from '../../session/tools.js';
import type { MemoryManager } from '../../memory/index.js';

const EMPTY_FALLBACK = 'Nenhuma memória relevante encontrada.';

const recallInputSchema = z.object({
  query: z.string().describe('Termos de busca em linguagem natural para encontrar memórias relevantes.'),
});

export function registerMemoryTools(server: McpServer, memory: MemoryManager): void {
  const langchainTool = createRecallMemoryTool(memory);

  server.tool(
    'recall_memory',
    {
      description: 'Busca memórias relevantes de conversas passadas e fatos do perfil do usuário. Use quando precisar lembrar algo que o usuário disse antes ou referenciar preferências dele.',
      inputSchema: recallInputSchema,
    },
    async ({ query }: { query: string }) => {
      try {
        const result = await langchainTool.invoke({ query });
        const text = result === '' ? EMPTY_FALLBACK : result;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        console.error('[MCP] recall_memory error:', err);
        return {
          content: [{ type: 'text' as const, text: `Erro ao buscar memórias: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
