/**
 * Phase 65 (MCP-CLI-02, MCP-CLI-03) — Adapter from MCP tool definitions to LangChain tools.
 *
 * Decisions implemented:
 *   D-05: Prefix tool names with MCP_SERVER_NAME (`${serverName}.${name}`)
 *   D-06: Native tool names always win — collisions skip the external tool with warn log
 *   D-07: Description annotated `[via ${serverName}] ${original}`
 *   D-15: Audit via ToolLogger.logDispatch with `{source: 'mcp-external', serverName}`
 *   D-16: Failures return structured pt-BR error string for the LLM to narrate
 *   D-17 (Phase 65): 30s tool timeout — now via native AbortSignal (Phase 66 upgrade)
 *   D-17 (Phase 66): ADDITIVE taskContext audit field when running inside an agentic task
 */
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { jsonSchemaToZod } from '@n8n/json-schema-to-zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolLogger } from '../../memory/store.js';
import type { DispatchContext } from '../../session/tool-dispatch.js';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

/** D-17 (Phase 65): hardcoded 30s; if it ever needs to be tunable, becomes MCP_TOOL_TIMEOUT_MS env var. */
export const TOOL_TIMEOUT_MS = 30_000;

/**
 * Convert one MCP tool definition into a LangChain StructuredToolInterface.
 * Returns null when the prefixed name (or the raw name, defensively) collides
 * with a native JARVIS tool — collision is logged once and the tool is skipped.
 *
 * Phase 66: optional `ctx` parameter adds AbortSignal threading (D-13) and
 * ADDITIVE taskContext audit enrichment (D-17). Backwards-compatible: omitting
 * ctx preserves Phase 65 behaviour exactly.
 */
export function buildLangChainTool(
  def: McpToolDef,
  serverName: string,
  client: Client,
  nativeToolNames: ReadonlySet<string>,
  logger: ToolLogger,
  ctx?: DispatchContext,
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
    async (input: Record<string, unknown>, runConfig?: unknown) => {
      // Phase 66 D-13: compose outer signal (from runConfig or DispatchContext) with inner timeout.
      // Falls back to inner-only timeout when no outer signal is available (backwards compat).
      const outerSignal =
        (runConfig as { signal?: AbortSignal } | undefined)?.signal ??
        ctx?.getSignal() ??
        null;
      const inner = AbortSignal.timeout(TOOL_TIMEOUT_MS);
      const signal = outerSignal ? AbortSignal.any([inner, outerSignal]) : inner;

      try {
        // Phase 66: use native signal option instead of Promise.race.
        // client.callTool supports { signal, timeout } per @modelcontextprotocol/sdk 1.29.0.
        const result = (await client.callTool(
          { name: def.name, arguments: input },
          undefined, // result schema (not needed)
          { signal, timeout: TOOL_TIMEOUT_MS },
        )) as {
          content: Array<{ type: 'text'; text: string }>;
          isError?: boolean;
        };

        // D-15 (Phase 65): audit on success path — source: 'mcp-external' PRESERVED.
        // D-17 (Phase 66): ADDITIVE taskContext when running inside a task. The source
        // field is NEVER replaced: Phase 65 audit consumers filtering by
        // source === 'mcp-external' MUST still see this row even when nested in a task.
        const taskMeta = ctx?.getTaskMeta?.();
        const extras: Record<string, unknown> = {
          source: 'mcp-external',   // Phase 65 D-15 — DO NOT change.
          serverName: safeServer,   // Phase 65 D-15 — DO NOT rename.
        };
        if (taskMeta) {
          extras.taskContext = {
            taskId: taskMeta.taskId,
            stepId: taskMeta.stepId,
            executor: 'agentic-task',
          };
        }
        logger.logDispatch(prefixedName, input, extras);

        const textContent = (result.content ?? [])
          .map((c) => c.text)
          .join('\n');

        // result.isError true: the SERVER signalled error but it's a normal protocol response.
        // Return text as-is so the LLM can narrate (D-16 protocol — server-side error already in pt-BR or English).
        return textContent;
      } catch (err) {
        const error = err as Error;

        // Phase 66 D-13: AbortError means cancellation — return clean pt-BR message to LLM.
        // Cancellation is NOT an error; throwing would make LLM retry. Return string instead.
        if (error.name === 'AbortError' || signal.aborted) {
          return `Tool ${def.name} cancelado pelo usuário.`;
        }

        const msg = error.message;
        // D-15 (Phase 65): audit on error path — source preserved
        const taskMeta = ctx?.getTaskMeta?.();
        const errorExtras: Record<string, unknown> = {
          source: 'mcp-external',
          serverName: safeServer,
          error: msg,
        };
        if (taskMeta) {
          errorExtras.taskContext = {
            taskId: taskMeta.taskId,
            stepId: taskMeta.stepId,
            executor: 'agentic-task',
          };
        }
        logger.logDispatch(prefixedName, input, errorExtras);
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
