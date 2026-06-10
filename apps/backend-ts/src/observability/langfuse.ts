/**
 * Langfuse observability — Phase 83.
 *
 * Uses langfuse HTTP SDK (not @langfuse/langchain OTEL) because Langfuse v2
 * does not expose an OTLP endpoint. The HTTP SDK works with both v2 and v3.
 *
 * createLangfuseHandle: factory that returns a per-request trace handle when
 * LANGFUSE_ENABLED=true + keys present, or null otherwise (zero overhead).
 */
import { config } from "../config.js";
import type { LangfuseGenerationClient } from "langfuse";

export interface LangfuseHandlerOptions {
  /** LangGraph task ID — used as Langfuse sessionId (one trace per task). */
  taskId?: string;
  /** User identifier for trace ownership in Langfuse UI. */
  userId?: string;
  /** User message that triggered the task — set as generation input. */
  input?: string;
}

export interface LangfuseHandle {
  /** The generation span — call end() when stream completes. */
  generation: LangfuseGenerationClient;
  /** Flush pending events to Langfuse server. */
  flush(): Promise<void>;
}

// Module-level singleton client — reused across requests to share the flush queue.
let _client: import("langfuse").Langfuse | null = null;

async function getClient(): Promise<import("langfuse").Langfuse> {
  if (!_client) {
    const { Langfuse } = await import("langfuse");
    _client = new Langfuse({
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
      baseUrl: config.langfuseHost,
      flushAt: 1,
    });
  }
  return _client;
}

/**
 * Returns a per-request LangfuseHandle or null if Langfuse is disabled.
 *
 * Usage in route handlers:
 *   const handle = await createLangfuseHandle({ taskId, input: message });
 *   // ... run graph.stream() without callbacks ...
 *   handle?.generation.end({ output: finalResponse });
 *   await handle?.flush();
 */
export async function createLangfuseHandle(
  options: LangfuseHandlerOptions = {},
): Promise<LangfuseHandle | null> {
  if (!config.langfuseEnabled) return null;

  if (!config.langfusePublicKey || !config.langfuseSecretKey) {
    console.warn(
      "[langfuse] LANGFUSE_ENABLED=true but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is missing — disabling observability",
    );
    return null;
  }

  const client = await getClient();

  const trace = client.trace({
    name: "agentic-task",
    sessionId: options.taskId ?? "default-session",
    userId: options.userId,
    tags: ["backend-ts", "agentic-task"],
    input: options.input,
  });

  const generation = trace.generation({
    name: "langgraph-stream",
    input: options.input,
  });

  return {
    generation,
    flush: () => client.flushAsync(),
  };
}

// Keep old export name as alias so existing imports still compile.
export const createLangfuseHandler = createLangfuseHandle;
