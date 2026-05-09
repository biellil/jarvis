/**
 * Phase 65 (MCP-CLI-02, MCP-CLI-03) — Adapter from MCP tool definitions to LangChain tools.
 *
 * Decisions implemented:
 *   D-05: Prefix tool names with MCP_SERVER_NAME (`${serverName}.${name}`)
 *   D-06: Native tool names always win — collisions skip the external tool with warn log
 *   D-07: Description annotated `[via ${serverName}] ${original}`
 *   D-15: Audit via ToolLogger.logDispatch with `{source: 'mcp-external', serverName}`
 *   D-16: Failures return structured pt-BR error string for the LLM to narrate
 *   D-17: 30s tool timeout via Promise.race
 */
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { jsonSchemaToZod } from '@n8n/json-schema-to-zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolLogger } from '../../memory/store.js';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

/** D-17: hardcoded 30s; if it ever needs to be tunable, becomes MCP_TOOL_TIMEOUT_MS env var. */
export const TOOL_TIMEOUT_MS = 30_000;

/**
 * Convert one MCP tool definition into a LangChain StructuredToolInterface.
 * Returns null when the prefixed name (or the raw name, defensively) collides
 * with a native JARVIS tool — collision is logged once and the tool is skipped.
 */
export function buildLangChainTool(
  def: McpToolDef,
  serverName: string,
  client: Client,
  nativeToolNames: ReadonlySet<string>,
  logger: ToolLogger,
): StructuredToolInterface | null {
  const safeServer = serverName.trim() || 'mcp';
  const prefixedName = `${safeServer}.${def.name}`;

  // D-06: native always wins — check both prefixed and raw forms (defensive)
  if (nativeToolNames.has(prefixedName) || nativeToolNames.has(def.name)) {
    console.warn(
      `[mcp-client] tool ${prefixedName} conflicts with native tool — skipped`,
    );
    return null;
  }

  // D-07: annotate description with origin
  const annotatedDescription = `[via ${safeServer}] ${def.description ?? def.name}`;

  // Runtime JSON Schema → Zod (see Pitfall: upstream json-schema-to-zod is codegen-only)
  // Cast: McpToolDef.inputSchema é JSON-Schema-shaped, mas o tipo recursivo do
  // @n8n/json-schema-to-zod (JsonSchemaObject) não é compatível structural com
  // Record<string, unknown>. Cast intencional — schema vem de servidor externo.
  const zodSchema = jsonSchemaToZod(def.inputSchema as Parameters<typeof jsonSchemaToZod>[0]);

  const wrapped = tool(
    async (input: Record<string, unknown>) => {
      // D-17: 30s timeout via Promise.race
      try {
        const callPromise = client.callTool({ name: def.name, arguments: input });
        const timeoutPromise = new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error(`MCP tool timeout after ${TOOL_TIMEOUT_MS}ms`)),
            TOOL_TIMEOUT_MS,
          ),
        );
        const result = (await Promise.race([callPromise, timeoutPromise])) as {
          content: Array<{ type: 'text'; text: string }>;
          isError?: boolean;
        };

        // D-15: audit on success path
        logger.logDispatch(prefixedName, input, {
          source: 'mcp-external',
          serverName: safeServer,
        });

        const textContent = (result.content ?? [])
          .map((c) => c.text)
          .join('\n');

        // result.isError true: the SERVER signalled error but it's a normal protocol response.
        // Return text as-is so the LLM can narrate (D-16 protocol — server-side error already in pt-BR or English).
        return textContent;
      } catch (err) {
        const msg = (err as Error).message;
        // D-15: audit on error path
        logger.logDispatch(prefixedName, input, {
          source: 'mcp-external',
          serverName: safeServer,
          error: msg,
        });
        // D-16: pt-BR structured error for the LLM
        return `MCP server ${safeServer} indisponível — tool ${def.name} não pôde executar agora (${msg})`;
      }
    },
    {
      name: prefixedName,
      description: annotatedDescription,
      // Zod schema runtime instance from @n8n/json-schema-to-zod
      schema: zodSchema,
    },
  );

  return wrapped as unknown as StructuredToolInterface;
}
