---
phase: 68-whisper-model-override-fix
reviewed: 2026-05-10T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - apps/desktop/src/main/__tests__/index.main.test.ts
  - apps/desktop/src/main/__tests__/selectWhisperModel.test.ts
  - apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  - apps/desktop/src/main/ipc/whisper.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/main/voiceInput/selectWhisperModel.ts
  - apps/desktop/src/main/voiceInput/whisperModelResolver.ts
  - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
  - apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 68: Code Review Report

**Reviewed:** 2026-05-10
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

A correção do WBUG-01 está implementada de forma cirúrgica e correta: `selectWhisperModel` agora consulta `OPTION_TO_MODEL` (fonte única de mapeamento UI→backend), preservando override explícito do usuário independente do `vramModel` detectado. A remoção de `'auto'` do tipo `WhisperModelOption` é consistente nos pontos auditados (store, IPC, renderer, testes novos), com normalização defensiva (`'auto'` legado → `'base'`) no read path do store e branch defensivo em `selectWhisperModel`.

A matriz de regressão 5×3 em `selectWhisperModel.test.ts` cobre o caso crítico do bug original (`override='small'` + `vramModel='large'` → `'base'`, nunca `'large'`). Testes em `whisper-model-resolver.test.ts` validam mapeamentos diretos e fallback D-12.

Os achados abaixo são todos sobre **arquivos NÃO incluídos no escopo da Phase 68 mas que ficaram inconsistentes** com a mudança de tipo, e sobre **clareza/dead-code** nos arquivos modificados. Nenhum bug funcional, nenhum problema de segurança. O reviewer recomenda corrigir os testes legados antes de fechar a phase para evitar falha de TypeScript build / falso-positivo na suíte.

## Warnings

### WR-01: Testes legados ainda assumem `'auto'` como WhisperModelOption válido

**File:** `apps/desktop/src/main/__tests__/index.test.ts:113`, `apps/desktop/src/main/__tests__/index.test.ts:237`, `apps/desktop/src/main/__tests__/index.test.ts:360`
**File:** `apps/desktop/src/main/__tests__/store.test.ts:159-161`
**File:** `apps/desktop/src/renderer/src/settings/__tests__/SettingsForm.test.tsx:42, 88, 167, 229, 249, 281, 323, 426`

**Issue:** Phase 68 D-03 removeu `'auto'` de `WhisperModelOption` (tipo passou a ser `'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'`). Três suites de teste existentes seguem usando `'auto'` como valor de `whisperModelOverride`:

1. `store.test.ts:159-161` afirma `getWhisperModelOverride() === 'auto'` por default — agora retorna `'base'` (loop 36 em `store.ts` normaliza `'auto'` legado → `'base'`). Este teste **vai falhar** quando rodar.
2. `index.test.ts` mocka `getWhisperModelOverride` retornando `'auto'` em 3 lugares. Como Phase 68 troca a chamada de `selectWhisperModel(vramModel, 'auto')` (branch defensivo) por `'base'` (via `OPTION_TO_MODEL`), as asserções `expect(callArg.voiceHandler.selectedModel).toBe('base')` ainda passam — mas só por coincidência. A intenção do teste virou opaca.
3. `SettingsForm.test.tsx` mocka `whisperModelOverride: 'auto'` 8 vezes. Esses literais agora são type-errors silenciosos (o tipo aceita só os 5 valores explícitos). Sem `as any`/`as unknown as` casts esses arquivos não compilam contra o novo tipo.

Phase 68 alterou a definição compartilhada em `apps/desktop/src/shared/ipc-types.ts:348` mas não migrou os fixtures dependentes — gap de coverage real.

**Fix:**
```typescript
// store.test.ts:159-161 — atualizar default esperado
it("getWhisperModelOverride() returns 'base' when not set (Phase 68 D-04)", () => {
  expect(getWhisperModelOverride()).toBe('base');
});

// Adicionar caso explícito para o normalize legacy:
it("getWhisperModelOverride() normalizes legacy 'auto' → 'base' (Phase 68 D-04)", () => {
  // Inject 'auto' via raw store write to simulate v1.x JSON
  setWhisperModelOverride('auto' as unknown as WhisperModelOption);
  expect(getWhisperModelOverride()).toBe('base');
});

// index.test.ts e SettingsForm.test.tsx — substituir 'auto' por 'base' em todos os fixtures.
// Se algum cenário específico quer testar o legacy path, usar:
whisperModelOverride: 'auto' as unknown as WhisperModelOption,
// com comentário explicando a intenção (Phase 68 D-04 legacy migration).
```

### WR-02: `index.main.test.ts:37-42` não exercita o fallback que afirma testar

**File:** `apps/desktop/src/main/__tests__/index.main.test.ts:37-42`

**Issue:** O bloco `describe('vramModel fallback for unknown override')` e o teste `'returns vramModel when OPTION_TO_MODEL has no entry (defensive)'` chamam `selectWhisperModel('medium', 'tiny')` e esperam `'tiny'`. Mas `'tiny'` ESTÁ em `OPTION_TO_MODEL` — a função retorna `OPTION_TO_MODEL['tiny'] === 'tiny'`, não o `vramModel`. O teste descreve um fallback defensivo que nunca dispara, dando falsa segurança de cobertura.

O fallback real (`?? vramModel`) só roda quando o override é `'auto'` (já coberto em outro `it`) ou um valor totalmente fora do tipo (não testado). Como `OPTION_TO_MODEL` é `Partial<Record<WhisperModelOption, WhisperModel>>` mas tem entrada para todos os 5 valores válidos, na prática esse branch é dead code para inputs bem-tipados.

**Fix:**
```typescript
describe('vramModel fallback for unknown override', () => {
  it('returns vramModel when override is outside the typed union (defensive)', () => {
    // Cast bypass: simulate corrupted store JSON like {model: 'bogus'}
    expect(
      selectWhisperModel('medium', 'bogus' as unknown as WhisperModelOption),
    ).toBe('medium');
  });
});
```
Ou remover o teste e documentar no JSDoc da função que `OPTION_TO_MODEL` é total para o tipo atual.

## Info

### IN-01: JSDoc de `whisperModelResolver.ts` descreve 'auto' mas a função não o aceita

**File:** `apps/desktop/src/main/voiceInput/whisperModelResolver.ts:4-19, 33, 47`

**Issue:** O bloco de doc menciona `auto → resolved via VRAM detection (vramMb arg)` e a tabela de "VRAM thresholds for 'auto'" continua presente, mas Phase 68 D-03 removeu `'auto'` do tipo (linha 50 reconhece isso: `// Phase 68 D-03: 'auto' removed from WhisperModelOption; branch removed.`). O parâmetro `vramMb` ainda existe na assinatura como fallback defensivo via `selectModelByVram`, mas o JSDoc descreve um comportamento (`'auto'`) que não pode mais ser invocado por consumidores type-safe.

**Fix:** Atualizar o JSDoc do módulo para refletir o estado pós-Phase-68:
```typescript
/**
 * whisperModelResolver.ts — Pure WhisperModelOption → WhisperModel resolver
 *
 * Phase 68 D-03: 'auto' removido de WhisperModelOption. Todos os valores
 * mapeiam diretamente via OPTION_TO_MODEL. `vramMb` mantido na assinatura
 * apenas como fallback defensivo para inputs corrompidos (fora do tipo).
 *
 * Mappings:
 *   tiny          → tiny
 *   base          → base
 *   small         → base   (D-12: sem URL para small; documented fallback)
 *   medium        → medium
 *   large-v3-turbo→ large  (D-12: mesmo ggml-large-v3.bin)
 */
```

### IN-02: `selectWhisperModel.ts` — parâmetro `vramModel` é dead-code para inputs type-safe

**File:** `apps/desktop/src/main/voiceInput/selectWhisperModel.ts:23-32`

**Issue:** Para qualquer `override: WhisperModelOption` bem-tipado, `OPTION_TO_MODEL[override]` retorna sempre um `WhisperModel` definido (todos os 5 valores têm entrada). O `?? vramModel` na linha 31 só dispara via `as unknown as` casts. O branch `if ((override as string) === 'auto')` na linha 28 é o único caminho realista que usa `vramModel`, mas em `index.ts:223` o caller passa hardcoded `'base'` como `vramModel`, neutralizando o sinal. Reconhecido em D-01 como tradeoff cirúrgico, mas vale registrar como débito técnico.

**Fix (futuro, não bloqueante):** Considerar simplificar para
```typescript
export function selectWhisperModel(override: WhisperModelOption): WhisperModel {
  if ((override as string) === 'auto') return 'base';
  return OPTION_TO_MODEL[override] ?? 'base';
}
```
e atualizar `index.ts:223` para `selectedModel = selectWhisperModel(override);`. Reduz superfície sem mudar comportamento. Deixar para uma phase de cleanup.

### IN-03: `index.ts:223` — argumento `'base'` literal obscurece intenção

**File:** `apps/desktop/src/main/index.ts:220-224`

**Issue:** A linha `selectedModel = selectWhisperModel('base', override);` passa um literal `'base'` no slot `vramModel`. Sem contexto histórico, um leitor pode achar que `'base'` é um valor especial; na verdade é só "o fallback genérico para caso o override seja inválido". O log na linha 224 imprime o resultado mas não diferencia "veio do mapping" vs "veio do fallback".

**Fix:** Comentar a intenção ou nomear a constante:
```typescript
// Phase 68 D-01: hardcoded 'base' é o fallback defensivo — Phase 68 removeu
// VRAM detection; OPTION_TO_MODEL cobre todos os WhisperModelOption válidos.
const FALLBACK_MODEL: WhisperModel = 'base';
selectedModel = selectWhisperModel(FALLBACK_MODEL, override);
```

### IN-04: Cobertura duplicada entre `index.main.test.ts` e `selectWhisperModel.test.ts`

**File:** `apps/desktop/src/main/__tests__/index.main.test.ts:12-42`
**File:** `apps/desktop/src/main/__tests__/selectWhisperModel.test.ts:28-122`

**Issue:** Os dois arquivos testam a mesma função `selectWhisperModel`. `index.main.test.ts` (5 testes) é um subconjunto do que `selectWhisperModel.test.ts` (16 testes) já cobre na matriz 5×3 + defensivo. Manter ambos custa manutenção em troca de zero sinal extra — qualquer regressão dispararia em ambas.

**Fix:** Consolidar em `selectWhisperModel.test.ts` (mais completo) e deletar `index.main.test.ts`, OU renomear `index.main.test.ts` para algo que reflita seu propósito (smoke test rápido para um sub-conjunto). Sem urgência.

### IN-05: `ipc/whisper.ts:37` — `getVramMbForResolver()` é uma função-constante

**File:** `apps/desktop/src/main/ipc/whisper.ts:37-39`

**Issue:** A função `getVramMbForResolver()` retorna sempre `0`. Função de uma linha que apenas retorna um literal não agrega — pode ser inlined ou substituída por uma constante. O comentário acima já explica a intenção; a função em si é cerimônia desnecessária.

**Fix:**
```typescript
// Phase 68 D-03: 'auto' removed; resolveWhisperModel uses OPTION_TO_MODEL
// for all explicit options. vramMb is unused for typed inputs.
const VRAM_MB_UNUSED = 0;

// ... no handler:
const resolvedModel = resolveWhisperModel(option, VRAM_MB_UNUSED);
```

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
