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
  try {
    const capabilities = await detectCapabilities(llmConfig);
    console.log(formatCapabilities(capabilities));
  } catch (error) {
    console.warn('⚠️ Capability detection failed:', (error as Error).message);
    // Continue startup - this is non-fatal
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

  const session = await ChatSession.create({ llm, memory });
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
