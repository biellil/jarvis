# Phase 71: Multi-Platform Distribution - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 71 gera binários instaláveis do JARVIS para Windows (NSIS installer + portable), macOS (.dmg universal arm64+x64) e Linux (AppImage) via `pnpm dist` no monorepo root, e documenta build + instalação no README com avisos de SmartScreen/Gatekeeper por ausência de code signing.

Inclui ainda: corrigir o gap deferido pela Phase 70 D-01 (localização writable do `.env` em packaged app, hoje hardcoded para monorepo root em `apps/desktop/src/main/index.ts:15`), expandir os targets do `electron-builder.yml` atual (que só declara `target: nsis` no `win:` e `target: dmg` sem arch no `mac:`), e alinhar o filter do bundle de modelos Whisper com a UI de Settings pós-Phase 68 (que removeu `large-v3` da lista e mantém `large-v3-turbo` como opção premium).

**Fora de escopo desta phase:**
- Auto-update via electron-updater (DIST-FUT-01, v3.2)
- Code signing — Windows EV cert e macOS notarização (DIST-FUT-02, v3.2)
- GitHub Actions workflow para build automatizado (DIST-FUT-04, v3.2)
- Linux .deb e .rpm packages (DIST-FUT-03, futuro)
- Hot-reload do `.env` em runtime (deferido por Phase 70 D-09; restart-only mantido)
- Build de fato do macOS DMG (config entregue, build executado em Mac quando user tiver acesso — DIST-03 fica "Validated via config")

</domain>

<scout_findings>
## Scout findings — estado atual

### electron-builder.yml já tem base sólida (Phase 22, 29-33, 62-63 contribuições)
`apps/desktop/electron-builder.yml` está em produção parcial:
- `appId: com.jarvis.desktop`, `productName: JARVIS`, `electronVersion: 41.1.1` explícito
- `directories.output: release-v2` (Phase 22 GAP-15: evita Windows file lock no asar)
- `files: ['dist/**/*', 'package.json', '!node_modules/**/*']` + `extraMetadata.dependencies: {}` (Phase 22 GAP-13: bundling com externalizeDeps:false, zero deps runtime)
- `extraResources:` inclui hoje 4 ONNX wakeword (Phase 22), prebuilds whisper win32-x64 + win32-x64-cuda + win32-x64-vulkan (Phase 29), darwin-arm64/x64 e linux-x64/cuda/vulkan (Phase 33), onnxruntime-node + kokoro-js + @huggingface/transformers (Phase 62), sharp + @img/sharp-win32-x64 (Phase 63), e modelos whisper `ggml-tiny.bin` + `ggml-base.bin` + `ggml-large-v3.bin` (Phase 30)
- `asar: true`
- `win: target: nsis` — **falta `portable` (DIST-02)**
- `mac: target: dmg` — **falta declarar arch universal (DIST-03)** + `extendInfo.NSMicrophoneUsageDescription` já presente
- `linux: target: AppImage` — OK

### Drift entre yml e estado real do repo
1. `resources/models/whisper/` contém apenas `ggml-base.bin` (147MB). Os filtros do yml listam tiny/base/large-v3 — electron-builder silenciosamente ignora arquivos ausentes no filter, então build atual só bundla `base`. Tu vai bundlar `base + medium` (D-11), os outros são puxados on-demand.
2. Phase 68 normalizou a UI de Settings para 5 modelos: tiny/base/small/medium/large-v3-turbo (sem o `large-v3` antigo). O electron-builder.yml ainda referencia `ggml-large-v3.bin` (Phase 30 era pré-P68). Filter precisa de update para `[ggml-base.bin, ggml-medium.bin]`.

### `.env` resolver atual (dev-only)
`apps/desktop/src/main/index.ts:15-16`:
```ts
const envPath = path.resolve(import.meta.dirname, '../../../../.env');
process.loadEnvFile(envPath);
```
- Resolve para monorepo root (`/root/jarvis/.env` em dev).
- Em packaged app, `import.meta.dirname` aponta para `<resourcesPath>/app.asar/dist/main/`. Quatro `..` chegam em `<resourcesPath>/`, que **não tem `.env`**. `process.loadEnvFile` lança `ENOENT` ou silenciosamente falha (depende do call site — verificar pre-implementation).
- Phase 70 D-01 explicitamente deixou esse fix para Phase 71.

### Phase 70 migration (`migrateLlmConfigToEnv`) usa o mesmo envPath
A migração escreve no arquivo resolvido por `index.ts:15` antes de `process.loadEnvFile`. Em packaged app, ela tenta escrever em path read-only/inexistente → falha. Phase 71 precisa fornecer o resolver correto E garantir que o `.env` exista (first-run copy) **antes** da migração executar.

### Tray já existe para hook do "Open .env"
`apps/desktop/src/main/tray.ts` (criado em Phase 10 DESK-04, estendido em Phase 41 VUI-01 com voice mode submenu). `createTray()` chamado em `apps/desktop/src/main/index.ts:349`. Adicionar item de menu `'Open .env folder'` com `shell.showItemInFolder(envPath)` é mecânica conhecida.

### Whisper download on-demand (WHISPER-01 / Phase 50)
Settings UI já tem botões de troca de modelo que disparam download via `download-whisper-model.mjs` (em dev) ou IPC equivalente em runtime. Verificar que o destino do download em runtime é `userData/whisper-models/` (não monorepo path) e que `whisperResources.ts` resolver busca em userData primeiro, depois fallback para `resourcesPath/models/whisper/` (bundled).

### Pre-flight blockers identificados
- Build Windows em Linux host: electron-builder precisa de `wine` (deb: `wine wine32 wine64`) + `mono-devel` (para NSIS). Sem essas deps, falha com "wine is required for building Windows apps from Linux".
- Build macOS em Linux host: electron-builder rejeita explicitamente (`process.platform !== 'darwin'` → erro). Não há workaround — Apple Codesign tooling é macOS-only.
- `.env.example` precisa existir no monorepo root para o bundle (extraResources from='../../.env.example').

</scout_findings>

<decisions>
## Implementation Decisions

### Build cross-platform a partir do Linux

- **D-01:** Build Windows (.exe NSIS + portable) gerado no Linux host de dev via `wine` + `mono`. Pre-flight script (D-17) valida que ambos estão instalados antes de chamar electron-builder com `--win`. *Razão:* electron-builder oficial suporta esse cross-build; usuário em Linux x86_64 não precisa manter VM Windows só para gerar binário.
- **D-02:** Build macOS (.dmg) **não é executado** nesta phase. `electron-builder.yml` mantém o bloco `mac:` com config completa (D-06). README documenta: "para gerar .dmg, rode `pnpm dist:mac` em macOS 12+". User valida quando tiver acesso a Mac. *Razão:* Apple proíbe cross-build de DMG fora de macOS; tentar gerar em Linux falha hard.
- **D-03:** Validação manual em máquina Windows física para DIST-01/DIST-02 (instala NSIS, atalho Menu Iniciar, painel de controle desinstala; portable executa sem privilégio admin). UAT human-verified — não automatizado. *Razão:* impossível automatizar instalação de NSIS sem CI agent dedicado; uso pessoal não justifica.
- **D-04:** DIST-03 (macOS DMG universal) é marcado **"Validated via config + README"**. Verificação concreta: (a) bloco `mac:` no yml com `target: { target: dmg, arch: [arm64, x64] }`, (b) extraResources mac-specific (whisper darwin-arm64 + darwin-x64 prebuilds, sharp mac equivalents se necessário), (c) seção macOS no README, (d) sanity dry-run do electron-builder em CI (não cria DMG mas valida config). Build de fato é UAT pendente (`build dmg in macOS` registrado em VERIFICATION.md como human-verified). *Razão:* phase fecha sem bloquear esperando Mac; DIST-03 não fica orfã.
- **D-05:** DIST-04 (Linux AppImage) validado no próprio Linux host de dev (user) — `chmod +x JARVIS.AppImage && ./JARVIS.AppImage`, abre janela, microfone responde, tray funciona. Sem containers de Ubuntu 22/Fedora 38 separados nesta phase. *Razão:* AppImage é por design distro-agnóstico via FUSE + glibc bundling; uso pessoal não justifica matriz cross-distro.

### Targets electron-builder (DIST-01/02/03/04)

- **D-06:** Atualizar `apps/desktop/electron-builder.yml`:
  - `win:` muda de `target: nsis` para `target: [nsis, portable]` — gera os 2 .exe em `release-v2/` (DIST-01 + DIST-02).
  - `mac:` muda de `target: dmg` para `target: { target: dmg, arch: [arm64, x64] }` — gera 1 DMG universal (DIST-03).
  - `linux:` permanece `target: AppImage` (DIST-04).
  - **Não declarar `arch` em `win:`**: mantém o default x64 (não há demanda por arm64 Windows nesta phase).

### `.env` em packaged app (resolve P70 D-01 deferral)

- **D-07:** Criar `apps/desktop/src/main/envPath.ts` exportando `resolveEnvPath()`:
  ```ts
  export function resolveEnvPath(): string {
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), '.env');
    }
    return path.resolve(import.meta.dirname, '../../../../.env');
  }
  ```
  Single source of truth — consumido por `index.ts` (load), `migrateLlmConfigToEnv` (write, Phase 70), e tray menu (open). *Razão:* sem helper, dev/packaged dispersão em 3+ call sites = bug magnet.
- **D-08:** First-run copy: em `apps/desktop/src/main/index.ts`, **antes** de `process.loadEnvFile(envPath)` e **antes** da migração P70:
  ```ts
  const envPath = resolveEnvPath();
  if (app.isPackaged && !fs.existsSync(envPath)) {
    const template = path.join(process.resourcesPath, '.env.example');
    if (fs.existsSync(template)) {
      fs.copyFileSync(template, envPath);
      console.log(`[first-run] .env created at ${envPath} from template`);
    }
  }
  ```
  Em dev: comportamento inalterado (envPath = monorepo root, .env já existe por workflow). *Razão:* zero intervenção manual no first-run; P70 migration ainda funciona porque envPath já existe quando ela roda.
- **D-09:** Bundle do `.env.example` via extraResources no `electron-builder.yml`:
  ```yml
  - from: "../../.env.example"
    to: ".env.example"
  ```
  Em runtime resolve via `path.join(process.resourcesPath, '.env.example')`. *Razão:* pattern idêntico ao bundle de wakeword/whisper models; sem build step novo.
- **D-10:** Adicionar tray menu item em `apps/desktop/src/main/tray.ts`: label `"Abrir .env"` (pt-BR consistente com a tray atual), action `shell.showItemInFolder(resolveEnvPath())`. Inserir antes do separador antes de "Quit". Posição: depois do submenu "Voice Mode" (VUI-01). *Razão:* tray é onde user já interage; sem precisar Settings UI nem CLI.

### Whisper bundle (DIST-01..04 instalador size)

- **D-11:** Bundle inclui apenas `ggml-base.bin` (~142MB) + `ggml-medium.bin` (~1.5GB). Total embedded: ~1.7GB. Os outros 3 (tiny, small, large-v3-turbo) baixados on-demand via Settings UI (WHISPER-01 já entrega esse fluxo).
- **D-12:** Atualizar filter em `electron-builder.yml` `extraResources` bloco "resources/models/whisper":
  ```yml
  - from: "resources/models/whisper"
    to: "models/whisper"
    filter:
      - "ggml-base.bin"
      - "ggml-medium.bin"
  ```
  Remover refs `ggml-tiny.bin` e `ggml-large-v3.bin` do filter. *Razão:* `tiny` é trivial pra baixar on-demand; `large-v3` foi removido da UI em P68 (substituído por `large-v3-turbo` que também não vai no bundle).
- **D-13:** Antes do build, garantir que `apps/desktop/resources/models/whisper/ggml-base.bin` e `ggml-medium.bin` existam. Pre-flight script (D-17) verifica e, se faltarem, invoca `scripts/download-whisper-model.mjs base` e `scripts/download-whisper-model.mjs medium` automaticamente.
- **D-14:** Modelos baixados em runtime escrevem em `path.join(app.getPath('userData'), 'whisper-models', 'ggml-<name>.bin')`. `whisperResources.ts` resolver busca em userData **primeiro**, fallback para `path.join(process.resourcesPath, 'models/whisper', 'ggml-<name>.bin')` (bundled). Verificar e ajustar se o resolver atual não fizer esse fallback duplo. *Razão:* user que baixar tiny in-app vê o modelo aparecer sem reinstalar; bundle continua disponível como fallback offline garantido para base + medium.
- **D-15:** Comportamento de modelo solicitado não-disponível: WHISPER-01 já dispara download automático ao selecionar no Settings. Confirmar que o flow funciona em packaged app (path userData writable, sem regressão).

### Script `pnpm dist` (roadmap critério 1)

- **D-16:** Adicionar ao `package.json` da raiz:
  ```json
  "scripts": {
    ...,
    "dist": "pnpm -F @jarvis/desktop build:dist",
    "dist:win": "node scripts/preflight-dist.mjs win && pnpm -F @jarvis/desktop build:dist:win",
    "dist:mac": "node scripts/preflight-dist.mjs mac && pnpm -F @jarvis/desktop build:dist:mac",
    "dist:linux": "node scripts/preflight-dist.mjs linux && pnpm -F @jarvis/desktop build:dist:linux"
  }
  ```
  `pnpm dist` sem target builda para o OS do host (electron-builder default). *Razão:* roadmap success criterion 1 cita `pnpm dist` literalmente; sem wrapper seria `pnpm -F @jarvis/desktop build:dist`.
- **D-17:** Criar `scripts/preflight-dist.mjs` que recebe target como arg (`win|mac|linux`) e verifica:
  1. `.env.example` existe na raiz (lista de keys esperadas, sem valores reais)
  2. `apps/desktop/resources/models/whisper/ggml-base.bin` e `ggml-medium.bin` existem; se não, invoca `download-whisper-model.mjs` para baixar (não interrompe build)
  3. Se `target === 'win'` e `process.platform !== 'win32'`: verifica que `wine --version` e `which mono` retornam OK; falha-fast com mensagem actionable se faltam
  4. Se `target === 'mac'` e `process.platform !== 'darwin'`: falha-fast com mensagem `"macOS DMG só pode ser buildado em macOS 12+. Documentado em README §Build."`
  5. Sai com código 0 se tudo ok; código 1 + mensagem clara em qualquer falha
  *Razão:* electron-builder error messages não são sempre claras; pre-flight evita commit de horas debugando.

### README documentation (DIST-05)

- **D-18:** Inserir nova seção `## Build & Install` no `README.md` da raiz, **antes** da seção `## Problemas comuns` (linha aproximada 224). Idioma pt-BR consistente com o resto. Estrutura:
  1. **Build local** — comandos `pnpm dist:win`, `pnpm dist:linux`, `pnpm dist:mac`; nota explícita "macOS exige host macOS 12+"; comentário sobre wine/mono em Linux ("Setup uma vez: `sudo apt install wine wine32 wine64 mono-devel`").
  2. **Onde os binários ficam** — `apps/desktop/release-v2/` com lista de artefatos esperados por target.
  3. **Instalação no Windows** — duplo-clique no NSIS .exe, aviso SmartScreen (passo-a-passo: "More info" → "Run anyway"), portable basta executar; desinstalação via Painel de Controle.
  4. **Instalação no macOS** — montar DMG, arrastar para /Applications, na primeira execução: Gatekeeper bloqueia (passo-a-passo: System Settings → Privacy & Security → "Open Anyway" para JARVIS).
  5. **Instalação no Linux** — `chmod +x JARVIS-*.AppImage && ./JARVIS-*.AppImage`; nota sobre `libfuse2` em Ubuntu 22+ (`sudo apt install libfuse2`).
  6. **Configuração pós-install (.env)** — caminho do `.env` por OS:
     - Windows: `%APPDATA%\JARVIS\.env`
     - macOS: `~/Library/Application Support/JARVIS/.env`
     - Linux: `~/.config/JARVIS/.env`
     - Atalho: tray menu → "Abrir .env".
- **D-19:** Não incluir screenshots — uso pessoal, README v3.1 não precisa de polish visual. Termos técnicos (NSIS, AppImage, Gatekeeper, SmartScreen, FUSE) ficam em inglês.
- **D-20:** Atualizar `## Pré-requisitos` (linha ~47 do README atual) adicionando bullet: "Para gerar binários Windows em Linux: `wine` + `mono-devel`". Mantém Setup separado de Build.

### Claude's Discretion

- Ordem dos plans dentro da phase: ordem natural (1) envPath resolver + first-run copy + extraResources `.env.example` + tray menu; (2) electron-builder.yml updates (targets + bundle filter); (3) pre-flight script + root scripts; (4) Linux AppImage build + validação; (5) Windows NSIS+portable build + validação manual (UAT); (6) README docs. Planner pode reordenar se ver dependência mais limpa.
- Estrutura interna do `resolveEnvPath()` (arquivo separado vs inline em `paths.ts` se existir) — Claude decide.
- Implementação do tray menu item: estender `tray.ts` direto ou extrair handler para arquivo separado — Claude decide.
- Tamanho exato do pre-flight script — mínimo viável vs validação mais ampla (e.g., verifica `pnpm install` foi rodado) — Claude decide.
- Mensagens de log/erro do pre-flight em pt-BR ou inglês — Claude decide (consistência com tray = pt-BR; consistência com console logs do backend = misto).
- Output dir (`release-v2`) atual está OK ou renomear para `release`/`dist` — manter `release-v2` (Phase 22 GAP-15 razão ainda válida) salvo razão forte.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements (scope anchors)
- `.planning/ROADMAP.md` §"Phase 71: Multi-Platform Distribution" — goal, requirements DIST-01..05, success criteria
- `.planning/REQUIREMENTS.md` §"Multi-Platform Distribution" lines 22-28 — DIST-01..05 acceptance text
- `.planning/REQUIREMENTS.md` §"Out of Scope" + §"Future Requirements" — confirma DIST-FUT-01..04 deferidos

### Build infrastructure (state to evolve)
- `apps/desktop/electron-builder.yml` — base config atual (Phase 22, 29-33, 62-63); locais a editar: blocos `win:`, `mac:`, `extraResources:` (D-06, D-09, D-12)
- `apps/desktop/package.json` — scripts `build:dist`, `build:dist:win/mac/linux` (existem desde Phase 22); não precisa edição
- `package.json` (root) — adicionar scripts `dist*` (D-16)
- `scripts/download-whisper-model.mjs` — invocado pelo pre-flight quando models faltam (D-13, D-17)
- `scripts/preflight-dist.mjs` — **arquivo NOVO** (D-17)

### `.env` path resolution (Phase 70 D-01 follow-up)
- `apps/desktop/src/main/index.ts` §15-16 — current envPath resolver + `process.loadEnvFile` call; precisa migrar para `resolveEnvPath()` (D-07)
- `apps/desktop/src/main/envPath.ts` — **arquivo NOVO** com `resolveEnvPath()` (D-07)
- `apps/desktop/src/main/tray.ts` — adicionar item "Abrir .env" (D-10)
- `.env.example` — bundle target (D-09); referência canonical das keys que vão no `.env` do user
- `.planning/phases/70-llm-config-migration/70-CONTEXT.md` §domain "Fora de escopo desta phase" — confirma deferral
- `.planning/phases/70-llm-config-migration/70-CONTEXT.md` D-04 — sequência do boot (migration → loadEnvFile); Phase 71 insere o first-run copy ANTES da migration

### Whisper bundle alignment (Phase 68 follow-up)
- `apps/desktop/resources/models/whisper/` — diretório do bundle; hoje só tem `ggml-base.bin` (D-13 garante medium presence)
- `.planning/phases/68-whisper-model-override-fix/68-CONTEXT.md` — confirma UI list: tiny/base/small/medium/large-v3-turbo (sem large-v3); razão para remover large-v3 do filter (D-12)
- Phase 30 (v1.6) STT-02 `ARCH-05 voiceHandler` — bundle inicial de tiny/base/large-v3 (histórico que P71 atualiza)

### README (DIST-05 target)
- `README.md` raiz — file a editar para D-18, D-19, D-20

### Phase 22 / 29-33 prior art
- `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-RESEARCH.md` §"Pattern 4" — racional do extraResources/asarUnpack (referenciado em comments do electron-builder.yml linhas 1-11)
- Phase 33 v1.7 macOS/Linux platform delivery — origem dos prebuilds darwin/linux atuais no yml

### electron-builder docs (external)
- electron-builder ["Building Windows on Linux"](https://www.electron.build/multi-platform-build#to-build-app-for-windows-on-linux) — wine + mono requirements (D-01)
- electron-builder ["macOS build requires macOS"](https://www.electron.build/multi-platform-build) — restrição Apple (D-02)
- electron-builder ["NSIS configuration"](https://www.electron.build/configuration/nsis) — referência para customização futura (não usado nesta phase, default OK)
- electron-builder ["Universal macOS apps"](https://www.electron.build/configuration/mac#universal) — sintaxe `arch: [arm64, x64]` (D-06)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **electron-builder.yml**: base de 170 linhas em produção com extraResources detalhado para todos os native modules da v3.0. Phase 71 edita 3 blocos (win, mac, extraResources/whisper models) e adiciona 1 bloco novo (.env.example). Sem rewrite.
- **`scripts/download-whisper-model.mjs`**: usado pelo `postinstall` do desktop; Phase 71 reusa via pre-flight (D-13, D-17).
- **`apps/desktop/src/main/tray.ts`**: tray menu existente; Phase 71 estende com 1 item (D-10).
- **WHISPER-01 flow** (Phase 50 v2.1): hot-swap de model com progress download via Settings UI; phase 71 só valida que funciona em packaged app, não reimplementa.
- **Phase 70 `migrateLlmConfigToEnv`**: rotina de migração de electron-store → `.env`; Phase 71 só fornece o path correto via `resolveEnvPath()` (D-07).

### Established Patterns
- **extraResources com `from`/`to`/`filter`**: pattern repetido 14 vezes no yml (wakeword, whisper bindings cross-platform, onnxruntime, kokoro, sharp, whisper models). Phase 71 adiciona o 15º (`.env.example`).
- **Path resolution dev vs packaged**: já em uso para wakeword (`apps/desktop/src/main/voiceInput/resources.ts`) — verifica `app.isPackaged` e usa `process.resourcesPath`. Phase 71 introduz o mesmo idioma para `.env` (D-07).
- **electron-vite externalize + extraResources copy**: padrão Phase 29 (whisper) + Phase 62 (kokoro/onnxruntime) + Phase 63 (sharp). Phase 71 não introduz novo padrão de externalize — `.env.example` é arquivo de dados, não module.

### Integration Points
- `apps/desktop/src/main/index.ts`: ponto único de boot; precisa edit em 2 lugares — envPath resolver (linha 15) e first-run copy logic (antes de loadEnvFile). Migração P70 já hooka aqui.
- `apps/desktop/src/main/tray.ts`: createTray() chamada em index.ts:349; menu items configurados internamente — adicionar 1 item.
- `electron-builder.yml`: edição em 3 blocos não-adjacentes (extraResources, win, mac) + 1 bloco novo (`.env.example`).
- `package.json` raiz: adicionar 4 scripts.
- `README.md`: adicionar 1 seção nova + 1 bullet em Pré-requisitos.

</code_context>

<specifics>
## Specific Ideas

- User está em Linux x86_64 — toda construção Win/Linux acontece nessa máquina via wine + electron-builder; macOS DMG fica como "future build executado em Mac".
- Validação de Windows é em PC físico próprio do user (não VM, não CI).
- Validação de Linux AppImage é no próprio host de dev (não containers cross-distro).
- Bundle Whisper: estratégia "balanceada" — não minimalista (só base) nem maximalista (todos). Base cobre default, medium cobre uso com VRAM intermediária; tiny e large-v3-turbo on-demand.
- README pt-BR (consistente com README atual); termos técnicos em inglês (NSIS, AppImage, Gatekeeper, SmartScreen).
- Tray menu item adicional em pt-BR: "Abrir .env" (não "Open .env folder").
- Sem screenshots no README — uso pessoal, evita manutenção de imagens.

</specifics>

<deferred>
## Deferred Ideas

Capturados durante a discussão para registro, não entram em Phase 71:

- **App icon/branding** custom (.ico Windows, .icns macOS, .png 512px Linux) — Phase 71 deixa eletron-builder usar default Electron icon. Polish visual deferido para milestone futuro (ou plant-seed se quiser registar).
- **GitHub Releases upload manual** após build — Phase 71 só gera os binários em `release-v2/`; upload/publish fica como ação manual do user (drag para Releases page). DIST-FUT-04 (GH Actions workflow) já cobre automation em v3.2.
- **Validação cross-distro Linux** (Ubuntu 22 + Fedora 38 containerizados) — deferido; uso pessoal valida no próprio host. Se aparecer regression de glibc/X11 em outra distro, criar phase de polish específico.
- **Hot-reload `.env` em packaged app** — deferido (já estava out-of-scope por requirements v3.1 e Phase 70 D-09).
- **Watcher de `.env`** para auto-refresh do LLM em runtime — same as above, deferido.
- **Linux .deb e .rpm packages** — DIST-FUT-03, v3.2+.

</deferred>

---

*Phase: 71-multi-platform-distribution*
*Context gathered: 2026-05-12*
