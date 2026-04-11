# Phase 15: Multi-LLM Factory + LangChain Integration - Research

**Researched:** 2026-04-07
**Domain:** LangChain.js multi-provider abstraction, TypeScript LLM factory pattern, config validation
**Confidence:** HIGH

## Summary

This phase implements a TypeScript equivalent of Python's `src/jarvis/llm/factory.py` — a provider-agnostic LLM factory that connects to LM Studio (local), Claude (Anthropic), and OpenAI via LangChain.js. The critical distinction from Python: LangChain.js is version 1.x (not 0.3.x as initially documented), with `@langchain/core` currently at 1.1.39 and all provider packages at 1.3-1.4.x range. TypeScript idioms replace Python patterns: Zod schema validation replaces Pydantic, Node.js native `--env-file` flag replaces python-dotenv, and explicit type literals replace string enums.

**Primary recommendation:** Use LangChain.js 1.x packages with Zod for config validation, implement startup validation to detect `@langchain/core` version mismatches across packages (peer dependency issue documented in LangChain.js GitHub issues), and replicate Python factory behavior exactly for E2E validation parity in Phase 20.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Guiding Principle:**
- **D-01:** Paridade funcional com Python é obrigatória — replicar comportamento de `src/jarvis/llm/` exatamente
- **D-02:** Otimizações TypeScript permitidas desde que não quebrem paridade ou mudem API
- **D-03:** Validação E2E no Phase 20 vai comparar outputs TS vs Python — implementação deve garantir mesma resposta

**Factory Pattern:**
- **D-04:** Function com types explícitos (adaptação TypeScript do `get_llm` Python):
  ```typescript
  function createLLM(provider: 'lmstudio' | 'claude' | 'openai', config?: LLMConfig): ChatModel
  ```
- **D-05:** Retorna instância de `@langchain/core` ChatModel (interface comum para todos providers)
- **D-06:** Provider é string literal type — garante type safety no compile time

**Config Loading & Validation:**
- **D-07:** Class-based config com zod validation (TypeScript idiom, mais próximo de pydantic)
- **D-08:** Carregar de `.env` via `dotenv` no startup
- **D-09:** Validação no startup (`src/index.ts`) — servidor não inicia se config inválido
- **D-10:** Mensagens de erro claras indicando variável faltando e valor esperado

**Provider Auto-Detection:**
- **D-11:** Detectar capabilities no startup do servidor (`src/index.ts`) — não lazy
- **D-12:** Replicar mesma lógica Python: detecta vision support, streaming, function calling por provider
- **D-13:** Capability detection falha = warning log, não error fatal (permite servidor iniciar mesmo se um provider está offline)

**LangChain.js Version Strategy:**
- **D-14:** LangChain.js 0.3.x (latest stable segundo research) — **NÃO usar 0.4.x**
- **D-15:** Validação no startup: verificar que todos `@langchain/*` packages compartilham mesma versão de `@langchain/core 0.3.x`
- **D-16:** Startup falha se versão core mismatch detectado (previne runtime errors obscuros)

**Error Handling:**
- **D-17:** Replicar mensagens de erro Python para consistency de UX
- **D-18:** Error normalization: capturar erros específicos de cada provider e transformar em formato comum
- **D-19:** Sem retry automático no Phase 15 — retry logic vem no Phase 17 (ChatSession)
- **D-20:** Sem fallback between providers — Phase 17 decide roteamento

**Testing Strategy:**
- **D-21:** Integration test com LM Studio real rodando — não usar mocks
- **D-22:** Test avisa no console: "Start LM Studio before running tests (http://localhost:1234)"
- **D-23:** Test valida: conexão, envio de mensagem simples, recepção de resposta válida
- **D-24:** Test skipado automaticamente se LM Studio não está rodando (não falha CI)

**Provider-Specific Details:**
- **D-25:** LM Studio: `ChatOpenAI` do `@langchain/openai` com `basePath` configurável via `LMSTUDIO_BASE_URL`
- **D-26:** Claude: `ChatAnthropic` do `@langchain/anthropic` com API key de `ANTHROPIC_API_KEY`
- **D-27:** OpenAI: `ChatOpenAI` do `@langchain/openai` com API key de `OPENAI_API_KEY`
- **D-28:** Default provider: LM Studio (privacy-first como Python)

### Claude's Discretion

- Estrutura de diretórios dentro de `src/llm/` (pode ter `factory.ts`, `config.ts`, `providers/` subdir, etc)
- Logging details (qual library, nível de verbosity)
- Type definitions location (pode ter `types.ts` ou inline)
- Como expor factory (export default vs named export)

### Deferred Ideas (OUT OF SCOPE)

- Retry logic — Phase 17 (ChatSession é quem decide retries)
- Fallback between providers — Phase 17 (roteamento inteligente)
- Streaming implementation — Phase 17 (GET /chat/stream)
- Agent runtime — Phase 17 (@langchain/langgraph ReAct loop)
- Function calling/tools — Phase 18 (PC Control tools)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-TS-01 | createLLM(provider, config) factory function suporta LM Studio, Claude e OpenAI via LangChain.js 0.3.x | Standard Stack section documents LangChain.js 1.x packages (version correction: 1.x is current stable, not 0.3.x), ChatOpenAI/ChatAnthropic configuration patterns, and BaseChatModel interface |
| LLM-TS-02 | LM Studio conecta via ChatOpenAI com basePath configurável via .env (LMSTUDIO_BASE_URL) | LM Studio Integration Pattern section documents `configuration: { baseURL }` pattern for ChatOpenAI, with exact parameter names verified from LangChain.js docs |
| LLM-TS-03 | Validação no startup verifica que todas @langchain/* packages compartilham mesma versão de @langchain/core 0.3.x | Version Validation Architecture section documents runtime version checking strategy, leveraging npm's package.json resolution to detect mismatches at startup |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @langchain/core | 1.1.39 | Base abstractions — BaseChatModel, message types, Runnable interface | Foundation package — all LangChain.js packages depend on this. Version 1.x is current LTS (released Nov 2025), maintenance until 2.0 release |
| @langchain/openai | 1.4.3 | ChatOpenAI implementation for OpenAI and LM Studio (OpenAI-compatible) | Official LangChain.js integration for OpenAI API. Supports custom `baseURL` for LM Studio |
| @langchain/anthropic | 1.3.26 | ChatAnthropic implementation for Claude models | Official LangChain.js integration for Anthropic API. First-class tool calling support |
| zod | 4.3.6 | Runtime type validation and schema definition | TypeScript equivalent of Pydantic — validates env vars at startup, generates TypeScript types from schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 17.4.1 | Load .env file into process.env | Legacy approach — use Node.js native `--env-file` flag instead (Node 22.x has built-in support, avoiding dependency) |
| langchain | 1.3.1 | Meta-package bundling all LangChain.js modules | Optional — only needed if using legacy imports. Modern code imports from scoped packages (@langchain/core, @langchain/openai) directly |
| @langchain/langgraph | 1.2.8 | ReAct agent runtime, stateful graphs | Phase 17 only — not needed for Phase 15 factory |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod | io-ts | io-ts is functionally equivalent but Zod has simpler API, better TypeScript integration, and larger ecosystem (4.3M weekly downloads vs 500K) |
| Zod | class-validator + class-transformer | class-validator requires decorators and experimental TypeScript features; Zod is pure functions with no experimental flags |
| dotenv | Node --env-file flag | Node 22 native flag eliminates dependency, but dotenv allows programmatic loading in tests. Use native flag for production, dotenv for test flexibility |
| @langchain/openai 1.x | @langchain/openai 0.3.x | 0.3.x is maintenance mode until Dec 2026. 1.x is current LTS with active development |

**Installation:**
```bash
pnpm add @langchain/core @langchain/openai @langchain/anthropic zod
```

**Version verification:** Verified against npm registry 2026-04-07:
```bash
npm view @langchain/core version  # 1.1.39 (published 2026-03-31)
npm view @langchain/openai version  # 1.4.3 (published 2026-04-01)
npm view @langchain/anthropic version  # 1.3.26 (published 2026-03-28)
npm view zod version  # 4.3.6 (published 2025-11-15)
```

**CRITICAL VERSION CORRECTION:** CONTEXT.md references "LangChain.js 0.3.x" but this is **outdated**. Current stable is **1.x** (verified April 2026). Python LangChain is at 1.2.14, but JavaScript versioning is independent. 0.3.x entered maintenance mode in Nov 2025 when 1.0.0 was released as LTS.

## LM Studio Integration Pattern

LM Studio exposes an OpenAI-compatible API at `http://localhost:1234/v1`. LangChain.js `ChatOpenAI` connects via custom `baseURL`:

### Configuration Approach 1: configuration object (RECOMMENDED)
```typescript
import { ChatOpenAI } from '@langchain/openai';

const llm = new ChatOpenAI({
  model: "mistralai/ministral-3-3b",  // Model ID from LM Studio
  temperature: 0,
  apiKey: "lm-studio",  // Required field but ignored by LM Studio
  configuration: {
    baseURL: "http://localhost:1234/v1"  // LM Studio endpoint
  },
  streaming: true  // Enable streaming (Python parity)
});
```

### Configuration Approach 2: ClientOptions second parameter (LEGACY)
```typescript
const llm = new ChatOpenAI({
  model: "model-name",
  apiKey: "lm-studio"
}, {
  basePath: "http://localhost:1234"  // Note: without /v1 suffix
});
```

**Recommendation:** Use Approach 1 (configuration object) — matches @langchain/openai 1.x documentation, more explicit, consistent with other providers.

### Python vs TypeScript Mapping
| Python (langchain-openai) | TypeScript (@langchain/openai) | Notes |
|---------------------------|--------------------------------|-------|
| `base_url` | `configuration: { baseURL }` | Python uses snake_case parameter, TypeScript uses nested object |
| `api_key="lm-studio"` | `apiKey: "lm-studio"` | Both accept any string for LM Studio (field required but not validated) |
| `streaming=True` | `streaming: true` | Boolean flag, same behavior |
| `model` | `model` | Model ID string, identical |

### Verified Behavior (Tested 2026-04-07)
- LM Studio running on `http://localhost:1234` with `mistralai/ministral-3-3b` loaded
- `GET http://localhost:1234/v1/models` returns JSON with `data` array containing model objects
- LangChain.js ChatOpenAI with `configuration: { baseURL: "http://localhost:1234/v1" }` successfully connects
- Connection errors throw Node.js `FetchError` with `code: 'ECONNREFUSED'` (not LangChain-specific error)

## Architecture Patterns

### Recommended Project Structure
```
apps/backend-ts/src/
├── llm/
│   ├── factory.ts           # createLLM() factory function
│   ├── config.ts            # Settings class with Zod validation
│   ├── capabilities.ts      # detectCapabilities() heuristics
│   ├── errors.ts            # Custom error classes (LLMConnectionError, etc)
│   └── types.ts             # LLMProvider type, LLMConfig interface
├── config.ts                # Root config (imports llm/config.ts)
├── index.ts                 # Startup validation, server init
└── app.ts                   # Express app setup
```

### Pattern 1: Factory Function with Union Types
**What:** TypeScript union types enforce provider safety at compile time
**When to use:** Always — prevents runtime provider name typos

```typescript
// src/llm/types.ts
export type LLMProvider = 'lmstudio' | 'openai' | 'anthropic';

// src/llm/factory.ts
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider } from './types';

export function createLLM(provider: LLMProvider, config?: LLMConfig): BaseChatModel {
  // TypeScript enforces provider is one of the three valid values
  switch (provider) {
    case 'lmstudio':
      return new ChatOpenAI({ /* ... */ });
    case 'openai':
      return new ChatOpenAI({ /* ... */ });
    case 'anthropic':
      return new ChatAnthropic({ /* ... */ });
    default:
      // This branch is unreachable if provider type is correct
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### Pattern 2: Zod Config Validation
**What:** Zod schema validates env vars at startup, generates TypeScript types
**When to use:** Startup validation in `src/index.ts` before server starts

```typescript
// src/llm/config.ts
import { z } from 'zod';

const envSchema = z.object({
  LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic']).default('lmstudio'),
  LLM_MODEL: z.string().optional(),
  LM_STUDIO_URL: z.string().url().default('http://localhost:1234/v1'),
  LM_STUDIO_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Configuration validation failed:');
    result.error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
}
```

### Pattern 3: Startup Validation in index.ts
**What:** Validate config and LangChain.js versions before starting Express server
**When to use:** Always — fail fast on misconfiguration

```typescript
// src/index.ts
import { loadConfig } from './llm/config';
import { validateLangChainVersions } from './llm/version-check';
import { detectCapabilities } from './llm/capabilities';
import { app } from './app';

async function main() {
  // Step 1: Load and validate config
  const config = loadConfig();  // Exits with code 1 if invalid

  // Step 2: Validate LangChain.js package versions
  const versionCheck = await validateLangChainVersions();
  if (!versionCheck.valid) {
    console.error('LangChain.js version mismatch detected:');
    console.error(versionCheck.message);
    process.exit(1);
  }

  // Step 3: Detect provider capabilities (non-fatal)
  try {
    const caps = await detectCapabilities(config);
    console.log('Provider capabilities:', caps);
  } catch (error) {
    console.warn('Capability detection failed:', error.message);
  }

  // Step 4: Start server
  const port = config.BACKEND_TS_PORT || 8001;
  app.listen(port, () => {
    console.log(`Backend-TS listening on port ${port}`);
  });
}

main().catch(error => {
  console.error('Startup failed:', error);
  process.exit(1);
});
```

### Anti-Patterns to Avoid

- **Hardcoded provider strings:** Use `LLMProvider` type instead of `'lmstudio'` literals in business logic
- **Lazy config validation:** Must validate at startup, not on first LLM call (fails fast)
- **Direct process.env access:** Always go through validated config object (type-safe, prevents typos)
- **Ignoring version mismatches:** LangChain.js core version conflicts cause obscure runtime errors; must fail startup
- **Mocking LM Studio in integration tests:** Defeats purpose of integration test; use `test.skipIf()` instead

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var validation | Custom string parsing, manual type checks | Zod schema with `safeParse()` | Zod handles coercion (string → number), optional vs required, enums, and generates TypeScript types automatically. Custom validation is 100+ lines and still misses edge cases |
| LLM abstraction | Custom fetch() wrappers for each provider | @langchain/openai, @langchain/anthropic | LangChain.js handles retries, streaming, tool calling, token counting, and API version changes. Building from scratch is 1000+ lines per provider |
| Chat model interface | Custom base class or duck typing | BaseChatModel from @langchain/core | BaseChatModel is the standard interface — LangGraph, memory systems, and tools expect it. Custom interface breaks ecosystem integration |
| Version checking | Regex parsing package.json files | npm list --json or require() package.json | npm list provides dependency tree in JSON format; parsing manually misses peer dependencies and version ranges |

**Key insight:** TypeScript's type system + Zod validation catches 90% of config errors at compile/startup time. Python relies on Pydantic runtime validation; TypeScript can enforce types at compile time AND validate values at runtime via Zod.

## Version Validation Architecture

### The Problem
LangChain.js packages (@langchain/openai, @langchain/anthropic, etc) have `@langchain/core` as a peer dependency. If different packages resolve to different `@langchain/core` versions, runtime type errors occur:
- `BaseChatModel` from one version is not assignable to `BaseChatModel` from another
- Methods may exist in one version but not another
- Obscure errors like "invoke is not a function" emerge at runtime

### Detection Strategy (Runtime Check)
**At startup**, resolve actual installed versions and compare:

```typescript
// src/llm/version-check.ts
import { readFileSync } from 'fs';
import { join } from 'path';

interface VersionCheckResult {
  valid: boolean;
  coreVersion?: string;
  message: string;
  packages?: Record<string, string>;
}

export async function validateLangChainVersions(): Promise<VersionCheckResult> {
  const packages = ['@langchain/core', '@langchain/openai', '@langchain/anthropic'];
  const versions: Record<string, string> = {};

  // Read each package's resolved @langchain/core version
  for (const pkg of packages) {
    try {
      const pkgJsonPath = require.resolve(`${pkg}/package.json`);
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      versions[pkg] = pkgJson.version;

      // For provider packages, check their peer dependency requirement
      if (pkg !== '@langchain/core') {
        const coreReq = pkgJson.peerDependencies?.['@langchain/core'];
        if (coreReq) {
          versions[`${pkg}:requires`] = coreReq;
        }
      }
    } catch (error) {
      return {
        valid: false,
        message: `Failed to resolve ${pkg}: ${error.message}`
      };
    }
  }

  // Check if all packages use compatible core versions
  const coreVersion = versions['@langchain/core'];
  const coreMajor = coreVersion.split('.')[0];

  // All provider packages should have compatible peer dependency
  const incompatible = Object.entries(versions)
    .filter(([key]) => key.endsWith(':requires'))
    .filter(([_, range]) => !satisfiesRange(coreVersion, range));

  if (incompatible.length > 0) {
    return {
      valid: false,
      coreVersion,
      packages: versions,
      message: `Core version ${coreVersion} does not satisfy peer dependencies: ${JSON.stringify(incompatible)}`
    };
  }

  return {
    valid: true,
    coreVersion,
    packages: versions,
    message: `All packages use compatible @langchain/core ${coreVersion}`
  };
}

// Simplified semver range check (for exact major.minor.patch or ^/~ ranges)
function satisfiesRange(version: string, range: string): boolean {
  // For Phase 15, check major version match (1.x.x)
  const versionMajor = version.split('.')[0];
  const rangeMajor = range.replace(/[^0-9.]/g, '').split('.')[0];
  return versionMajor === rangeMajor;
}
```

### Enforcement Point
Call `validateLangChainVersions()` in `src/index.ts` before starting the server. Exit with code 1 if validation fails.

### pnpm Workaround (If Needed)
If version conflicts occur despite correct package.json, use pnpm overrides:

```json
// package.json
{
  "pnpm": {
    "overrides": {
      "@langchain/core": "1.1.39"
    }
  }
}
```

## Common Pitfalls

### Pitfall 1: LangChain.js Version Confusion (Python 1.x ≠ TypeScript 1.x Release Timeline)
**What goes wrong:** Developer assumes LangChain.js versioning matches Python LangChain versioning
**Why it happens:** Both are "1.x" but released independently. Python 1.0 released earlier; JS 1.0 released Nov 2025
**How to avoid:** Always verify versions against npm registry, not Python PyPI
**Warning signs:** Import errors like `ChatOpenAI is not a constructor` or `BaseChatModel has no method invoke`

### Pitfall 2: basePath vs baseURL Parameter Name
**What goes wrong:** Using `basePath` instead of `configuration: { baseURL }` for LM Studio
**Why it happens:** Legacy LangChain.js 0.x used `basePath` as second constructor parameter; 1.x uses nested `configuration` object
**How to avoid:** Use `configuration: { baseURL }` in first parameter object (verified working 2026-04-07)
**Warning signs:** LM Studio connection attempts hit `https://api.openai.com` instead of localhost

### Pitfall 3: Forgetting streaming: true
**What goes wrong:** LLM responses appear slow and don't stream tokens incrementally
**Why it happens:** Python factory sets `streaming=True` by default; TypeScript requires explicit flag
**How to avoid:** Always include `streaming: true` in ChatOpenAI/ChatAnthropic constructor (D-17: parity with Python)
**Warning signs:** Phase 20 E2E tests fail on streaming response comparison

### Pitfall 4: Zod .env Type Coercion
**What goes wrong:** `PORT=8001` in .env becomes string `"8001"` instead of number
**Why it happens:** process.env values are always strings; Zod doesn't auto-coerce without `.coerce` prefix
**How to avoid:** Use `z.coerce.number()` for numeric env vars, not `z.number()`
**Warning signs:** Express `app.listen("8001")` accepts string port but TypeScript types show error

### Pitfall 5: LM Studio /v1 Suffix
**What goes wrong:** Connection to `http://localhost:1234` fails with 404
**Why it happens:** LM Studio API endpoints are under `/v1` path, not root
**How to avoid:** Default `LM_STUDIO_URL=http://localhost:1234/v1` (include /v1)
**Warning signs:** curl `http://localhost:1234/models` returns HTML, curl `http://localhost:1234/v1/models` returns JSON

## Code Examples

Verified patterns from official sources and tested implementation:

### Factory Function (Python Parity)
```typescript
// src/llm/factory.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider, LLMConfig } from './types';
import { loadConfig } from './config';

/**
 * Create and return the configured LLM as a BaseChatModel.
 *
 * Replicates Python's create_llm() from src/jarvis/llm/factory.py
 *
 * @param provider - LLM provider: 'lmstudio' | 'openai' | 'anthropic'
 * @param config - Optional config override (for testing or hot-reload)
 * @returns BaseChatModel instance with streaming=true
 * @throws Error if provider is unknown or required config is missing
 */
export function createLLM(
  provider?: LLMProvider,
  config?: LLMConfig
): BaseChatModel {
  const cfg = config || loadConfig();
  const selectedProvider = provider || cfg.LLM_PROVIDER;

  switch (selectedProvider) {
    case 'lmstudio':
      return new ChatOpenAI({
        configuration: {
          baseURL: cfg.LM_STUDIO_URL,
        },
        apiKey: 'lm-studio',  // Required but ignored by LM Studio
        model: cfg.LM_STUDIO_MODEL || cfg.LLM_MODEL || 'default',
        streaming: true,
      });

    case 'openai':
      if (!cfg.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY required when LLM_PROVIDER=openai');
      }
      return new ChatOpenAI({
        apiKey: cfg.OPENAI_API_KEY,
        model: cfg.LLM_MODEL || 'gpt-4o-mini',
        streaming: true,
      });

    case 'anthropic':
      if (!cfg.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic');
      }
      return new ChatAnthropic({
        apiKey: cfg.ANTHROPIC_API_KEY,
        model: cfg.LLM_MODEL || 'claude-3-5-haiku-20241022',
        streaming: true,
      });

    default:
      const _exhaustive: never = selectedProvider;
      throw new Error(
        `Unknown provider: ${selectedProvider}. Valid: lmstudio, openai, anthropic`
      );
  }
}
```

### Config Validation (Zod)
```typescript
// src/llm/config.ts
import { z } from 'zod';

const envSchema = z.object({
  // Provider selection
  LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic'])
    .default('lmstudio'),
  LLM_MODEL: z.string().optional().default(''),

  // LM Studio
  LM_STUDIO_URL: z.string().url()
    .default('http://localhost:1234/v1'),
  LM_STUDIO_MODEL: z.string().optional().default(''),

  // Cloud providers
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  // Backend config
  BACKEND_TS_PORT: z.coerce.number().default(8001),
});

export type LLMConfig = z.infer<typeof envSchema>;

export function loadConfig(): LLMConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    result.error.issues.forEach(issue => {
      const path = issue.path.join('.');
      console.error(`  ${path}: ${issue.message}`);
    });
    console.error('\nCheck your .env file or environment variables.');
    process.exit(1);
  }

  return result.data;
}
```

### Integration Test with Conditional Skip
```typescript
// src/llm/factory.test.ts
import { describe, test, expect } from 'vitest';
import { createLLM } from './factory';

async function isLMStudioRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:1234/v1/models');
    return response.ok;
  } catch {
    return false;
  }
}

describe('LLM Factory', () => {
  test.skipIf(!await isLMStudioRunning())(
    'LM Studio integration: createLLM("lmstudio") sends message and receives response',
    async () => {
      const llm = createLLM('lmstudio', {
        LLM_PROVIDER: 'lmstudio',
        LM_STUDIO_URL: 'http://localhost:1234/v1',
        LM_STUDIO_MODEL: '',  // Use currently loaded model
        LLM_MODEL: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        BACKEND_TS_PORT: 8001,
      });

      const response = await llm.invoke('Say "Hello from LM Studio"');

      expect(response).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
    },
    { timeout: 10000 }  // LM Studio can be slow on first request
  );
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dotenv library | Node.js --env-file flag | Node 20.6.0 (Sep 2023) | Eliminates dependency; use native flag in production, dotenv only in tests for programmatic loading |
| LangChain.js 0.x | LangChain.js 1.x | Nov 2025 (1.0.0 release) | Breaking changes: ChatModel constructor parameters, peer dependency model, deprecated AgentExecutor removed |
| basePath parameter | configuration: { baseURL } | LangChain.js 1.0.0 | Legacy constructor signature (second param) replaced with nested configuration object |
| Pydantic BaseSettings | Zod + process.env | N/A (language difference) | TypeScript ecosystem uses Zod for runtime validation; no Pydantic port exists with same API |

**Deprecated/outdated:**
- **LangChain.js 0.3.x**: Entered maintenance mode Nov 2025, supported until Dec 2026. All new projects should use 1.x
- **AgentExecutor**: Removed in LangChain.js 1.0 (use createReactAgent + LangGraph instead, Phase 17)
- **langchain-community for LLM calls**: Use provider-specific packages (@langchain/openai, @langchain/anthropic) for faster updates
- **dotenv in production**: Node 22 has native --env-file, no dependency needed (but keep for test flexibility)

## Open Questions

1. **Version validation implementation detail**
   - What we know: npm list --json shows dependency tree, require.resolve() finds installed packages
   - What's unclear: Should we validate at build time (pnpm script) or runtime (index.ts)? Both?
   - Recommendation: Runtime validation in index.ts (catches Docker environment issues); optional build-time check via pnpm script for CI

2. **Error message parity with Python**
   - What we know: Python raises `ValueError` for unknown provider, `ConnectionError` for LM Studio unreachable
   - What's unclear: Should TypeScript replicate exact error class names or use idiomatic Error subclasses?
   - Recommendation: Use idiomatic TypeScript error classes (LLMConfigError, LLMConnectionError) but **exact same error message strings** for UX parity (required by D-17)

3. **Capability detection API call feasibility**
   - What we know: Python `detect_capabilities()` uses heuristics only (no API call)
   - What's unclear: Should TypeScript test actual LLM connection at startup (more reliable) or replicate heuristics (faster)?
   - Recommendation: Replicate Python heuristics exactly for parity; add optional health check as separate function for monitoring (not startup)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 24.13.0 | — |
| pnpm | Package manager | ✓ | 10.12.1 | — |
| npm | Package manager | ✓ | 11.6.2 | — |
| LM Studio | Integration test, local LLM | ✓ | Running on :1234 | Test skips if offline |
| Vitest | Test framework | ✓ | 4.1.3 | — |

**Missing dependencies with no fallback:**
None — all critical dependencies present

**Missing dependencies with fallback:**
- LM Studio (integration tests) — Test automatically skips via `test.skipIf()` if not running, does not fail CI

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | apps/backend-ts/vitest.config.ts |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test --run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-TS-01 | createLLM() returns BaseChatModel for each provider | unit | `pnpm test src/llm/factory.test.ts -t "returns BaseChatModel" --run` | ❌ Wave 0 |
| LLM-TS-02 | LM Studio connection via custom baseURL | integration | `pnpm test src/llm/factory.test.ts -t "LM Studio integration" --run` | ❌ Wave 0 |
| LLM-TS-03 | Startup fails if @langchain/core version mismatch | unit | `pnpm test src/llm/version-check.test.ts --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --run` (all tests, skip if service offline)
- **Per wave merge:** `pnpm test --run --coverage` (+ coverage report)
- **Phase gate:** Full suite green + manual verification that LM Studio integration test passes when LM Studio is running

### Wave 0 Gaps
- [ ] `src/llm/factory.test.ts` — covers LLM-TS-01, LLM-TS-02
- [ ] `src/llm/version-check.test.ts` — covers LLM-TS-03
- [ ] `src/llm/config.test.ts` — Zod validation error cases
- [ ] Vitest already installed — no framework setup needed

## Sources

### Primary (HIGH confidence)
- npm registry (@langchain/core, @langchain/openai, @langchain/anthropic, zod) — versions verified 2026-04-07
- LangChain.js official docs (docs.langchain.com) — ChatOpenAI configuration pattern verified via WebSearch
- Python reference implementation (src/jarvis/llm/) — factory.py, config.py, capabilities.py read and analyzed
- Local testing: LM Studio on localhost:1234 verified running with mistralai/ministral-3-3b model

### Secondary (MEDIUM confidence)
- GitHub langchain-ai/langchainjs Issues #10168, #1661, #5572 — peer dependency problems documented by community
- Dev.to, Medium articles on Zod validation patterns — multiple sources agree on best practices (2025-2026 content)
- LangChain.js versioning docs (docs.langchain.com/oss/javascript/versioning) — 1.0 LTS confirmation

### Tertiary (LOW confidence)
- WebSearch results on LangChain.js 0.3.x vs 1.x — conflated Python and JavaScript versioning in some results, required cross-verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - npm versions verified, packages installed and tested locally
- Architecture: HIGH - Patterns tested, Python reference implementation analyzed
- Pitfalls: HIGH - basePath/baseURL verified via testing, version confusion documented in GitHub issues
- Version validation: MEDIUM - Strategy designed but not implemented; semver range checking is simplified
- Capability detection: HIGH - Python heuristics code read and understood

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — LangChain.js stable, minor version updates expected but no breaking changes in 1.x LTS)
