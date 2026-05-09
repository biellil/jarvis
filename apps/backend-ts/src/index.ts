import { createApp } from "./app.js";
import { config } from "./config.js";
import { loadConfig } from "./llm/config.js";
import { createLLM } from "./llm/factory.js";
import { validateLangChainVersions } from "./llm/version-check.js";
import { detectCapabilities, formatCapabilities } from "./llm/capabilities.js";
import { runMigrations } from "./memory/migrate.js";
import { MemoryManager } from "./memory/manager.js";
import { validateMemoryConsistency } from "./memory/consistency.js";
import { ChatSession } from "./session/chat-session.js";
import { SessionLock } from "./session/lock.js";
import { mcpManager } from "./mcp/client/manager.js";
import { NATIVE_TOOL_NAMES } from "./session/native-tool-names.js";
import { startEnvWatcher } from "./config/env-watcher.js";

async function main() {
  // Step 1: Load and validate LLM config
  console.log('Loading configuration...');
  const llmConfig = loadConfig();  // Exits with code 1 if invalid

  // Step 2: Validate LangChain.js package versions (per D-15)
  console.log('Validating LangChain.js versions...');
  const versionCheck = await validateLangChainVersions();
  if (!versionCheck.valid) {
    console.error('❌ LangChain.js version mismatch detected:');
    console.error(versionCheck.message);
    if (versionCheck.packages) {
      console.error('Installed versions:', versionCheck.packages);
    }
    process.exit(1);  // Fail startup on version mismatch (per D-16)
  }
  console.log('✅', versionCheck.message);

  // Step 3: Detect provider capabilities (non-fatal per D-13)
  let capabilities: Awaited<ReturnType<typeof detectCapabilities>> = {};
  try {
    capabilities = await detectCapabilities(llmConfig);
    console.log(formatCapabilities(capabilities));
  } catch (error) {
    console.warn('⚠️ Capability detection failed:', (error as Error).message);
    // Continue startup - this is non-fatal (capabilities stays empty {})
  }

  // Step 4: Run database migrations
  console.log('Running database migrations...');
  runMigrations();
  console.log('✅ Migrations applied');

  // Step 5: Bootstrap ChatSession (LLM + MemoryManager + ReAct agent)
  console.log('Bootstrapping ChatSession...');
  const llm = createLLM();
  const memory = new MemoryManager({ llm });  // Phase 36: required for background memory extraction

  // Quick task 260427-v3j: health check explícito do ChromaDB no boot.
  // Falha é loud-warned mas NÃO fatal — JARVIS opera em modo degradado sem memória vetorial.
  try {
    await memory.vectors.init();
    console.log('✅ ChromaDB connected');
  } catch (err) {
    console.error(`❌ ChromaDB unreachable: ${(err as Error).message}`);
    console.error('   Memory persistence will fail silently per-turn until Chroma is reachable.');
    console.error(`   Check: CHROMA_HOST=${process.env.CHROMA_HOST ?? 'unset'} CHROMA_PORT=${process.env.CHROMA_PORT ?? 'unset'}`);
  }

  // Phase 65 (MCP-CLI-01): bootstrap external MCP client BEFORE ChatSession.create()
  // so its tools appear in the initial allTools snapshot. NATIVE_TOOL_NAMES is the
  // single source of truth shared with /internal/mcp-client/reload (Plan 03 Task 2).
  // Boot ToolLogger early to share with manager + session. ChatSession.create()
  // accepts the same instance via opts.toolLogger.
  const { ToolLogger } = await import("./memory/store.js");
  const toolLogger = new ToolLogger();
  try {
    await mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger);
  } catch (err) {
    // mcpManager.reload never throws by design, but defensive:
    console.error('[mcp-client] unexpected error during boot:', (err as Error).message);
  }

  // Phase 65 (MCP-CLI-01 D-09): hot-reload watcher for .env and .env.local.
  // Watcher mutates process.env in-place when MCP_SERVER_* changes, then triggers reload.
  // Lives for the process lifetime — no need to capture the stop function.
  startEnvWatcher(async () => {
    await mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger);
    console.log('[mcp-client] reloaded after .env change — new tools active in next ChatSession (D-11)');
  });

  const session = await ChatSession.create({
    llm,
    memory,
    toolLogger,
    capabilities,
    activeProvider: llmConfig.LLM_PROVIDER,
  });
  const lock = new SessionLock();
  console.log('✅ ChatSession ready');

  // Step 6: Start Express server
  const app = createApp({ session, lock, toolLogger: session.toolLogger });
  app.listen(config.backendPort, () => {
    console.log(`🚀 Backend-TS listening on port ${config.backendPort}`);
    console.log(`   Health check: http://localhost:${config.backendPort}/health`);
    console.log(`   LLM Provider: ${llmConfig.LLM_PROVIDER}`);
    console.log(`🛠️  Debug routes registered at /debug/*`);
    void validateMemoryConsistency(memory.store, memory.vectors).catch(() => {});
  });
}

main().catch(error => {
  console.error('Startup failed:', error);
  process.exit(1);
});
