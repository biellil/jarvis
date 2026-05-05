# Phase 51: macOS Tray Icon Polish - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Trocar o ícone da tray no macOS por uma **template image** (PNG preto + alpha), usando o naming convention `iconTemplate.png` + `iconTemplate@2x.png`. O macOS renderiza o ícone automaticamente preto no modo claro e branco no modo escuro, sem código de listener nem restart. Windows e Linux continuam usando `icon-16x16.png` atual (ciano) — comportamento inalterado.

**Fora de escopo:** redesenho da identidade visual, novos modos de ícone (status indicators, badges), animações.

</domain>

<decisions>
## Implementation Decisions

### Asset Design
- **D-01:** Reutilizar a silhueta do `icon-16x16.png` atual convertida para preto+alpha. Mantém identidade visual; o macOS inverte para branco no dark mode automaticamente. Sem redesenho.

### Asset Strategy
- **D-02:** Manter todos os ícones de tray em `apps/desktop/resources/tray/` plano. Adicionar `iconTemplate.png` (16x16) e `iconTemplate@2x.png` (32x32) ao lado dos existentes. Sem subpasta `macos/`.

### Asset Generation
- **D-03:** Claude gera os PNGs via script Node (`sharp`) a partir do `icon-16x16.png` existente: preserva canal alpha, força RGB para preto (#000000). Script fica versionado em `apps/desktop/scripts/` (ex: `generate-tray-template.mjs`) para regeneração futura caso o ícone base mude.

### Platform Selection Logic
- **D-04:** Em [`tray.ts:54`](../../../apps/desktop/src/main/tray.ts#L54), usar seleção por plataforma:
  ```ts
  const iconFile = process.platform === 'darwin' ? 'iconTemplate.png' : 'icon-16x16.png';
  const iconPath = path.join(__dirname, '../../resources/tray/', iconFile);
  ```
  Electron auto-detecta `@2x.png` retina pelo naming convention — não precisa de código adicional.

### Testing
- **D-05:** Adicionar/expandir testes em `apps/desktop/src/main/__tests__/tray.platform.test.ts`:
  - Mock `process.platform = 'darwin'` → verifica que `iconPath` resolvido termina em `iconTemplate.png`
  - Mock `process.platform = 'win32'` e `'linux'` → verifica que continuam usando `icon-16x16.png` (proteção de regressão para Success Criteria #4)
- **D-06:** Validação manual no macOS (modo claro/escuro + toggle em runtime sem restart) é parte do critério de aceite — não automatizável em CI.

### Claude's Discretion
- Escolha exata da biblioteca de processamento de imagem (`sharp` é o default; pode trocar por `jimp` se houver problema de install no Windows)
- Estrutura interna do script `generate-tray-template.mjs` (CLI args, dry-run flag, etc)
- Se o script roda como `prebuild` automático ou só on-demand (preferir on-demand + commit dos PNGs gerados)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §MCOS-01 — Define o requisito (template image, naming, black+alpha)
- `.planning/ROADMAP.md` §"Phase 51" — Goal, Success Criteria (4 itens)

### Existing Code
- `apps/desktop/src/main/tray.ts` — Módulo a ser modificado (linha 54: `iconPath`)
- `apps/desktop/src/main/__tests__/tray.test.ts` — Testes unitários da tray
- `apps/desktop/src/main/__tests__/tray.platform.test.ts` — Testes platform-specific (lugar para novos testes)
- `apps/desktop/resources/tray/icon-16x16.png` — Asset base para gerar template
- `apps/desktop/resources/tray/icon-32x32.png` — Referência de tamanho retina

### External Docs (downstream agent should fetch via WebFetch/Context7 if needed)
- Electron `Tray` + `nativeImage` template image docs (https://www.electronjs.org/docs/latest/api/native-image#template-image-macos)
- `sharp` API docs para extração de alpha + replace RGB

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tray.ts:52-65` — `createTray()` já carrega ícone via `path.join`. A mudança é mínima: trocar o filename hardcoded por seleção condicional em uma linha.
- `apps/desktop/resources/tray/icon-16x16.png` — fonte da silhueta para o template.

### Established Patterns
- Platform checks usam `process.platform === 'darwin'` (já presente em `tray.ts:95` para mic permission gate). Mesmo padrão para o icon path.
- Testes platform-specific usam arquivo dedicado `*.platform.test.ts` (já existe `tray.platform.test.ts` e `index.platform.test.ts`).
- Recursos estáticos ficam em `apps/desktop/resources/` e são referenciados via `path.join(__dirname, '../../resources/...')`.

### Integration Points
- Única call-site: `createTray()` em `tray.ts:52`, invocado uma vez no startup do main process.
- Sem impacto em IPC, store, ou renderer — change isolada ao main process.

</code_context>

<specifics>
## Specific Ideas

- Gerar template via script versionado (não manual) para que regeneração seja reproduzível se o ícone base mudar no futuro.
- Manter os PNGs gerados commitados no repo (não gerar em build time) — evita dependência de `sharp` no CI/build.

</specifics>

<deferred>
## Deferred Ideas

- Redesenho do ícone da tray (identidade visual mantida nesta fase) — pode virar phase futura se a marca evoluir.
- Status indicators no ícone (ex: cor diferente quando JARVIS está ouvindo) — fora de escopo, exigiria nova fase com decisões de UX.
- Tray icon no Windows seguindo tema do sistema — Windows usa abordagem diferente (ICO multi-resolução); fora de escopo do MCOS-01.

</deferred>

---

*Phase: 51-macos-tray-icon-polish*
*Context gathered: 2026-05-05*
