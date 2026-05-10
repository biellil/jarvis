# Phase 68: Whisper Model Override Fix - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

O pipeline STT do Electron carrega exatamente o modelo Whisper que o usuário configurou em Settings — sem fallback silencioso para "medium". Adicionalmente, o modo "auto" é removido da UI: o dropdown de modelos só oferece escolhas explícitas (tiny/base/medium/large-v3-turbo). O default quando nada foi salvo é "base".

**Fora de escopo desta phase:** mudanças no comportamento de transcrição, novos modelos, code signing, distribuição.

</domain>

<root_cause>
## Bug Root Cause (descoberto em scout)

`apps/desktop/src/main/voiceInput/selectWhisperModel.ts` define:
```ts
const SUPPORTED_MODELS: WhisperModel[] = ['tiny', 'base', 'medium', 'large'];
```

A UI (definida em `store.ts:35`) oferece como `WhisperModelOption`: `'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'`.

Quando o usuário escolhe `'small'` ou `'large-v3-turbo'`, ambos caem no path warn-and-fallback que **retorna vramModel (geralmente 'medium' em qualquer GPU com VRAM detectada)**. Daí o sintoma "sempre medium mesmo configurando outro modelo".

Existe um mapping correto em `whisperModelResolver.ts` (`OPTION_TO_MODEL`): `small → base`, `large-v3-turbo → large`, mas `selectWhisperModel` não usa esse mapping — re-implementa lógica de allowlist com a lista errada.

</root_cause>

<decisions>
## Implementation Decisions

### Estratégia de fix
- **D-01:** Surgical fix em `selectWhisperModel.ts` — modifica a função para usar `OPTION_TO_MODEL` (exportado de `whisperModelResolver.ts`) em vez da allowlist `SUPPORTED_MODELS`. Mantém a interface atual `(vramModel, override) → WhisperModel`. Deleta `SUPPORTED_MODELS` e o warn-and-fallback. ~10 linhas de mudança, mínimo risco. Razão: zero refactor arquitetural, fácil de revisar, fácil de reverter se quebrar.
- **D-02:** Exportar `OPTION_TO_MODEL` de `whisperModelResolver.ts` (atualmente é `const` privada). Fonte única de mapping UI → backend, consumida tanto por `resolveWhisperModel` (path de download) quanto por `selectWhisperModel` (path de runtime).

### Auto-detection scope reduction
- **D-03:** Remover opção `'auto'` do dropdown de Whisper Model na Settings UI (renderer). Type `WhisperModelOption` em `ipc-types.ts` deixa de incluir `'auto'`. Usuário escolhe explicitamente entre `tiny | base | medium | large-v3-turbo` (4 opções).
- **D-04:** Default `'base'` fixo quando o store não tem override salvo (ou quando tem `'auto'` legado salvo). Sem migração explícita: `'auto'` antigo é tratado como `'base'` no read path.
- **D-05:** `vramDetection.ts` permanece no código (não apagar), mas deixa de ser chamada pelo path de seleção de modelo em `index.ts`. Pode ser removida em milestone futuro se ficar evidente que é código morto. Razão: scope mínimo desta phase é o bug fix; remoção total fica como dívida técnica documentada.
- **D-06:** Remover também a chamada a `detectVramAndSelectModel()` em `index.ts:218-238` — substituir por leitura direta do override do store (com default `'base'`).

### Migração e backward compatibility
- **D-07:** Sem migração explícita do electron-store. Read path em `getWhisperModelOverride()` (store.ts:220) deve retornar `'base'` quando o valor salvo é `'auto'` (ou ausente). `'small'` e `'large-v3-turbo'` salvos passam a funcionar corretamente automaticamente via D-01.
- **D-08:** Sem toast informativo de "modelo agora é X". Fix funciona silenciosamente. Razão: usuário já sabe que está com bug; mudar para o modelo correto é o esperado.

### Test coverage
- **D-09:** Matriz pure-function: testar todas as combinações UI option × VRAM scenario.
  - UI options testadas: `tiny`, `base`, `small`, `medium`, `large-v3-turbo` (5 — sem `auto` após D-03)
  - VRAM scenarios: 0 MB (CPU), 4096 MB (GPU baixo), 16384 MB (GPU alto)
  - Localização: estender `whisper-model-resolver.test.ts` e atualizar/criar `selectWhisperModel.test.ts`
- **D-10:** Asserção crítica: para qualquer override explícito (não-`'auto'`), `selectWhisperModel` retorna o modelo mapeado por `OPTION_TO_MODEL`, **independente** do vramModel passado. Garante que VRAM nunca sobrescreve override do usuário.

### Claude's Discretion
- Estrutura exata de import/export entre `selectWhisperModel.ts` e `whisperModelResolver.ts` (re-export, named export, helper function) — planner decide o jeito mais limpo.
- Localização do Settings UI Select que perde a opção `'auto'`: provavelmente `apps/desktop/src/renderer/...settings/.../WhisperSection.tsx` — descobrir durante planejamento.
- Mensagens de log durante load do modelo (se mudam ou ficam iguais).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug-related code (current state)
- `apps/desktop/src/main/voiceInput/selectWhisperModel.ts` — Função buggy que precisa do fix surgical (D-01)
- `apps/desktop/src/main/voiceInput/whisperModelResolver.ts` — Tem `OPTION_TO_MODEL` (privado, exportar conforme D-02)
- `apps/desktop/src/main/voiceInput/vramDetection.ts` — Auto-detection que deixa de ser chamada (D-05/D-06)
- `apps/desktop/src/main/index.ts` §218-238 — Call site da seleção atual; precisa ser ajustado conforme D-06
- `apps/desktop/src/main/store.ts` §35, §220, §224 — Schema do `whisperModelOverride` e accessors; ajustar read default conforme D-07
- `apps/desktop/src/main/ipc/whisper.ts` — Handler de download que já usa `resolveWhisperModel` corretamente; usar como referência

### Settings UI
- `apps/desktop/src/shared/ipc-types.ts` — Type `WhisperModelOption` (remover `'auto'` conforme D-03)
- `apps/desktop/src/main/ipc/settings.ts` §72, §137-138 — IPC handlers que serializam `whisperModelOverride`
- Settings UI `WhisperSection` em `apps/desktop/src/renderer/...` — buscar exata na phase de planejamento (Claude's discretion)

### Tests (target locations)
- `apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts` — Estender com matriz UI × VRAM (D-09/D-10)
- `apps/desktop/src/main/__tests__/selectWhisperModel.test.ts` — Criar/atualizar conforme padrão pure-function (D-09/D-10)
- `apps/desktop/src/main/ipc/__tests__/settings.test.ts` §260, §347, §409, §449 — Atualizar fixtures que usam `'auto'` para usar opções não-removidas

### Project-level docs
- `.planning/PROJECT.md` — Phase 68 está em "Current Milestone v3.1"
- `.planning/REQUIREMENTS.md` — WBUG-01, WBUG-02, WBUG-03 são os requirements desta phase
- `.planning/ROADMAP.md` §Phase 68 — Goal e success criteria

### Historical context
- Phase 30 STT-02 contract — define originalmente o comportamento de auto-detection (>8GB→large, 4-8GB→base, <4GB→tiny). Removido na prática nesta phase via D-03/D-05.
- Phase 50 D-12 — Define `OPTION_TO_MODEL` mapping (small→base, large-v3-turbo→large). Permanece canonical via D-02.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OPTION_TO_MODEL` em `whisperModelResolver.ts` — mapping correto UI→backend; só precisa ser exportado (D-02).
- Padrão de store accessor em `store.ts` (`getWhisperModelOverride`/`setWhisperModelOverride`) — read path absorve normalização do default (D-07).
- Pure-function test pattern em `whisper-model-resolver.test.ts` — extender, não reescrever.

### Established Patterns
- Pure helpers separados em `voiceInput/*.ts` (sem Electron deps) — facilita testes. Manter padrão.
- IPC handlers (`ipc/whisper.ts`) já consomem `OPTION_TO_MODEL` indiretamente via `resolveWhisperModel` — não precisam mudar.
- `ipc-types.ts` é a fonte do contrato UI ↔ backend — remover `'auto'` aqui propaga validação de Zod automaticamente.

### Integration Points
- Renderer Settings `WhisperSection` — Select component perde a opção `'auto'`.
- `index.ts` startup — substitui chamada a `detectVramAndSelectModel` por leitura direta do store.
- `whisper.ts` IPC handler — branch `option === 'auto'` em `getSelectedModel()` vira código morto após D-03; remover ou manter como fallback defensivo (Claude's discretion).
- Tests `settings.test.ts` — fixtures que mockam `'auto'` precisam migrar para `'base'`.

</code_context>

<specifics>
## Specific Ideas

- Usuário relatou empiricamente: "sempre está colocando no medium, mesmo que na configuração esteja como o outro modelo". Sintoma confirmado pelo scout — UI options `'small'` e `'large-v3-turbo'` falham e caem no warn-fallback que retorna vramModel ('medium' em GPU típica).
- User wants `'auto'` mode removed entirely from the dropdown — explicit choice only. Reduz superfície de bugs e código.

</specifics>

<deferred>
## Deferred Ideas

- **Apagar `vramDetection.ts` inteiro** — após D-05/D-06, vramDetection deixa de ser chamada. Pode virar código morto em phase futura (não bloqueia v3.1). Pequena dívida técnica documentada.
- **Atualizar STT-02 contract no PROJECT.md** — contrato histórico dizia ">8GB→large, 4-8GB→base, <4GB→tiny" para auto. Como auto foi removido (D-03), STT-02 fica obsoleto. Limpeza editorial fica para milestone futuro ou para o complete-milestone audit.
- **Remover branch `option === 'auto'` em `ipc/whisper.ts`** — após D-03, esse branch é inalcançável via UI mas pode permanecer como defensive fallback. Decisão fica para o planner.

</deferred>

---

*Phase: 68-whisper-model-override-fix*
*Context gathered: 2026-05-10*
