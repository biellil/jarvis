/**
 * Langfuse observability — Phase 83.
 *
 * createLangfuseHandler: factory that returns a per-request CallbackHandler when
 * LANGFUSE_ENABLED=true + keys present, or null otherwise (zero overhead).
 *
 * Design rules:
 *   - Handler is per-request (never singleton) — avoids context leakage between
 *     concurrent requests (see RESEARCH.md Pitfall 2).
 *   - Config is read from config.ts (never hardcoded baseUrl).
 *   - flushAsync() is the caller's responsibility (see chat.ts / tasks.ts integration).
 *   - If LANGFUSE_ENABLED=false, this module does NOT import @langfuse/langchain at
 *     module level — the dynamic import keeps the disabled path at zero cost.
 */
import { config } from "../config.js";

export interface LangfuseHandlerOptions {
  /** LangGraph task ID — used as Langfuse sessionId (one trace per task). */
  taskId?: string;
  /** User identifier for trace ownership in Langfuse UI. */
  userId?: string;
}

/**
 * Returns a new CallbackHandler instance per request, or null if Langfuse is
 * disabled or misconfigured.
 *
 * Callers inject the returned handler into graph.stream() callbacks:
 *   callbacks: langfuseHandler ? [langfuseHandler] : []
 *
 * After stream completes, callers MUST call:
 *   if (langfuseHandler) await langfuseHandler.flushAsync?.();
 */
export async function createLangfuseHandler(
  options: LangfuseHandlerOptions = {},
): Promise<import("@langfuse/langchain").CallbackHandler | null> {
  if (!config.langfuseEnabled) return null;

  if (!config.langfusePublicKey || !config.langfuseSecretKey) {
    console.warn(
      "[langfuse] LANGFUSE_ENABLED=true but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is missing — disabling observability",
    );
    return null;
  }

  // Dynamic import: only runs when Langfuse is enabled — zero cost on disabled path.
  const { CallbackHandler } = await import("@langfuse/langchain");

  // @langfuse/langchain 5.x reads credentials from env vars (LANGFUSE_PUBLIC_KEY,
  // LANGFUSE_SECRET_KEY, LANGFUSE_BASEURL) — constructor only accepts trace metadata.
  return new CallbackHandler({
    sessionId: options.taskId ?? "default-session",
    userId: options.userId ?? "anonymous",
    tags: ["backend-ts", "agentic-task"],
  });
}
