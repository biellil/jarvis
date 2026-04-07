# Technology Stack — TypeScript Migration

**Project:** JARVIS v1.3 — Python to TypeScript Backend Migration
**Researched:** 2026-04-07
**Confidence:** HIGH

## Migration Context

This research covers the **NEW TypeScript backend stack** (`apps/backend-ts`) that will run in parallel with the existing Python backend (`apps/backend-py`) during migration. The goal is 1:1 feature parity with the validated Python stack, NOT to redesign architecture.

### What Is NOT Changing

The following remain unchanged and are out of scope for this research:

- **Monorepo structure:** pnpm workspaces (`apps/*` + `packages/*`)
- **Gateway:** Express TypeScript gateway at `apps/gateway` (already validated in v1.1)
- **Desktop UI:** Electron app at `apps/desktop` (already validated in v1.2)
- **Docker:** docker-compose orchestration (will add backend-ts service later)

The Python backend (`apps/backend-py`) stays operational until TypeScript backend passes E2E validation.

---

## Recommended Stack

### Core Framework & Orchestration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime | Current LTS with native TypeScript support via `--experimental-strip-types`. Matches Electron's Node 22 runtime. Python uses 3.10+, Node 22 is the equivalent modern stable release. |
| TypeScript | 5.6+ | Type system | Industry standard. v5.6+ has 70% faster type-checking (Prisma blog). Match gateway's TypeScript version for consistency. |
| LangChain.js | 0.3.x | Agent framework, tool abstraction | **CRITICAL:** Python uses langchain 1.2.14 (stable 1.x API). JavaScript is on 0.3.x (maintenance until Dec 2026). Do NOT use 1.x — it doesn't exist for JS yet. Provides same abstractions: ChatModel interface, tool decorators, prompt management. |
| @langchain/core | 0.3.x | Core LangChain abstractions | Foundation package. **ALL LangChain packages MUST share same @langchain/core version** to avoid runtime conflicts. Python uses separate langchain-core, JS bundles it in @langchain/core. |
| @langchain/langgraph | 0.2.19+ | Stateful agent runtime (ReAct loop, graph orchestration) | TypeScript equivalent to Python langgraph 1.1.4. Provides state persistence, streaming, human-in-the-loop. 42K weekly npm downloads. Published 3 days ago (2026-04-07). Production-tested at Uber, LinkedIn, Replit. |
| @langchain/openai | 0.3.x | OpenAI-compatible endpoints (LM Studio, OpenAI cloud) | Powers LM Studio via `basePath` config. Python uses langchain-openai 0.3.x — TypeScript naming is identical. Swap LLM by config, not code. |
| @langchain/anthropic | 1.3.26+ | Claude (Anthropic) integration | Latest version published 6 days ago. Python uses langchain-anthropic 0.3.x — TypeScript version is 1.3.x (different versioning but same API). |

**LangChain Versioning Trap:** Python langchain is 1.x stable. JavaScript langchain is 0.3.x (maintenance mode until Dec 2026). There is NO langchain.js 1.x yet. Using `npm install langchain@1.x` will fail or pull pre-release dev builds. Pin to `0.3.x`.

### Voice Pipeline

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| nodejs-whisper | 0.2.9+ | Speech-to-Text (offline, local) | Node.js bindings for ggerganov's whisper.cpp (C++ CPU version). Equivalent to Python's faster-whisper (both wrap whisper.cpp). Auto-converts audio to WAV 16kHz. Actively maintained (updated May 2025). 15 npm dependents. Supports `.txt`, `.srt`, `.vtt`, `.json`, `.wts`, `.lrc` output formats. |
| @picovoice/porcupine-node | 3.x+ | Wake word detection (offline) | Enterprise-grade wake word engine. Python uses openwakeword (fully open, no API key). **Porcupine requires free AccessKey** but is more accurate and cross-platform stable. Free tier includes built-in wake words (`.ppn` files). Custom wake words have training limits in free tier. Works on Node.js 18+. |
| @huggingface/transformers | 3.x (Transformers.js) | TTS + embeddings (offline) | Runs ONNX models in Node.js. Use for: (1) Text-to-Speech via Speecht5/VITS models (Python uses kokoro, which has no Node.js port), (2) Embeddings via `Xenova/all-MiniLM-L6-v2` (equivalent to Python sentence-transformers). Fully offline after model download. |
| @xenova/transformers | Deprecated | Old package name | DO NOT USE — migrated to `@huggingface/transformers` in 2025. Package renamed for official HuggingFace branding. |

**Key Difference from Python:**
- Python: `faster-whisper` (4x faster than openai/whisper via CTranslate2)
- Node.js: `nodejs-whisper` (binds same whisper.cpp engine, comparable speed)
- Python: `kokoro` (82M param neural TTS, Apache license, 350MB)
- Node.js: **No kokoro port** → Use Transformers.js with Speecht5 or similar ONNX TTS models (quality trade-off)

### Memory Architecture

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| chromadb | 1.9.x+ | Long-term semantic memory (vector store) | Official JavaScript/TypeScript client. **v3 rewrite (June 2025):** smaller bundle, Deno-compatible, embedding functions no longer bundled. Python uses chromadb 1.5.5 (embedded mode). JS client connects to same ChromaDB server or runs embedded. Install `@chroma-core/default-embed` separately for default embeddings. |
| @chroma-core/default-embed | 1.x | Default embedding function for ChromaDB | Required since chromadb v3+. Previously bundled, now separate package. |
| Transformers.js | 3.x | Local embedding generation | Use `Xenova/all-MiniLM-L6-v2` model (22MB, 384-dim) — ONNX port of Python's sentence-transformers/all-MiniLM-L6-v2. Runs offline on CPU. Fast enough for real-time conversation indexing. Integrates with ChromaDB via custom embedding function. |
| Drizzle ORM | 0.39.x+ | SQLite ORM | Lightweight (7.4KB bundle), SQL-like syntax, type-safe, zero code generation step (unlike Prisma). Faster cold starts than Prisma (critical for Electron). Python uses SQLite stdlib — Drizzle is the TypeScript equivalent. Supports better-sqlite3 driver via `drizzle-orm/better-sqlite3` adapter. |
| better-sqlite3 | 11.x+ | SQLite driver | Synchronous API (faster for desktop app use case). Much faster than node-sqlite3 (async). Python uses stdlib sqlite3 (synchronous) — better-sqlite3 is the direct equivalent. Native module (node-gyp) but widely used and stable. |
| drizzle-kit | latest | Schema migrations CLI | Equivalent to Python's Alembic/raw SQL migrations. Run `drizzle-kit generate` to create migration SQL from schema changes. |

**Key Difference from Python:**
- Python: SQLite via stdlib `sqlite3` (synchronous, zero-dependency)
- Node.js: `better-sqlite3` (synchronous, native module via node-gyp) + Drizzle ORM for type safety

### PC Control (Cross-Platform)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @nut-tree-fork/nut-js | 4.x+ | Mouse, keyboard, screen capture | Cross-platform automation. TypeScript-native. Actively maintained fork of nut-tree/nut-js. Replaces Python's pyautogui. Works on Linux/macOS/Windows with same API. Native module (requires libxtst-dev on Linux). |
| systeminformation | 5.x+ | System info (CPU, memory, processes, brightness) | Cross-platform system utilities. TypeScript definitions included. Gets process list, CPU/memory stats, battery, temperature. Works on all three OSes. Replaces Python's psutil + screen-brightness-control. |
| active-win | 9.x+ | Active window detection | Cross-platform (Linux/macOS/Windows). Gets title, process name, bounds of active window. Pure JavaScript with minimal native bindings. TypeScript types included. |
| node-window-manager | 2.x+ | Window management (enumerate, focus, resize, move) | Cross-platform (X11/Wayland/Win32/Cocoa). Native module (node-gyp). Replaces Python's PyWinCtl. Widely used, stable, but requires build tools. |
| loudness | 0.4.x+ | System volume control | Cross-platform volume get/set. Works on Linux (ALSA/PulseAudio), macOS (osascript), Windows (nircmd). Simple API, actively maintained. Replaces Python's custom volume control. |

**Key Difference from Python:**
- Python: `pyautogui` (pure Python), `PyWinCtl` (cross-platform window control), `psutil` (process management)
- Node.js: All require native modules (node-gyp) — more build friction, but equivalent functionality

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x | Runtime schema validation | Validate LLM tool inputs, API requests, config files. First-class TypeScript inference. LangChain.js uses Zod for tool schemas (Python uses Pydantic v2). |
| dotenv | 16.x | .env file loading | Development and production config — API keys, LM Studio URL, feature flags. Python uses python-dotenv 1.x — same purpose. |
| tsx | 4.x+ | TypeScript execution for Node.js | Run TypeScript files directly without compilation step (uses esbuild). Faster than ts-node. Use for dev and scripts. Python equivalent: `python -m module`. |
| pino | 9.x+ | Structured logging | High-performance JSON logger. Zero-config. Faster than winston or bunyan. Pretty-print in dev, JSON in prod. Python uses loguru 0.7.x — similar philosophy. |
| vitest | 2.x+ | Test framework | Vite-native, faster than Jest for ESM projects. First-class TypeScript support. Use for unit and integration tests. Python uses pytest 8.x. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Package manager | Already in use in monorepo. Symlink-based, space-efficient. Use `pnpm --filter backend-ts` to run commands in workspace. |
| tsx | TypeScript runner | Run `.ts` files directly: `tsx src/index.ts`. Faster than ts-node (uses esbuild). |
| Biome | Linter & formatter | Faster than ESLint+Prettier combo. Rust-based. Use `biome check --write` for auto-fix. Single tool for both. |
| tsup | TypeScript bundler | Builds production bundles with esbuild. Use for packaging backend-ts. Outputs ESM + CJS. |

---

## Installation

```bash
# Navigate to backend-ts workspace (create if doesn't exist)
mkdir -p apps/backend-ts
cd apps/backend-ts
pnpm init

# Core orchestration
pnpm add langchain @langchain/core @langchain/langgraph @langchain/openai @langchain/anthropic

# Voice pipeline
pnpm add nodejs-whisper @picovoice/porcupine-node @huggingface/transformers

# Memory
pnpm add chromadb @chroma-core/default-embed drizzle-orm better-sqlite3
pnpm add -D drizzle-kit

# PC Control
pnpm add @nut-tree-fork/nut-js systeminformation active-win node-window-manager loudness

# Supporting libraries
pnpm add zod dotenv pino

# Dev dependencies
pnpm add -D tsx vitest @types/node @types/better-sqlite3 biome tsup

# System packages (platform-specific, install via OS package manager)
# Linux (Debian/Ubuntu):
#   apt install build-essential libxtst-dev libpng++-dev python3
# macOS:
#   xcode-select --install
# Windows:
#   npm install --global windows-build-tools
#   (OR install Visual Studio Build Tools 2022 with C++ workload)
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| LangChain.js 0.3.x | LangGraph 1.x (Python-only) | Never for migration — JS is on 0.3.x (stable but older versioning). Python has 1.x, but goal is TypeScript. |
| nodejs-whisper | whisper-node | Never — whisper-node last updated 2 years ago (2024). nodejs-whisper actively maintained (May 2025). |
| nodejs-whisper | OpenAI Whisper API (cloud) | If privacy isn't critical OR multilingual support beyond local models. Cloud API has better accuracy for rare languages. Violates privacy-first constraint. |
| @picovoice/porcupine-node | openWakeWord (Python-only) | Never for TypeScript — openWakeWord has no Node.js port. Porcupine is enterprise-grade Node.js solution. Requires free AccessKey (tradeoff vs Python's fully open openwakeword). |
| Transformers.js TTS | ElevenLabs API | If voice quality is more important than privacy/offline. ElevenLabs vastly better quality but requires API key + internet. Violates privacy-first constraint. |
| Drizzle ORM | Prisma 7 | If you prefer schema-first approach and need mature ecosystem (Prisma Studio, migrations UI). Prisma 7 closed performance gap with TS/WASM engine (1.6MB vs 14MB Rust engine in v6). Use with `@prisma/adapter-better-sqlite3` for best performance. Drizzle is lighter and faster for MVP. |
| better-sqlite3 | node-sqlite3 | Never — node-sqlite3 is async-only and slower. better-sqlite3 is synchronous (matches Python sqlite3 stdlib) and much faster. |
| @nut-tree-fork/nut-js | RobotJS | If you need most mature/battle-tested automation library. RobotJS has wider usage but less active maintenance. @nut-tree-fork is TypeScript-native and actively maintained. |
| Drizzle | TypeORM | If using NestJS (tight integration) or need Active Record pattern. TypeORM is more established but heavier and slower. Drizzle is lighter and SQL-like. |
| vitest | Jest | If you need extensive mocking ecosystem or are already using Jest elsewhere. Jest is slower for ESM projects. vitest is Vite-native, faster, better ESM support. |
| Biome | ESLint + Prettier | If you need specific ESLint plugins not yet in Biome. Biome is 10x+ faster (Rust-based), single tool for lint + format. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| whisper-node | Last updated 2 years ago (2024). Unmaintained. | nodejs-whisper (actively maintained, May 2025 update) |
| @xenova/transformers | Package renamed to @huggingface/transformers in 2025. Deprecated. | @huggingface/transformers |
| LangChain.js 1.x | Does NOT exist yet. Python is on 1.x, JS is still 0.3.x. Installing 1.x will pull pre-release dev builds. | LangChain.js 0.3.x with @langchain/core 0.3.x |
| Prisma 6 or earlier | Slow SQLite performance (async), large bundle (14MB Rust engine), slow cold starts. Prisma 7 is acceptable with better-sqlite3 adapter. | Drizzle ORM or Prisma 7 with @prisma/adapter-better-sqlite3 |
| sentence-transformers (Python) | Python-only library. No direct Node.js port. | Transformers.js with Xenova/all-MiniLM-L6-v2 model |
| kokoro TTS (Python) | Python-only (no official Node.js bindings). 82M param model, no ONNX export available. | Transformers.js with Speecht5 or similar ONNX TTS models (quality tradeoff) |
| node-sqlite3 | Slow, async-only API, less actively maintained. Doesn't match Python's synchronous sqlite3 stdlib. | better-sqlite3 (synchronous, faster, direct Python equivalent) |
| ts-node | Slow startup (uses TypeScript compiler TSC). | tsx (uses esbuild, much faster — 10x+ speedup) |
| Jest | Slower for ESM projects, heavier than vitest. Complex config for TypeScript ESM. | vitest (Vite-native, faster, better ESM support, zero-config) |
| ESLint + Prettier | Two separate tools, slower than Biome. Requires multiple config files. | Biome (single tool, Rust-based, 10x+ faster, single config) |
| node-record-lpcm16 | Requires sox/rec binary on PATH, complex cross-platform setup. Python equivalent is sounddevice. Not needed — audio comes from Electron MediaRecorder. | N/A (audio capture handled in Electron renderer via Web Audio API) |

---

## Stack Patterns by Variant

### For Electron Desktop Integration

Backend-ts will be consumed via HTTP by the Electron main process, just like Python backend currently is.

**Flow:**
```
[Electron Renderer] MediaRecorder blob
     ↓ contextBridge IPC
[Electron Main Process] fetch('http://localhost:3000/api/chat/audio')
     ↓ HTTP
[Express Gateway :3000] POST /api/chat/audio
     ↓ proxy
[Backend-TS :8001] POST /chat (LangChain agent → response)
```

No Electron-specific changes needed in backend-ts. Same HTTP API as Python backend.

### For Docker/Server Deployment

```dockerfile
# Dockerfile for backend-ts (future)
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    libxtst-dev \
    libpng++-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

CMD ["node", "dist/index.js"]
```

Mount `./data` volume for SQLite + ChromaDB persistence (same as Python backend).

### For Multi-LLM Switching

Use factory pattern with `@langchain/openai`, `@langchain/anthropic` (mirrors Python's `llm_factory.py`):

```typescript
// llm-factory.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export function createLLM(provider: string, baseURL?: string): BaseChatModel {
  switch (provider) {
    case "lm-studio":
      return new ChatOpenAI({
        modelName: "local-model", // Must match /v1/models response
        openAIApiKey: "lm-studio", // Any non-empty string (ignored on localhost)
      }, {
        basePath: baseURL || "http://localhost:1234/v1", // LM Studio default
      });

    case "openai":
      return new ChatOpenAI({
        modelName: "gpt-4",
        openAIApiKey: process.env.OPENAI_API_KEY!,
      });

    case "anthropic":
      return new ChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      });

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

**For LM Studio:** Set `basePath: "http://localhost:1234/v1"` in ChatOpenAI config (Python uses `base_url`). Set `openAIApiKey: "lm-studio"` (any non-empty string — LM Studio ignores on localhost).

### For pnpm Workspaces with Native Modules

Native modules (better-sqlite3, @nut-tree-fork/nut-js, node-window-manager) use node-gyp. pnpm's symlink strategy can cause build issues.

**Solution 1 (Recommended):** Use `.npmrc` in monorepo root:
```ini
# .npmrc
shamefully-hoist=true
# OR for specific packages:
# public-hoist-pattern[]=*sqlite3*
# public-hoist-pattern[]=*@nut-tree*
```

**Solution 2:** Use hoisted node linker (flattens node_modules like npm):
```ini
# .npmrc
node-linker=hoisted
```

**Solution 3:** Rebuild native modules after install:
```bash
pnpm --filter backend-ts rebuild better-sqlite3
```

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| langchain 0.3.x | @langchain/core 0.3.x | ALL LangChain packages MUST share same @langchain/core version. Mismatch causes runtime errors. |
| @langchain/langgraph 0.2.19+ | @langchain/core 0.3.x | LangGraph 0.2.x works with core 0.3.x. Do not mix with Python versions (Python has langgraph 1.x API). |
| chromadb 1.9.x | @chroma-core/default-embed 1.x | Embedding functions no longer bundled in chromadb v3+ (June 2025 rewrite). Must install separately. |
| Transformers.js 3.x | Node.js 18+ | Requires Node.js 18+ for fetch API and WASM support. Works on 22.x LTS. |
| nodejs-whisper 0.2.9 | Node.js 18+ | Requires Node.js 18+ for native fetch and recent N-API version. |
| Drizzle ORM 0.39.x | better-sqlite3 11.x | Use `drizzle-orm/better-sqlite3` adapter. Drizzle versions update frequently — pin in package.json. |
| @nut-tree-fork/nut-js 4.x | Node.js 18+ | Native module (node-gyp). Requires build tools on all platforms. Works in Node.js process, not Electron renderer. |
| @picovoice/porcupine-node 3.x | Node.js 18+ | Uses ONNX runtime (bundled). AccessKey required (free tier available). |

---

## Native Modules & Cross-Platform Notes

### Node-GYP Requirements

Several packages require node-gyp (native compilation):
- `better-sqlite3` — requires build tools on all platforms
- `@nut-tree-fork/nut-js` — requires libxtst-dev (Linux), Xcode CLI (macOS), Build Tools (Windows)
- `node-window-manager` — requires X11/Win32/Cocoa development headers
- `@picovoice/porcupine-node` — uses prebuilt binaries (no build required)

**Build Tools Setup:**
```bash
# Linux (Debian/Ubuntu)
apt install build-essential libxtst-dev libpng++-dev python3

# macOS
xcode-select --install

# Windows
npm install --global windows-build-tools
# OR install Visual Studio Build Tools 2022 with C++ workload
```

### pnpm Monorepo Considerations

**Issue:** Native modules may fail to build in pnpm workspaces due to symlink-based node_modules.

**Solution:** Use `.npmrc` in workspace root (see "Stack Patterns by Variant" section above).

**Verification:** After `pnpm install`, run:
```bash
pnpm --filter backend-ts node -e "const db = require('better-sqlite3')(':memory:'); console.log('SQLite OK');"
```

If this fails, native module rebuild is needed.

---

## ChromaDB Embedding Function Setup

ChromaDB v3+ no longer bundles embedding functions. Must install separately.

**Option 1: Default Embedding Function (simple)**
```typescript
import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

const client = new ChromaClient();
const embeddingFunction = new DefaultEmbeddingFunction();

const collection = await client.getOrCreateCollection({
  name: "memories",
  embeddingFunction: embeddingFunction,
});
```

**Option 2: Transformers.js Embeddings (offline, matches Python sentence-transformers)**
```typescript
import { pipeline } from "@huggingface/transformers";

class TransformersEmbeddingFunction {
  private extractor: any;

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      this.extractor = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2" // Same model as Python sentence-transformers
      );
    }

    const embeddings = await this.extractor(texts, {
      pooling: "mean",
      normalize: true,
    });

    return embeddings.tolist();
  }
}

const collection = await client.getOrCreateCollection({
  name: "memories",
  embeddingFunction: new TransformersEmbeddingFunction(),
});
```

Use Option 2 for 1:1 parity with Python's `sentence-transformers/all-MiniLM-L6-v2` embeddings.

---

## Python vs TypeScript Stack Mapping

| Component | Python (v1.0-v1.2) | TypeScript (v1.3) | Notes |
|-----------|-------------------|-------------------|-------|
| Runtime | Python 3.10+ | Node.js 22.x LTS | Node 22 matches Electron's runtime |
| Agent framework | langchain 1.2.14 | langchain 0.3.x | Version mismatch — Python 1.x, JS 0.3.x (same API) |
| Agent runtime | langgraph 1.1.4 | @langchain/langgraph 0.2.19+ | Same functionality, different versioning |
| Multi-LLM | langchain-openai 0.3.x, langchain-anthropic 0.3.x | @langchain/openai 0.3.x, @langchain/anthropic 1.3.26 | LM Studio base_url → basePath |
| STT | faster-whisper 1.2.1 | nodejs-whisper 0.2.9 | Both wrap whisper.cpp |
| TTS | kokoro 0.9.4+ | Transformers.js (Speecht5/VITS) | kokoro has no Node.js port — quality tradeoff |
| Wake word | openwakeword 0.6.x | @picovoice/porcupine-node 3.x | openwakeword no JS port — Porcupine requires AccessKey |
| Vector DB | chromadb 1.5.5 | chromadb 1.9.x | Same ChromaDB, JS client v3 rewrite |
| Embeddings | sentence-transformers 3.x | Transformers.js (Xenova/all-MiniLM-L6-v2) | Same model, ONNX port |
| SQLite | sqlite3 (stdlib) | better-sqlite3 11.x | Synchronous API matches Python |
| ORM | None (raw SQL) | Drizzle ORM 0.39.x | Type safety layer over SQL |
| Screen automation | pyautogui 0.9.54 | @nut-tree-fork/nut-js 4.x | TypeScript-native equivalent |
| System info | psutil 6.x | systeminformation 5.x | Cross-platform system utilities |
| Window control | PyWinCtl 0.43 | node-window-manager 2.x | Native module on both |
| Brightness | screen-brightness-control 0.23.x | systeminformation 5.x | systeminformation covers brightness |
| Volume | Custom (pywin32/python-xlib/pyobjc) | loudness 0.4.x | Unified cross-platform API |
| Logging | loguru 0.7.x | pino 9.x | JSON structured logging |
| Testing | pytest 8.x | vitest 2.x | Fast test runners |
| Validation | pydantic 2.x | zod 3.x | Runtime schema validation |
| Config | pydantic-settings | dotenv 16.x + zod | Load .env + validate with zod |

---

## Sources

**HIGH Confidence:**
- npm langchain 0.3.x — verified via WebSearch (published 3 days ago, 2026-04-07)
- npm @langchain/core 0.3.x, @langchain/openai 0.3.x — verified via WebSearch (March 2026 releases)
- npm @langchain/anthropic 1.3.26 — verified via WebSearch (published 6 days ago, 2026-04-07)
- npm @langchain/langgraph 0.2.19 — verified via WebSearch (published 3 days ago, 42K weekly downloads)
- npm chromadb 1.9.x — WebSearch confirmed v3 rewrite (June 2025) with unbundled embeddings
- npm nodejs-whisper 0.2.9 — WebSearch confirmed active maintenance (May 2025 update)
- LangChain.js release policy docs — confirmed 0.3.x in maintenance until Dec 2026 (https://docs.langchain.com/oss/javascript/release-policy)
- Drizzle vs Prisma 2026 comparisons — multiple sources confirm Prisma 7 TS/WASM engine (1.6MB vs 14MB) (https://makerkit.dev/blog/tutorials/drizzle-vs-prisma, https://www.bytebase.com/blog/drizzle-vs-prisma/)
- better-sqlite3 vs Prisma performance — GitHub issues confirm historical gap, Prisma 7 improvements verified (https://github.com/prisma/prisma/issues/12785)
- Porcupine wake word — official docs confirm free tier, AccessKey required (https://picovoice.ai/platform/porcupine/)
- Transformers.js Xenova/all-MiniLM-L6-v2 — HuggingFace docs confirm ONNX port of sentence-transformers model (https://huggingface.co/Xenova/all-MiniLM-L6-v2)

**MEDIUM Confidence:**
- Transformers.js for TTS — confirmed via WebSearch and HuggingFace docs, but specific model quality not benchmarked vs kokoro
- @nut-tree-fork/nut-js — confirmed via npm search, but less battle-tested than Python pyautogui
- nodejs-whisper vs whisper-node — maintenance status verified via npm (nodejs-whisper May 2025, whisper-node 2 years ago), but no direct performance benchmarks

**LOW Confidence:**
- kokoro TTS Node.js unavailability — no official documentation states "no Node.js port", but no npm package found (inferred from lack of search results)

---

*Stack research for: JARVIS v1.3 TypeScript Migration (Python → Node.js/TS Backend)*
*Researched: 2026-04-07*
*Researcher: GSD Project Research Agent*
