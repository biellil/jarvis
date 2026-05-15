# Phase 70: LLM Config Migration — Research

**Researched:** 2026-05-11
**Domain:** Electron main-process `.env` write-back + electron-store cleanup + UI/IPC strip
**Confidence:** HIGH

## Summary

Phase 70 já tem CONTEXT.md com 20 decisões travadas (D-01..D-20) cobrindo migração, cleanup do electron-store, deleção de UI/IPC/rotas. A pesquisa preenche os gaps técnicos que CONTEXT.md deixou explícitos para Claude's Discretion ou que dependem de comportamento de API verificável:

1. **`.env` write atômico preservando formato.** A combinação certa é (a) ler com `dotenv.parse()` para uma snapshot key→value (apenas para detectar quais keys existem e com qual valor), (b) escrever via um **line-based update/append custom** (~50 linhas) que opera sobre o texto original do arquivo, preservando comments, blank lines, e ordem das keys já existentes. Bibliotecas prontas (`envfile`, `dotenv-stringify`) **destroem** comments porque serializam a partir de um objeto — não atendem D-08 (que adiciona uma key abaixo de `LM_STUDIO_MODEL` com comentário). [VERIFIED: envfile 7.1 GitHub README; npm view envfile@7.1.0]
2. **`process.loadEnvFile()` não sobrescreve `process.env`.** Confirma D-04: rodar migração ANTES dele garante que o spawn do backend-ts (que relê `.env` próprio) pegue o estado novo, e o `process.env` do main fica consistente. Comportamento estável desde Node 24. [CITED: nodejs/node docs + thenodebook.com Env Files article]
3. **`process.loadEnvFile()` joga exceção em arquivo ausente** — o try/catch já existente em `apps/desktop/src/main/index.ts:14-19` cobre isso; D-05 (no-op silencioso quando `.env` ausente) deve seguir o mesmo padrão na migração. [CITED: thenodebook.com]
4. **electron-store é atomic por operação.** Cada `store.delete(key)` faz um write atômico do JSON inteiro. Para deletar 6 keys com **uma única** escrita atômica, use o padrão `store.store = {...store.store}` com `delete` no objeto. Reduz I/O e elimina a janela de inconsistência D-06 (3 keys deletadas, processo morre, próximas 3 ficam). [VERIFIED: sindresorhus/electron-store README atomic-write claim; cross-verified npm electron-store 11.0.2]
5. **`LlmProvider` type ainda é usado em `tokenizer.ts`** que por sua vez é usado SÓ por `LlmSection.tsx` — quando LlmSection sai (D-13), `tokenizer.ts` fica órfão e deve ser deletado, e `LlmProvider` pode sair de `ipc-types.ts` (D-11). Nenhum outro arquivo usa o tipo após o strip.
6. **`window.mcp` consumer único é `McpSection.tsx`**. Após D-13 + D-16, bridge inteiro some sem quebra.
7. **`activeSection` default em SettingsLayout é literal `'ptt'`** (linha 137). Não é nem `'llm'` nem `'mcp-server'` — D-14 nota sobre default está protegido. Ajuste necessário: zero.

**Primary recommendation:** Implementar migração como pure function `migrateLlmConfigToEnv(envContent: string, storeSnapshot: StoreSnapshot): MigrationResult` em arquivo isolado (`apps/desktop/src/main/migrations/llm-config.ts`). Side-effect wrapper trata I/O. Parser/writer custom de ~50 linhas; testar 9 cenários listados em §Test Matrix. Cleanup do electron-store via assignment único `store.store = next` (atomic).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migração + `.env`:**
- **D-01:** `.env` permanece em monorepo root (`apps/desktop/src/main/index.ts:15` inalterado). Localização packaged é P71.
- **D-02:** Conflito → **`.env` vence**. Key ausente OU vazia (`KEY=`) recebe valor do store; key com valor não-vazio é preservada.
- **D-03:** Idempotência sem flag; sem state em electron-store/disk. No-op natural via D-06 (apaga input).
- **D-04:** Hook em `apps/desktop/src/main/index.ts` **ANTES** de `process.loadEnvFile(envPath)` (linha 16). Sequência: migrate → loadEnvFile → spawn backend-ts.
- **D-05:** `.env` ausente → no-op total + warning log. Não cria arquivo.
- **D-06:** Cleanup electron-store de 6 keys após gravação OU após confirmar `.env` venceu. Idempotente.

**Streaming LM Studio Events:**
- **D-07:** `streamingLMStudioEventsEnabled` → `USE_LM_STUDIO_STREAMING_EVENTS` no `.env` como `true`/`false` literal. Backend já tem Zod `z.coerce.boolean()`.
- **D-08:** `.env.example` ganha `USE_LM_STUDIO_STREAMING_EVENTS=false` com comentário, posicionado abaixo de `LM_STUDIO_MODEL`.

**Backend reload — restart-only:**
- **D-09:** Sem watcher LLM, sem hot reload. Restart = restart do processo Electron.
- **D-10:** Deletar `apps/backend-ts/src/routes/reload-llm.ts` + remover de `app.ts:6,40`.
- **D-11:** Deletar IPCs Electron: `LLM_SET_PROVIDER`, `RELOAD_LLM`, `STREAMING_LM_STUDIO_EVENTS_SET` + preload bridge methods + channels + types `ReloadLlmRequest`/`LlmProvider` em ipc-types (planner avalia LlmProvider).
- **D-12:** Deletar broadcast órfão `'llm:provider-changed'` (zero listeners confirmados).

**Settings UI cleanup:**
- **D-13:** Deletar `LlmSection.tsx`, `McpSection.tsx`, e seus tests.
- **D-14:** Strip `SettingsLayout.tsx` (state, handlers, SectionKey, nav, imports, props, types).
- **D-15:** Reload MCP Client button some sem replacement. Env-watcher P65 faz auto-reload.
- **D-16:** Deletar `apps/desktop/src/main/ipc/mcp-settings.ts` inteiro + `window.mcp` bridge + channels `MCP_CLIENT_*` + type `McpClientStatus` + call em `apps/desktop/src/main/ipc/index.ts:36`.
- **D-17:** Apagar de `store.ts`: schema entries (6) + accessors (10 funções, ~120 linhas).
- **D-18:** Atualizar payload `settings:get` (linhas 83-93 de `ipc/settings.ts`).
- **D-19:** Atualizar mocks em `apps/desktop/src/main/ipc/__tests__/settings.test.ts`.

**MCP HTTP routes:**
- **D-20:** Default = deletar `apps/backend-ts/src/routes/mcp-client.ts` + remoção de `app.ts:7,45`. Recomendação: seguir default.

### Claude's Discretion

- Ordem dos plans (provável: 1=migração+store cleanup, 2=backend routes+`.env.example`, 3=renderer/IPC/tests).
- Estratégia de parser/writer: regex custom (recomendado) vs adicionar `dotenv` como direct dep de `apps/desktop` + writer custom. Recomendação detalhada em §Architecture Patterns.
- Logging da migração: recomendação = informativo curto (`[migration] migrated N keys: KEY1, KEY2, ...`).
- Limpeza de comentários históricos "Phase 57/52/60" em arquivos remanescentes — baixa prioridade.

### Deferred Ideas (OUT OF SCOPE)

- `.env` location em packaged app (P71).
- Hot reload via env-watcher (decisão consciente, reavaliar futuro milestone).
- `/internal/reload-llm` como dev tool (D-10 deleta; preservar só se planner identificar use case).
- Refactor de `LlmProvider` type — pesquisado: type fica órfão após strip, deletar é seguro (§Integration Map).
- Schema version prefix em electron-store (overengineered).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SIMP-01** | Settings UI sem seção "LLM Provider" — dropdown/keys/URL desaparecem | D-13/D-14 deletam `LlmSection.tsx` + state/handlers/nav em `SettingsLayout.tsx`. Confirmado em §Integration Map: zero consumers externos após strip. |
| **SIMP-02** | Settings UI sem seção "Servidor MCP" | D-13/D-14 deletam `McpSection.tsx` + nav `mcp-server`. D-16 derruba `window.mcp` bridge + IPC handlers; único consumer (`McpSection`) some. |
| **SIMP-03** | Migração automática de configs existentes para `.env` | Migração pure function + atomic write (§Architecture Pattern 1). Hook D-04 antes de `process.loadEnvFile()`. Idempotência via D-03/D-06. |
| **SIMP-04** | Backend lê todas as keys LLM do `.env`; restart aplica mudanças | `apps/backend-ts/src/llm/config.ts:12-32` JÁ está implementado (Zod schema com defaults). P70 não toca esse arquivo. "Restart aplica" = restart de processo Electron (D-09). |

## Project Constraints (from CLAUDE.md)

- **Stack relevante**: o monorepo é Python/Node/TypeScript Electron+Express. Este phase opera no lado Node/TS (Electron main + backend-ts Express). CLAUDE.md descreve um stack Python para o "JARVIS conceptual" — não usado neste phase.
- **Conventional Commits + emoji**: commits em PT-BR seguindo `<emoji> <type>(scope): description`. Exemplos típicos: `♻️ refactor(70): migrar config LLM para .env`, `🔧 chore(70): remover handlers IPC obsoletos`.
- **Privacy-first**: chave LLM saindo de electron-store JSON plaintext para `.env` controlado por OS file perms = melhoria de superfície (D-06 deleta keys após migrar — não acumula plaintext em 2 lugares).
- **GSD Workflow enforcement**: phase deve rodar via `/gsd:execute-phase`. Sem edits ad-hoc.
- **Sem UI obrigatória**: alinhado com o phase — remove UI, mantém funcionalidade.

## Standard Stack

### Core (já no monorepo)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dotenv` | 17.4.2 | Parser de `.env` (`parse()` apenas) | Já presente em `apps/backend-ts/package.json`; usado em `apps/backend-ts/src/mcp/client/env-diff.ts:8`. **Pure function**, sem side effects. Confiável. [VERIFIED: npm view dotenv@17.4.2] |
| `electron-store` | 11.0.2 | Wrapper sobre JSON em `app.getPath('userData')/config.json` | Já presente em `apps/desktop/package.json:19`. Writes atomic per-operation. [VERIFIED: npm view electron-store@11.0.2] |
| `node:process` (stdlib) | Node 21+ | `process.loadEnvFile(path)` | Sem dep nova; já em uso em `apps/desktop/src/main/index.ts:16`. **Não sobrescreve** keys existentes em `process.env`. [VERIFIED: nodejs.org docs] |
| `node:fs` (stdlib) | — | `readFileSync`, `writeFileSync`, `renameSync` | Para o atomic write pattern (temp file + rename). |
| `vitest` | 4.1.2 | Test runner do desktop app | `apps/desktop/package.json:54`. Mesmo runner usado por `settings.test.ts`. |

### Alternativas Consideradas e Rejeitadas

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parser/writer custom (~50 linhas) | `envfile` 7.1.0 npm package | **REJEITADO**: `stringify({key:val})` perde comments e blank lines do `.env` original. Nosso `.env` tem 7+ seções comentadas (`# ==== LLM ====`, etc.) que o usuário deve ver preservadas. [VERIFIED: bevry/envfile GitHub README] |
| Parser/writer custom | `dotenv-stringify` | Mesmo problema: serializa de um objeto, sem awareness do texto original. [CITED: npmjs] |
| Parser/writer custom | Adicionar `dotenv` como direct dep de `apps/desktop` | **OPCIONAL**: viável para `parse()` apenas (mais robusto que regex pra detectar quoted/multiline). Custo: 1 linha no `package.json`; lib já no monorepo. Recomendação no §Architecture Pattern 1: usar via dependency hoisting do pnpm (sem mudança no package.json) OU regex puro. |
| `process.loadEnvFile()` | `dotenv.config()` | **REJEITADO**: já temos `loadEnvFile` em uso (linha 16); mudar adiciona dep desnecessária. |
| `store.delete(k)` × 6 | `store.store = next` único write | **RECOMENDADO** o segundo: 1 write atômico vs 6. Crash-safe. [VERIFIED: sindresorhus/electron-store] |
| `write-file-atomic` npm | Manual temp+rename via `fs.renameSync` | **RECOMENDADO** o manual: dep nova é overhead. POSIX `rename` é atomic no mesmo filesystem; Windows é ~atomic via `MoveFileEx`. Para uso pessoal/desktop, acceptable. |

**Installation:** nenhuma instalação nova necessária — todas deps já estão no monorepo.

**Version verification:**
- `npm view dotenv version` → 17.4.2 ✓
- `npm view electron-store version` → 11.0.2 ✓
- `npm view envfile version` → 7.1.0 (REJEITADO por destruir comments) ✓

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop/src/main/
├── migrations/
│   ├── llm-config.ts          # NEW — pure function migrateLlmConfigToEnv()
│   └── __tests__/
│       └── llm-config.test.ts # NEW — 9 cenários do test matrix
├── index.ts                   # MODIFIED — chama migration antes de loadEnvFile
├── store.ts                   # MODIFIED — strip ~120 linhas (schema + accessors)
├── ipc/
│   ├── index.ts               # MODIFIED — remove import + call de setupMcpSettingsHandlers
│   ├── settings.ts            # MODIFIED — strip 3 handlers (LLM_SET_PROVIDER, RELOAD_LLM, STREAMING_LM_STUDIO_EVENTS_SET) + payload
│   ├── mcp-settings.ts        # DELETED
│   └── __tests__/
│       └── settings.test.ts   # MODIFIED — strip mocks LLM/streaming events
├── preload/
│   └── settings.ts            # MODIFIED — strip reloadLlm, setLlmProvider, setStreamingLMStudioEvents, mcp bridge
└── shared/
    └── ipc-types.ts           # MODIFIED — strip channels + types (LlmProvider, ReloadLlmRequest, McpClientStatus)

apps/desktop/src/renderer/src/
├── settings/
│   ├── SettingsLayout.tsx     # MODIFIED — strip state/handlers/nav/types (D-14)
│   ├── sections/
│   │   ├── LlmSection.tsx     # DELETED
│   │   ├── McpSection.tsx     # DELETED
│   │   └── __tests__/
│   │       ├── LlmSection.test.tsx  # DELETED
│   │       └── McpSection.test.tsx  # DELETED (verificar existência)
└── lib/
    └── tokenizer.ts           # DELETED — único consumer era LlmSection

apps/backend-ts/src/
├── app.ts                     # MODIFIED — strip imports + app.use de reload-llm e mcp-client
└── routes/
    ├── reload-llm.ts          # DELETED
    └── mcp-client.ts          # DELETED (D-20 default)

.env.example                   # MODIFIED — adicionar USE_LM_STUDIO_STREAMING_EVENTS=false
```

### Pattern 1: Pure-function migration + atomic side-effect wrapper

**What:** Função pura testável recebe `(envContent, storeSnapshot)` e retorna `{ newEnvContent, keysToDelete, logSummary }`. Side effects (read file, write file atomico, store cleanup) ficam num wrapper.

**When to use:** P65 + P68 já adotaram. Phase 70 segue o mesmo padrão.

**Example:**

```typescript
// apps/desktop/src/main/migrations/llm-config.ts

import { parse as parseDotenv } from 'dotenv';

/** Keys que sairão do electron-store para o .env */
export const LLM_STORE_KEYS = [
  'llmProvider',
  'lmStudioUrl',
  'geminiApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'streamingLMStudioEventsEnabled',
] as const;

/** Snapshot do electron-store para input puro à migração */
export interface LlmStoreSnapshot {
  llmProvider?: 'lmstudio' | 'openai' | 'anthropic' | 'gemini';
  lmStudioUrl?: string;
  geminiApiKey?: { key: string };       // shape de electron-store (D-04 do P57)
  openaiApiKey?: { key: string };
  anthropicApiKey?: { key: string };
  streamingLMStudioEventsEnabled?: boolean;
}

/** Mapeamento store key → .env key (D-07) */
const STORE_TO_ENV: Record<string, string> = {
  llmProvider: 'LLM_PROVIDER',
  lmStudioUrl: 'LM_STUDIO_URL',
  geminiApiKey: 'GEMINI_API_KEY',
  openaiApiKey: 'OPENAI_API_KEY',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  streamingLMStudioEventsEnabled: 'USE_LM_STUDIO_STREAMING_EVENTS',
};

export interface MigrationResult {
  newEnvContent: string;
  keysToDelete: typeof LLM_STORE_KEYS[number][];
  migratedKeys: string[];   // .env keys efetivamente escritas
  skippedKeys: string[];    // .env já tinha valor, pulou (D-02)
}

/**
 * Pure function. No I/O.
 *
 * Para cada key do store:
 *   - Se .env já tem com valor não-vazio → skip (D-02), mas ainda marca pra delete (D-06).
 *   - Se .env não tem OU tem vazio → escreve no .env, marca pra delete.
 *   - Se store também não tem → no-op total para essa key.
 */
export function migrateLlmConfigToEnv(
  envContent: string,
  storeSnapshot: LlmStoreSnapshot,
): MigrationResult {
  const parsed = parseDotenv(envContent);
  const migrated: string[] = [];
  const skipped: string[] = [];
  const keysToDelete: typeof LLM_STORE_KEYS[number][] = [];
  let newEnvContent = envContent;

  for (const storeKey of LLM_STORE_KEYS) {
    const envKey = STORE_TO_ENV[storeKey];
    const storeValue = extractStoreValue(storeSnapshot, storeKey);
    if (storeValue === undefined) continue; // nada no store → nada a fazer

    const envValue = parsed[envKey];
    const envHasValue = envValue !== undefined && envValue !== '';

    if (envHasValue) {
      // .env vence (D-02). Apenas marca pra apagar do store (D-06).
      skipped.push(envKey);
      keysToDelete.push(storeKey);
    } else {
      // .env vazio ou ausente → escreve.
      newEnvContent = upsertEnvKey(newEnvContent, envKey, storeValue);
      migrated.push(envKey);
      keysToDelete.push(storeKey);
    }
  }

  return { newEnvContent, keysToDelete, migratedKeys: migrated, skippedKeys: skipped };
}

/** Extrai valor scalar de uma key do store (unwrap das wrappers {key:...} de API keys). */
function extractStoreValue(snap: LlmStoreSnapshot, storeKey: typeof LLM_STORE_KEYS[number]): string | undefined {
  switch (storeKey) {
    case 'llmProvider':
      return snap.llmProvider;
    case 'lmStudioUrl':
      return snap.lmStudioUrl && snap.lmStudioUrl.length > 0 ? snap.lmStudioUrl : undefined;
    case 'geminiApiKey':
      return snap.geminiApiKey?.key && snap.geminiApiKey.key.length > 0 ? snap.geminiApiKey.key : undefined;
    case 'openaiApiKey':
      return snap.openaiApiKey?.key && snap.openaiApiKey.key.length > 0 ? snap.openaiApiKey.key : undefined;
    case 'anthropicApiKey':
      return snap.anthropicApiKey?.key && snap.anthropicApiKey.key.length > 0 ? snap.anthropicApiKey.key : undefined;
    case 'streamingLMStudioEventsEnabled':
      // Boolean → 'true'/'false' literal (D-07)
      return snap.streamingLMStudioEventsEnabled === true ? 'true' :
             snap.streamingLMStudioEventsEnabled === false ? 'false' : undefined;
  }
}

/**
 * Upsert key→value no texto do .env preservando comments + blank lines.
 * - Se a key já existe (mesmo vazia): substitui APENAS aquela linha.
 * - Se a key não existe: appenda ao fim do arquivo com um newline garantido.
 *
 * Regex match: ^<key>=.*$  (linha que começa com a key, ignora comments)
 */
function upsertEnvKey(content: string, key: string, value: string): string {
  const serialized = serializeEnvValue(value);
  const line = `${key}=${serialized}`;
  const lineRegex = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');

  if (lineRegex.test(content)) {
    return content.replace(lineRegex, line);
  } else {
    const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
    return `${content}${sep}${line}\n`;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Serializa valor para .env:
 * - Sem espaços/aspas/comments/newlines → bare: KEY=value
 * - Com qualquer um dos acima → double-quoted com escape de " e \n.
 */
function serializeEnvValue(value: string): string {
  const needsQuoting = /[\s"'#\n]/.test(value);
  if (!needsQuoting) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `"${escaped}"`;
}
```

**Side-effect wrapper:**

```typescript
// apps/desktop/src/main/migrations/llm-config-runner.ts
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { migrateLlmConfigToEnv, LLM_STORE_KEYS, type LlmStoreSnapshot } from './llm-config.js';
import store from '../store.js';

export function runLlmConfigMigration(envPath: string): void {
  if (!existsSync(envPath)) {
    console.warn(`[migration] .env not found at ${envPath}, skipping`);
    return;
  }

  // Snapshot do store via getters diretos (não dependem dos accessors que serão deletados).
  const snapshot: LlmStoreSnapshot = {
    llmProvider: store.get('llmProvider') as LlmStoreSnapshot['llmProvider'],
    lmStudioUrl: store.get('lmStudioUrl') as string | undefined,
    geminiApiKey: store.get('geminiApiKey') as { key: string } | undefined,
    openaiApiKey: store.get('openaiApiKey') as { key: string } | undefined,
    anthropicApiKey: store.get('anthropicApiKey') as { key: string } | undefined,
    streamingLMStudioEventsEnabled: store.get('streamingLMStudioEventsEnabled') as boolean | undefined,
  };

  // No-op se nada no store (idempotência D-03 após primeira run).
  const hasAnything = LLM_STORE_KEYS.some((k) => snapshot[k] !== undefined);
  if (!hasAnything) return;

  const envContent = readFileSync(envPath, 'utf-8');
  const result = migrateLlmConfigToEnv(envContent, snapshot);

  // Write atômico: temp file + rename. Mesmo FS = atomic em POSIX.
  if (result.migratedKeys.length > 0) {
    const tmpPath = `${envPath}.tmp-${process.pid}`;
    writeFileSync(tmpPath, result.newEnvContent, 'utf-8');
    renameSync(tmpPath, envPath);
  }

  // Cleanup electron-store: 1 write atômico (vs 6 separados).
  if (result.keysToDelete.length > 0) {
    const current = { ...store.store } as Record<string, unknown>;
    for (const k of result.keysToDelete) delete current[k];
    store.store = current as never;
  }

  if (result.migratedKeys.length > 0 || result.skippedKeys.length > 0) {
    console.log(
      `[migration] LLM config: migrated ${result.migratedKeys.length} key(s) to .env [${result.migratedKeys.join(', ')}]; ` +
      `${result.skippedKeys.length} already present [${result.skippedKeys.join(', ')}]; ` +
      `${result.keysToDelete.length} store key(s) cleaned`,
    );
  }
}
```

### Pattern 2: Atomic write via temp file + rename

**What:** Escrever para `<target>.tmp-<pid>`, depois `renameSync` para o alvo final. Crash entre write e rename deixa o `.env` original intacto.

**When to use:** Qualquer write em arquivo onde corrupção pós-crash é inaceitável. Para `.env`, corrupção significa perda silenciosa de keys que o usuário editou manualmente.

**Caveats:**
- `fs.renameSync` é atomic no mesmo filesystem em POSIX; em Windows é "best-effort atomic" via `MoveFileEx`. [CITED: nodejs.org fs docs]
- **Não** garante durabilidade pós-crash sem `fsync` — mas para nosso caso (uso pessoal, dev mode), aceitar essa janela é razoável.
- Se planner quiser durabilidade total: adicionar `write-file-atomic` (1 dep, ~30 LOC trade-off). **Não recomendado** — overhead acima do benefício.

### Pattern 3: electron-store atomic batch delete

```typescript
const current = { ...store.store };
for (const k of keysToDelete) delete current[k];
store.store = current;
```

vs naive:

```typescript
for (const k of keysToDelete) store.delete(k); // 6 file writes
```

Reasoning: `store.store = obj` faz 1 write atômico para o JSON inteiro. Mesma garantia de atomicidade, 1/6 do I/O, e elimina a janela de "deletou 3 de 6 e crashou".

### Anti-Patterns to Avoid

- **`envfile.stringify({...parsed, NEW_KEY: 'val'})`**: destrói comments e ordem original. NÃO usar.
- **Append-only**: `fs.appendFileSync` ignora keys já existentes — viola D-02 (precisamos detectar key vazia explicitamente para substituir).
- **`dotenv.config({ path, override: true })`**: muta `process.env` em memória mas NÃO escreve no arquivo. Não resolve nada aqui.
- **`store.delete(k)` em loop sem batch**: 6× I/O e atomicidade só por-chamada. Pattern 3 é estritamente superior.
- **Migrar dentro do `await app.whenReady()`**: tarde demais; backend-ts já foi spawnado. Migração precisa rodar antes de `process.loadEnvFile` (linha 16 atual).
- **Criar `.env` quando ausente**: violaria D-05 + criaria arquivo sem template. P71 é quem lida com packaged path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsear `.env` para snapshot key→value | Regex que tente cobrir todos os casos de `.env` (quoted, multiline, escapes) | `dotenv.parse(content)` | Já está no monorepo; lida com quoted (`"`, `'`, `` ` ``), comments, escape sequences. [VERIFIED] |
| Detectar mudança de schema/migrações futuras | Sistema de versioning ad-hoc | (não aplicável aqui) | Phase 70 não precisa de version prefix; D-06 elimina input. CONTEXT.md §Deferred lista como overengineered. |
| Atomic JSON write para electron-store | Lock file próprio, write+rename manual | `store.store = next` (a lib já faz atomic write internamente) | electron-store usa lockless atomic file rewrite. [VERIFIED: sindresorhus/electron-store README] |

**Key insight:** O escopo do código novo é **uma pure function + um wrapper** (~80 LOC total). A maior parte do phase é deletion — não há lugar para reinventar nada.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | electron-store JSON em `app.getPath('userData')/config.json` — 6 keys LLM (llmProvider, lmStudioUrl, geminiApiKey, openaiApiKey, anthropicApiKey, streamingLMStudioEventsEnabled). Detalhes em `apps/desktop/src/main/store.ts:49-63`. | Data migration ativa (D-03/D-06): copiar valores não-vazios para `.env`, deletar do JSON. Pure function + atomic batch delete. |
| **Live service config** | Nenhum. `.env` é a config — não há UI/DB externo. | None — verificado por grep `LLM_PROVIDER` em todo o monorepo. |
| **OS-registered state** | Nenhum. Sem Task Scheduler, sem launchd plists, sem systemd. JARVIS é app desktop frameless. | None — confirmado por inspeção do `app.whenReady()` em `apps/desktop/src/main/index.ts`. |
| **Secrets/env vars** | `.env` contém `JARVIS_API_KEY`, `ELEVENLABS_API_KEY`, `MURF_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`. Phase 70 escreve nas 3 últimas + adiciona `USE_LM_STUDIO_STREAMING_EVENTS`. Nomes não mudam — código que lê (`apps/backend-ts/src/llm/config.ts:12-32`) JÁ usa essas constantes. | None — só write-back de valores no mesmo nome de key. |
| **Build artifacts / installed packages** | Nenhum afetado. Phase 70 não muda `package.json` (não adiciona/remove deps). `dist/` regenera no próximo `pnpm dev` automaticamente. | None — verificado: nenhuma dep nova; `electron-vite dev` rebuilda incremental. |

## Common Pitfalls

### Pitfall 1: `process.loadEnvFile()` throws on missing `.env`

**What goes wrong:** Se rodarmos a migração e depois `process.loadEnvFile(envPath)` para um path inexistente, o Electron crasha no boot.
**Why it happens:** Comportamento documentado de `loadEnvFile` (≠ `--env-file` flag). [CITED: thenodebook.com Env Files]
**How to avoid:** Manter o try/catch existente em `index.ts:14-19`. Migração também precisa fazer `existsSync` antes de ler (D-05).
**Warning signs:** Boot crash em ambiente onde `.env` nunca foi criado (CI? builds frescos?).

### Pitfall 2: `process.loadEnvFile` **não sobrescreve** valores já em `process.env`

**What goes wrong:** Se algum env var for set via shell antes do Electron iniciar (ex: `LM_STUDIO_URL=foo electron .`), o valor no `.env` migrado **não** vai sobrescrever — fica o do shell.
**Why it happens:** Default conservador: arquivo preenche missing, shell wins. [CITED: thenodebook.com; cross-verified com motdotla/dotenv issue #115]
**How to avoid:** Documentar no log da migração. Para LLM keys, usuário normalmente NÃO define via shell — usa `.env`. Caso de borda aceitável.
**Warning signs:** "Mudei `LLM_PROVIDER` no `.env` e restartei mas continua o antigo" → checar shell env via `env | grep LLM_`.

### Pitfall 3: Migração roda DEPOIS de `process.loadEnvFile`

**What goes wrong:** Se invertermos a ordem (load primeiro, migrate depois), `process.env` fica com valores antigos durante o boot — o spawn do backend-ts pode herdar config errada se Plan implementar `getEnv` em vez de re-`loadEnvFile`.
**Why it happens:** Backend-ts é spawnado por `backend-client.ts` que herda `process.env`. Hoje backend-ts faz seu próprio `dotenv.config()`/`loadEnvFile` interno — mas a regra "migrate antes de load" é o invariante seguro.
**How to avoid:** D-04 explícito: `migrateLlmConfigToEnv()` antes da linha 16 de `index.ts`.
**Warning signs:** Backend-ts iniciando com provider "antigo" enquanto `.env` em disco já tem o novo.

### Pitfall 4: Quoted/multiline values no `.env` existente

**What goes wrong:** Custom regex `^KEY=.*$/m` faz match na primeira linha — se o valor for multi-linha quoted (`KEY="line1\nline2"`), pode capturar apenas a primeira linha e deixar `line2"` órfã.
**Why it happens:** `.` no regex não captura `\n` por padrão; um valor multilinha quoted ocupa múltiplas linhas no arquivo.
**How to avoid:** Para LLM keys (provider, URL, API keys, boolean) **nenhuma é multilinha**. Documentar no código que `upsertEnvKey` assume single-line values. Se planner quiser robustez total, adicionar guard: detectar `KEY="` sem `"` na mesma linha e rejeitar com error claro (cenário improvável).
**Warning signs:** Arquivo `.env` corrompido após migração; valores partidos.

### Pitfall 5: Trailing newline policy

**What goes wrong:** Se o `.env` original termina sem `\n` e appendamos uma key com `\n` no início, fica `KEY1=val\nKEY2=newval` colado. Se termina com `\n` e appendamos `\nKEY2=val`, fica blank line dupla.
**Why it happens:** POSIX convention é trailing newline; nem todo editor força.
**How to avoid:** Pattern 1 já cobre: `content.endsWith('\n') ? '' : '\n'` antes do append.
**Warning signs:** Comments visualmente colados em keys novas; blank lines aparecendo do nada.

### Pitfall 6: electron-store wrapper shapes (`{ key: string }` vs scalar)

**What goes wrong:** Esquecer de unwrap `.key` na migração das API keys → `.env` recebe `[object Object]` como valor.
**Why it happens:** Phase 57 D-04 envolveu API keys em `{ key: string }` para diferenciar "não setado" de "string vazia". Provider, URL e boolean são scalars.
**How to avoid:** `extractStoreValue()` em Pattern 1 trata explicitamente cada key. Test matrix exige cobertura.
**Warning signs:** Linha `OPENAI_API_KEY=[object Object]` no `.env`.

### Pitfall 7: Boolean serialization para Zod `z.coerce.boolean()`

**What goes wrong:** Escrever `USE_LM_STUDIO_STREAMING_EVENTS=true` vs `=1` vs `=yes` — `z.coerce.boolean()` é lenient mas pode surpreender.
**Why it happens:** `Boolean(s)` em JS é truthy para qualquer string não-vazia — `"false"` vira `true`. Zod `z.coerce.boolean()` segue o mesmo: `coerce(s) === !!s`.
**How to avoid:** **NÃO** confiar em coerce naive. O schema do backend (`apps/backend-ts/src/llm/config.ts:23`) já tem `z.coerce.boolean()` — mas o Zod 4.x trata strings `"true"`/`"false"` corretamente em casos comuns. Recomendado: serializar literal `true` / `false` (lowercase) — esse é o formato canônico e o que `.env.example` também terá (D-08).
**Warning signs:** Toggle aparentemente "sempre on" mesmo com `.env` = `false`. Vou verificar com Plan-phase se o backend faz Zod coerce ou parsing custom — research nota que linha 23 do `config.ts` usa `z.coerce.boolean().default(false)` que **trata `"false"` como `true`** em Zod 3.x. Pode ser bug latente — flag para discuss.

> **CRITICAL [ASSUMED]:** Comportamento de `z.coerce.boolean()` com string `"false"` no Zod 4.x. Em Zod 3.x esse coerce é ingênuo (qualquer string truthy → true). Planner DEVE confirmar contra Zod 4.3.6 (`apps/backend-ts/package.json:20`). Se for ingênuo, **mudar D-07** para usar `USE_LM_STUDIO_STREAMING_EVENTS` apenas como "presença = true; ausência = false" OU substituir o schema por `z.preprocess(v => v === 'true', z.boolean())`. **Não fazer commit da migração sem verificar.** [CITED: zod.dev coerce docs]

## Code Examples

### Example 1: Hook point em `index.ts` (D-04)

```typescript
// apps/desktop/src/main/index.ts (around lines 12-19)
import path from 'node:path';
import process from 'node:process';
import { runLlmConfigMigration } from './migrations/llm-config-runner.js';  // NEW

const envPath = path.resolve(import.meta.dirname ?? __dirname, '../../../../.env');

// NEW — Phase 70: migrate LLM config from electron-store to .env BEFORE loadEnvFile.
try {
  runLlmConfigMigration(envPath);
} catch (err) {
  console.error('[migration] LLM config migration failed (non-fatal):', err);
  // Non-fatal — boot continua; backend ainda lê .env como está.
}

// EXISTING (linha 16 atual) — agora lê arquivo já atualizado pela migration.
try {
  process.loadEnvFile(envPath);
} catch {
  // .env é opcional — loadBackendConfig fail-fast em vars obrigatórias.
}
```

### Example 2: `.env.example` update (D-08)

Inserir abaixo de `LM_STUDIO_MODEL=` (linha 10 do arquivo atual):

```diff
 # LM Studio (used when LLM_PROVIDER=lmstudio)
 # For Docker: use http://host.docker.internal:1234/v1 (Linux requires extra_hosts: host-gateway)
 LM_STUDIO_URL=http://localhost:1234/v1
 LM_STUDIO_MODEL=
+# true = usa SSE nativo /api/v1/chat do LM Studio (mais rápido)
+# false = fallback OpenAI-compat (default seguro)
+USE_LM_STUDIO_STREAMING_EVENTS=false
+
+# Google Gemini (used when LLM_PROVIDER=gemini)
+GEMINI_API_KEY=
```

(Planner verifica se `GEMINI_API_KEY=` já está em `.env.example` — atual snapshot mostra apenas OPENAI/ANTHROPIC. Se ausente, adicionar.)

### Example 3: Test matrix (D-09 pure function pattern)

```typescript
// apps/desktop/src/main/migrations/__tests__/llm-config.test.ts
import { describe, it, expect } from 'vitest';
import { migrateLlmConfigToEnv } from '../llm-config.js';

describe('migrateLlmConfigToEnv', () => {
  it('no-op when store is empty', () => {
    const result = migrateLlmConfigToEnv('LLM_PROVIDER=lmstudio\n', {});
    expect(result.migratedKeys).toEqual([]);
    expect(result.keysToDelete).toEqual([]);
    expect(result.newEnvContent).toBe('LLM_PROVIDER=lmstudio\n');
  });

  it('writes all keys when .env is empty', () => {
    const result = migrateLlmConfigToEnv('', {
      llmProvider: 'openai',
      openaiApiKey: { key: 'sk-test' },
    });
    expect(result.migratedKeys).toEqual(['LLM_PROVIDER', 'OPENAI_API_KEY']);
    expect(result.newEnvContent).toBe('LLM_PROVIDER=openai\nOPENAI_API_KEY=sk-test\n');
  });

  it('preserves .env when it has non-empty value (D-02)', () => {
    const env = 'LLM_PROVIDER=lmstudio\n';
    const result = migrateLlmConfigToEnv(env, { llmProvider: 'openai' });
    expect(result.newEnvContent).toBe(env);  // unchanged
    expect(result.skippedKeys).toEqual(['LLM_PROVIDER']);
    expect(result.keysToDelete).toEqual(['llmProvider']);  // ainda apaga (D-06)
  });

  it('overwrites .env when key exists but is empty (D-02)', () => {
    const env = 'LLM_PROVIDER=\n';
    const result = migrateLlmConfigToEnv(env, { llmProvider: 'openai' });
    expect(result.newEnvContent).toBe('LLM_PROVIDER=openai\n');
    expect(result.migratedKeys).toEqual(['LLM_PROVIDER']);
  });

  it('preserves comments and blank lines', () => {
    const env = '# LLM section\nLLM_PROVIDER=\n\n# Other\nFOO=bar\n';
    const result = migrateLlmConfigToEnv(env, { llmProvider: 'openai' });
    expect(result.newEnvContent).toBe('# LLM section\nLLM_PROVIDER=openai\n\n# Other\nFOO=bar\n');
  });

  it('serializes boolean as "true"/"false" literal (D-07)', () => {
    const result = migrateLlmConfigToEnv('', { streamingLMStudioEventsEnabled: true });
    expect(result.newEnvContent).toContain('USE_LM_STUDIO_STREAMING_EVENTS=true');

    const result2 = migrateLlmConfigToEnv('', { streamingLMStudioEventsEnabled: false });
    expect(result2.newEnvContent).toContain('USE_LM_STUDIO_STREAMING_EVENTS=false');
  });

  it('unwraps {key: string} for API keys', () => {
    const result = migrateLlmConfigToEnv('', {
      geminiApiKey: { key: 'AIzaSy-test' },
    });
    expect(result.newEnvContent).toBe('GEMINI_API_KEY=AIzaSy-test\n');
  });

  it('idempotent — second run no-op after store cleanup', () => {
    // simula segunda boot: store já vazio (D-06)
    const env = 'LLM_PROVIDER=openai\nOPENAI_API_KEY=sk-test\n';
    const result = migrateLlmConfigToEnv(env, {});
    expect(result.migratedKeys).toEqual([]);
    expect(result.keysToDelete).toEqual([]);
    expect(result.newEnvContent).toBe(env);
  });

  it('mixed: some keys win in .env, some win in store', () => {
    const env = 'LLM_PROVIDER=lmstudio\nOPENAI_API_KEY=\n';
    const result = migrateLlmConfigToEnv(env, {
      llmProvider: 'openai',         // .env vence
      openaiApiKey: { key: 'sk-x' }, // .env vazio → store vence
      lmStudioUrl: 'http://foo:1234',// não estava no .env → store escreve
    });
    expect(result.skippedKeys).toEqual(['LLM_PROVIDER']);
    expect(result.migratedKeys).toEqual(['OPENAI_API_KEY', 'LM_STUDIO_URL']);
    expect(result.newEnvContent).toContain('LLM_PROVIDER=lmstudio');
    expect(result.newEnvContent).toContain('OPENAI_API_KEY=sk-x');
    expect(result.newEnvContent).toContain('LM_STUDIO_URL=http://foo:1234');
    expect(result.keysToDelete).toEqual(['llmProvider', 'lmStudioUrl', 'openaiApiKey']);
  });
});
```

## Integration Map

### What deletes vs what mutates

| File | Action | Notes |
|------|--------|-------|
| `apps/desktop/src/main/migrations/llm-config.ts` | **CREATE** | Pure function |
| `apps/desktop/src/main/migrations/llm-config-runner.ts` | **CREATE** | I/O wrapper |
| `apps/desktop/src/main/migrations/__tests__/llm-config.test.ts` | **CREATE** | 9 cenários |
| `apps/desktop/src/main/index.ts` | MUTATE | +5 linhas hook D-04 |
| `apps/desktop/src/main/store.ts` | MUTATE | −~120 linhas (6 schema entries + 10 accessors); -1 import (`LlmProvider`) |
| `apps/desktop/src/main/ipc/settings.ts` | MUTATE | −~135 linhas: imports (10 mocks), payload 7 fields, 3 handlers (LLM_SET_PROVIDER 226-238, STREAMING_LM_STUDIO_EVENTS_SET 278-309, RELOAD_LLM 315-369) |
| `apps/desktop/src/main/ipc/mcp-settings.ts` | **DELETE** | arquivo inteiro |
| `apps/desktop/src/main/ipc/index.ts` | MUTATE | −2 linhas (import + call de setupMcpSettingsHandlers) |
| `apps/desktop/src/preload/settings.ts` | MUTATE | −~50 linhas (5 channel consts, 4 SettingsApi methods, bloco `mcp` inteiro de 116-140) |
| `apps/desktop/src/shared/ipc-types.ts` | MUTATE | −~30 linhas: type `LlmProvider`, `ReloadLlmRequest`, `McpClientStatus`, channels (LLM_SET_PROVIDER, RELOAD_LLM, STREAMING_LM_STUDIO_EVENTS_*, MCP_CLIENT_*), 7 fields de `SettingsData`, 4 methods de `SettingsApi`, prop `mcp` em window typing |
| `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` | MUTATE | −~80 linhas: imports (LlmSection, McpSection, LlmProvider, ReloadLlmRequest), 6 state vars + setters, 5 handlers (handleLmStudioUrlChange, handleLlmProviderChange, handleStreamingLMStudioEventsChange, handleReloadLlm, anything LLM), `useEffect` listener para `onStreamingLMStudioEventsChanged` (252-258), nav entries 'llm'+'mcp-server' (28,31), SectionKey union, props pass-down em sectionProps, casos 'llm' e 'mcp-server' do switch (525-540, 554-555), prop interfaces `lmStudioUrl..onStreamingLMStudioEventsChange` em SettingsSectionProps (54-78), fetch settings unpack (156-164, 181-183) |
| `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` | **DELETE** | |
| `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` | **DELETE** | |
| `apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx` | **DELETE** | confirmed exists |
| `apps/desktop/src/renderer/src/settings/sections/__tests__/McpSection.test.tsx` | **DELETE** (if exists) | grep mostra que não existe; sem ação |
| `apps/desktop/src/renderer/src/lib/tokenizer.ts` | **DELETE** | único consumer era LlmSection (confirmed via grep) |
| `apps/desktop/src/main/ipc/__tests__/settings.test.ts` | MUTATE | strip mocks LLM (linhas 36-43 do mock block), strip expectations (linhas 289, 322) |
| `apps/backend-ts/src/app.ts` | MUTATE | −4 linhas (imports + 2 `app.use` blocks) |
| `apps/backend-ts/src/routes/reload-llm.ts` | **DELETE** | arquivo inteiro |
| `apps/backend-ts/src/routes/mcp-client.ts` | **DELETE** (D-20 default) | planner pode preservar |
| `.env.example` | MUTATE | adicionar `USE_LM_STUDIO_STREAMING_EVENTS=false` + comentário (D-08); verificar se `GEMINI_API_KEY=` já existe |

### Cascade verifications (done by research, not assumptions)

| Question | Answer | Evidence |
|----------|--------|----------|
| `LlmProvider` type tem consumer fora de LlmSection/SettingsLayout/store.ts/preload/ipc-types? | **Não — só `tokenizer.ts` (que também sai)** | `grep -rn "LlmProvider"` retorna 30+ matches, todos em arquivos que ou serão modificados (store, preload, ipc-types, SettingsLayout) ou serão deletados (LlmSection, tokenizer). Pode deletar o type sem cascade. |
| `window.mcp` tem consumer fora de McpSection? | **Não** | `grep` mostra apenas McpSection.tsx (linhas 45, 74) + preload (definição). Bridge pode sair com D-16. |
| `McpClientStatus` type tem consumer? | Só `mcp-settings.ts` (deletado) + `McpSection.tsx` (deletado) + `preload/settings.ts` (linhas 118-119, deletado) + `ipc-types.ts` (definição) | Type pode sair com D-16 |
| `reloadLlm` chamado em outro lugar? | Só `SettingsLayout.tsx:409` e `LlmSection.tsx` callsite | Strip D-14 cobre |
| `/internal/reload-llm` chamado em outro lugar do backend? | Não — só do Electron via fetch (3 call sites em `settings.ts`) | Strip D-11 elimina os 3 calls |
| Existe `LlmSection.test.tsx`? | Sim — `ls` confirma. **`McpSection.test.tsx` NÃO existe** | D-13 lista ambos como possíveis — somente o LlmSection precisa ser deletado de fato |
| `activeSection` default em SettingsLayout é `'llm'` ou `'mcp-server'`? | **Não** — é `'ptt'` (linha 137) | D-14 não precisa de ajuste de default; só remover entries do array NAV_ITEMS |
| Backend tests para `reload-llm.ts`? | Nenhum encontrado (`grep` em backend-ts) | Sem cascade de teste no backend |
| Backend tests para `mcp-client.ts` (route)? | Verificar antes de deletar (D-20) | grep não encontrou em primeira pesquisa; planner deve fazer pass final |

## State of the Art

| Old Approach (pre-P70) | Current Approach (post-P70) | Why Changed | Impact |
|--------|------|-------|-----|
| LLM config editável via Settings UI (provider dropdown, API key fields, URL input, streaming toggle) | `.env` only; UI sem nenhuma config LLM | SIMP-01: simplificar surface area; privacy (saída de plaintext JSON); v3.1 cleanup | UX: usuário power-user já edita `.env`; usuário casual nunca trocou provider |
| 4 IPCs LLM (`llm:reload`, `llm:set-provider`, `streamingLMStudioEvents:set`) + broadcast `llm:provider-changed` (órfão) | Zero IPCs LLM | D-11/D-12: deletar dead code | -135 LOC em settings.ts, -50 LOC em preload, -30 LOC em ipc-types |
| `POST /internal/reload-llm` backend Express endpoint com Zod validation + SessionLock | Removido | D-10: sem caller; sem hot-reload | -95 LOC backend |
| `electron-store` como source-of-truth para LLM config; backend lia via `.env` mas IPC sobrescrevia | `.env` único source of truth; electron-store somente para preferências não-LLM | D-09: backend já lê `.env` (config.ts:48); IPC parallel-path era complexidade desnecessária | Resolve ambiguidade "qual valor vence?" |
| MCP Section UI (Cliente MCP card com Reconectar button) | Removida | D-15: env-watcher P65 já faz auto-reload em `.env` save; botão era UX redundante | -114 LOC McpSection + -130 LOC mcp-settings.ts |

**Deprecated/outdated:**
- `LlmProvider` TS type — usado só por código que sai. Delete junto com D-11.
- `ReloadLlmRequest` TS type — só usado em IPC handler/preload/SettingsLayout. Delete junto.
- `tokenizer.ts` (`estimateContextTokens`) — usado só por LlmSection. Delete junto.
- `McpClientStatus` TS type — usado só por código que sai. Delete junto.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `z.coerce.boolean()` no Zod 4.3.6 trata string `"false"` como `false` (e não `true`) | Pitfall 7 | **Alto.** Toggle de streaming events fica sempre `true` independente do `.env`. Plan-phase DEVE testar e, se ingênuo, mudar D-07 ou patchear o schema. Já flagged. |
| A2 | `fs.renameSync` é atomic-enough no Windows para .env writes em FS NTFS local | Pattern 2 | **Baixo.** Janela de crash entre rename start e flush é microsegundos; uso pessoal acceptable. Se virar issue, planner pode adicionar `write-file-atomic` dep. |
| A3 | `process.env` mutation in-place pelo `loadEnvFile` é o mecanismo de propagação para `child_process.spawn` (que herda `process.env`) | Pattern 1 (D-04 sequência) | **Baixo.** Comportamento Node padrão; spawn herda parent env por default. Mesmo se houver edge case, backend-ts re-lê `.env` próprio em `config.ts:48`. |
| A4 | Backend-ts spawn lê `.env` direto do disco via seu próprio `loadConfig()` — não depende do `process.env` setado pelo Electron main | Architecture Pattern 1 | **Médio.** Pesquisa não verificou explicitamente — `apps/backend-ts/src/index.ts` startup pode usar `dotenv.config()` ou `process.loadEnvFile()`. Plan-phase deve confirmar. Se backend lê do `process.env` herdado, a sequência D-04 já garante. |
| A5 | Backend-ts não tem test files dedicados para `reload-llm.ts` ou `mcp-client.ts` (routes) | Integration Map cascade table | **Baixo.** Grep não encontrou; mesmo se houver, planner pesquisa antes de delete final. |

## Open Questions (RESOLVED)

1. **Zod 4.x `z.coerce.boolean()` semântica**
   - What we know: Zod 3.x faz coerce ingênuo (`Boolean("false") === true`).
   - What's unclear: Comportamento exato no Zod 4.3.6 (`apps/backend-ts/package.json:20`).
   - Recommendation: Planner cria um quick test (`pnpm vitest run --config ... -t "coerce"`) ou inspeciona `node_modules/zod/lib/.../coerce.js`. Se confirmado ingênuo, **patch sugerido em `apps/backend-ts/src/llm/config.ts:23`**: `USE_LM_STUDIO_STREAMING_EVENTS: z.preprocess((v) => v === 'true', z.boolean()).default(false)`. Não é parte do escopo P70 originalmente mas afeta D-07. **Discutir antes de planejar tasks.**
   - RESOLVED: Plan 02 Task 2 (verify+patch task com vitest guardrail cobrindo 4 cenários incluindo `"false"` → `false`). Se schema atual já trata correto, test fica como guardrail contra regressão; se ingênuo, patch via `z.preprocess` aplicado.

2. **`McpSection.test.tsx` realmente não existe?**
   - What we know: `ls` em 2026-05-11 mostra apenas LlmSection.test.tsx + 3 outros.
   - What's unclear: Se P69 criou e foi mergeado depois.
   - Recommendation: Plan-phase re-confirma via `ls` antes de listar a deleção. Custo de erro: zero (delete inexistente é no-op).
   - RESOLVED: Plan 03 Task 1 step 3 re-verifica via `ls apps/desktop/src/renderer/src/settings/sections/__tests__/` antes de qualquer delete; se contra-expectativa existir, deleta também e reporta. SUMMARY documenta o resultado do `ls`.

3. **`/internal/mcp-client/*` routes — preservar como dev tool?**
   - What we know: D-20 default = deletar. Sem callers após P70 (env-watcher chama `mcpManager.reload()` direto, não via HTTP).
   - What's unclear: Se há valor mantendo para `curl` debugging.
   - Recommendation: Seguir default de D-20 (delete). Reabrir só se planner identificar use case concreto via grep.
   - RESOLVED: Plan 02 Task 1 deleta `apps/backend-ts/src/routes/mcp-client.ts` + remove import/use de `app.ts`, alinhado com CONTEXT.md D-20 default = deletar. Confirmação via cascade grep antes de delete.

4. **Atomic rename em Windows: precisamos de `write-file-atomic`?**
   - What we know: NTFS rename é "best-effort atomic"; cobre 99% dos crashes.
   - What's unclear: Frequência real de corrupção em uso pessoal.
   - Recommendation: Não adicionar dep agora. Se P71 (distribution) detectar issues em smoke test, adiciona depois.
   - RESOLVED: DEFERRED para P71 smoke test — reavaliar se P71 detectar issues. Plan 01 Task 1 mantém `renameSync` + cleanup best-effort de `.tmp` (T-70-03 mitigation) sem adicionar dep nova.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (com `process.loadEnvFile`) | Migration runner + main entry | ✓ | Node 21+ assumido (já em uso `index.ts:16`) | — |
| `dotenv` | Parse function | ✓ | 17.4.2 (monorepo via backend-ts) | Regex parser custom (~20 linhas) se planner preferir zero deps em desktop |
| `electron-store` | Snapshot + cleanup | ✓ | 11.0.2 (`apps/desktop/package.json:19`) | — |
| `vitest` | Test runner | ✓ | 4.1.2 (`apps/desktop/package.json:54`) | — |
| Existing `.env` em monorepo root | Migration source | Likely ✓ em dev; ausente em fresh checkout | — | D-05: no-op silencioso, sem fallback necessário |
| Existing electron-store JSON com keys legadas | Migration input | Likely ✓ em dev existente; ausente em fresh install | — | D-03: idempotent — sem state, no-op natural |

**Missing dependencies with no fallback:** Nenhum.
**Missing dependencies with fallback:** Nenhum bloqueante. Phase pode rodar em qualquer ambiente.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.2 |
| Config file | `apps/desktop/vitest.config.ts` (verificar — provavelmente herda do root) |
| Quick run command | `pnpm --filter @jarvis/desktop test -- --run llm-config` |
| Full suite command | `pnpm --filter @jarvis/desktop test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SIMP-01 | Settings UI sem LLM section | integration (renderer) | `pnpm --filter @jarvis/desktop test -- --run SettingsLayout` | ❌ Wave 0 — SettingsLayout não tem test hoje; verificar se vale criar. **Alternativa**: smoke manual (abrir Settings, conferir ausência) |
| SIMP-02 | Settings UI sem MCP section | integration (renderer) | mesmo de SIMP-01 | ❌ Wave 0 |
| SIMP-03.a | Pure function migrate cobre 9 cenários | unit | `pnpm --filter @jarvis/desktop test -- --run llm-config` | ❌ Wave 0 — arquivo novo |
| SIMP-03.b | Runner executa antes de loadEnvFile + cleanup batch | integration | `pnpm --filter @jarvis/desktop test -- --run llm-config-runner` | ❌ Wave 0 — opcional; pure function cobre lógica, runner é só I/O |
| SIMP-04 | Backend lê `.env` (já está implementado) | smoke | `pnpm --filter @jarvis/backend-ts dev` → checar log de provider em boot | ✅ existing — não precisa cobertura nova |
| Regression: `settings.test.ts` continua passando após strip | unit | `pnpm --filter @jarvis/desktop test -- --run settings` | ✅ existing |

### Sampling Rate

- **Per task commit:** `pnpm --filter @jarvis/desktop test -- --run llm-config settings`
- **Per wave merge:** `pnpm --filter @jarvis/desktop test -- --run` + `pnpm --filter @jarvis/backend-ts test -- --run`
- **Phase gate:** `pnpm test` em todo o monorepo + smoke test manual: (a) boot `pnpm dev`; (b) confirmar Settings sem LLM/MCP; (c) confirmar `.env` populado com valores migrados; (d) confirmar electron-store JSON sem LLM keys; (e) restart e confirmar idempotência (segundo boot é silencioso).

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/migrations/__tests__/llm-config.test.ts` — covers SIMP-03.a com 9 cenários
- [ ] (opcional) `apps/desktop/src/renderer/src/settings/__tests__/SettingsLayout.test.tsx` — covers SIMP-01, SIMP-02 (alternativa: smoke manual)
- [ ] Vitest config / setup: assumir herdado; **se nenhum test existir em `apps/desktop/src/main/migrations/`**, primeiro test do diretório serve como Wave 0 (sem framework install).
- [ ] `apps/backend-ts/src/__tests__/zod-coerce-boolean-sanity.test.ts` — sanity test sugerido (não obrigatório) para Open Question 1.

## Security Domain

> CONTEXT.md `.planning/config.json` não tem `security_enforcement` setting. Por default (ausente = enabled), incluímos. Phase é internal-only, sem network surface nova — escopo de risco é específico.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | (sem auth nova; `JARVIS_API_KEY` no `.env` permanece inalterado) |
| V3 Session Management | no | (sem sessions HTTP novas) |
| V4 Access Control | no | (Electron main = full trust; renderer sandbox já é hardened) |
| V5 Input Validation | yes | `dotenv.parse` é validação de input do `.env`. Zod em `config.ts` valida `LLM_PROVIDER` enum. Custom `upsertEnvKey` regex limitado a key names = `[A-Z_][A-Z0-9_]*`. |
| V6 Cryptography | no | (sem encryption — uso pessoal; `.env` em filesystem perms é o controle) |

### Known Threat Patterns for {Electron main + filesystem}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Race condition em rename concurrent (2× Electron rodando) | Tampering | Para uso pessoal, single-instance via electron-builder. Mesmo se 2× rodar, rename atômico evita corrupção (worst case: um write perdido, .env intacto). |
| API key exfiltrada via `.env` mais legível que electron-store JSON | Info Disclosure | **Mitigado** — `.env` recebe `chmod 600`-like perms por convenção; electron-store JSON era `644`. Trade-off explícito em CONTEXT.md "Privacy > UX rica". |
| Migração roda em loop após cleanup falhar | Denial of Service | D-03 idempotência: snapshot vazio = no-op. Cleanup falhar (D-06) e re-rodar = no-op porque `.env` venceu (D-02). Loop não acontece. |
| `process.env` poisoning via shell antes do Electron iniciar | Tampering | Pitfall 2: comportamento documentado. Migration **não** confia em `process.env` — lê do store JSON e do arquivo. Imune. |
| Injection no `.env` via valor controlado (e.g., API key contém `\n`) | Tampering | `serializeEnvValue` faz quote+escape de newlines (`\n` → `\\n`). API keys conhecidas não têm newlines, mas defesa em profundidade. |
| Symlink attack: usuário faz `.env` → symlink para `/etc/passwd` | Tampering | Migration usa `existsSync` + `readFileSync`/`writeFileSync` no path passado. Em dev, attacker já tem write em monorepo root = ataque inútil. |

## Sources

### Primary (HIGH confidence)

- **`apps/desktop/src/main/store.ts`** (lido em research) — schema entries e accessors a serem removidos
- **`apps/desktop/src/main/index.ts`** (lido) — hook point linha 12-19
- **`apps/desktop/src/main/ipc/settings.ts`** (lido) — handlers a deletar e payload a atualizar
- **`apps/desktop/src/preload/settings.ts`** (lido) — channels e bridge a deletar
- **`apps/desktop/src/shared/ipc-types.ts`** (lido) — types e channels a deletar
- **`apps/desktop/src/renderer/src/settings/SettingsLayout.tsx`** (lido) — state/handlers/nav/section switch a deletar
- **`apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx`** (lido) — confirmado uso de `tokenizer.ts`
- **`apps/desktop/src/renderer/src/settings/sections/McpSection.tsx`** (lido) — único consumer de `window.mcp`
- **`apps/desktop/src/renderer/src/lib/tokenizer.ts`** (lido) — único caller é LlmSection (confirmado por grep)
- **`apps/backend-ts/src/llm/config.ts`** (lido) — Zod schema já correto, não tocar
- **`apps/backend-ts/src/app.ts`** (lido) — imports/use a deletar
- **`apps/backend-ts/src/routes/reload-llm.ts`** (lido) — arquivo a deletar
- **`apps/backend-ts/src/routes/mcp-client.ts`** (lido) — arquivo a deletar (D-20)
- **`apps/backend-ts/src/mcp/client/env-diff.ts`** (lido) — referência: parser pattern com `dotenv.parse`
- **`apps/desktop/src/main/ipc/__tests__/settings.test.ts`** (lido) — mocks a strip
- **`.env.example`** (lido) — estrutura para D-08 update
- **`.planning/phases/70-llm-config-migration/70-CONTEXT.md`** (lido) — 20 decisões
- npm registry: `npm view dotenv@17.4.2 / electron-store@11.0.2 / envfile@7.1.0` — versões verificadas 2026-05-11

### Secondary (MEDIUM confidence)

- [thenodebook.com — Env Files and Configuration Loading](https://www.thenodebook.com/runtime-platform/env-files-configuration) — `process.loadEnvFile` semantics (sync, non-overwriting, throws on missing)
- [nodejs/node Issue #115 (motdotla/dotenv)](https://github.com/motdotla/dotenv/issues/115) — confirmação histórica do default non-override
- [bevry/envfile GitHub README](https://github.com/bevry/envfile) — `stringify({obj})` API confirmed (não preserva comments)
- [sindresorhus/electron-store README](https://github.com/sindresorhus/electron-store) — atomic write claim
- [Node.js fs docs](https://nodejs.org/api/fs.html) — `renameSync` atomicity em POSIX

### Tertiary (LOW confidence)

- Zod `z.coerce.boolean()` exact semantics in v4.3.6 — **flagged como Open Question 1**, planner deve verificar
- Backend-ts spawn comportamento de inheritance de `process.env` — Assumption A4, planner verifica

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as libs já no monorepo e versões verificadas via npm registry
- Architecture: HIGH — padrões pure-function + atomic-batch já em uso (P65, P68); CONTEXT.md já especifica os hooks
- Pitfalls: MEDIUM-HIGH — pitfalls 1-6 verificados; pitfall 7 (Zod coerce) flagged como ASSUMED
- Integration map: HIGH — cada arquivo foi lido; cascade verifications listadas com grep evidence
- Test architecture: HIGH — pattern de pure-function tests bem estabelecido (P65 env-diff, P68 selectWhisperModel); Wave 0 gaps explícitos

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 dias para domínio estável; reavaliar se libs subirem major)
