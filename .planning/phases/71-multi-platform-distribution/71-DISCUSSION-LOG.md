# Phase 71: Multi-Platform Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 71-multi-platform-distribution
**Areas discussed:** Build cross-platform a partir do Linux, Targets + `.env` em packaged app, Whisper model bundle (tamanho), Script `pnpm dist` + README DIST-05

---

## Build cross-platform a partir do Linux

### Q1: Como tu quer lidar com o build do Windows .exe a partir do Linux?

| Option | Description | Selected |
|--------|-------------|----------|
| Wine no Linux | Instalar `wine` + `mono` no host Linux; electron-builder usa wine pra gerar NSIS .exe + portable .exe. Documentado oficial. | ✓ |
| Máquina/VM Windows separada | Build Win em sessão própria de Windows (VM ou PC); workflow manual mas zero deps cross-compile. | |
| Docker electron-builder image | Imagem `electronuserland/builder:wine` encapsula wine + mono. Adiciona Docker como dep. | |

**User's choice:** Wine no Linux
**Notes:** Setup uma vez no host de dev; trade-off é deps extras que são triviais via apt.

---

### Q2: Como tu quer lidar com o build do macOS .dmg?

| Option | Description | Selected |
|--------|-------------|----------|
| Documentar como build em Mac | electron-builder.yml mantém config dmg universal; README documenta `pnpm dist:mac` em macOS; user valida quando tiver Mac. | ✓ |
| Sem suporte macOS na phase | Remover bloco mac: e marcar DIST-03 como deferido. | |
| GitHub Actions macOS runner | Configurar workflow em macos-latest. Mas DIST-FUT-04 é v3.2 — adiantaria escopo. | |

**User's choice:** Documentar como build em Mac
**Notes:** Apple proíbe DMG fora de macOS; sem alternativa local. Config presente, build deferido.

---

### Q3: Como tu valida que .exe Windows funciona?

| Option | Description | Selected |
|--------|-------------|----------|
| VM Windows 11 | VirtualBox/QEMU + Win11 trial; validar instalador, atalho, microfone, desinstalação. | |
| Máquina Windows física | Outro PC com Win10/11 para instalar e validar; mais rápido que VM. | ✓ |
| Apenas validar artefato | Confiar no output sem instalar. Marca DIST-01/02 como "validated by artifact presence". | |

**User's choice:** Máquina Windows física
**Notes:** UAT manual no PC físico do user; sem CI agent.

---

### Q4: Como DIST-03 (macOS .dmg) é marcado dado que build é fora desta phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Validated via config | yml + sanity check + README documenta o comando exato. Build real fica como UAT 'human-verified' pendente. | ✓ |
| Deferido para v3.2 | Tirar DIST-03 inteiro da phase. Phase 71 entrega 4/5 requirements. | |
| DIST-03 fica Pending até build | Phase fecha sem DIST-03 satisfeito; UAT explicit "build dmg in Mac". | |

**User's choice:** Validated via config
**Notes:** Permite phase fechar sem bloquear esperando Mac; DIST-03 não fica órfão.

---

### Q5: Quais alvos de validação para Linux AppImage? (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Próprio Linux host (tu) | Mínimo aceitável: chmod +x && ./JARVIS.AppImage no host de dev. | ✓ |
| Ubuntu 22 LTS (containerizado) | Docker/podman com X11 forwarding. | |
| Fedora 38+ (containerizado) | Mesma ideia, distro diferente. | |
| Outra máquina Linux física | Notebook etc. | |

**User's choice:** Próprio Linux host (tu)
**Notes:** Uso pessoal não justifica matriz cross-distro; AppImage é por design distro-agnóstico.

---

## Targets + `.env` em packaged app

### Q6: Como expandir os targets no electron-builder.yml?

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-target inline | `target: [nsis, portable]` no win; `target: { target: dmg, arch: [arm64, x64] }` no mac. | ✓ |
| DMG arm64 e x64 separados | 2 DMGs separados em vez de 1 universal; menor cada um mas user escolhe download. | |
| Apenas arm64 macOS | Quebraria critério DIST-03 "universal (arm64+x64)". | |

**User's choice:** Multi-target inline
**Notes:** Mínimo diff; suportado oficial pelo electron-builder.

---

### Q7: Onde fica o `.env` no JARVIS instalado?

| Option | Description | Selected |
|--------|-------------|----------|
| userData + first-run copy do template | `app.getPath('userData')/.env`; first-run copia `.env.example` bundled. | ✓ |
| userData mas sem copy automática | Cria `.env` vazio ou só defaults Zod. User edita manual. | |
| userData + IPC "Edit .env" via Settings UI | Editor de texto na Settings UI. Fora do espírito P70. | |

**User's choice:** userData + first-run copy do template
**Notes:** Zero intervenção manual no first-run; cobre P70 migration também.

---

### Q8: Como o user descobre/abre o `.env` para editar?

| Option | Description | Selected |
|--------|-------------|----------|
| Tray menu "Open .env folder" | Item de tray chama `shell.showItemInFolder`. README documenta paths por OS. | ✓ |
| Apenas README documentando o caminho | Sem tray entry. Zero UI surface mas user navega manual. | |
| First-run dialog | Popup com botão "Abrir .env para configurar LLM". Mais hand-holding. | |

**User's choice:** Tray menu "Open .env folder"
**Notes:** Tray já é o ponto de interação do user; sem precisar Settings UI nem CLI.

---

### Q9: Como o código resolve o path do `.env` em dev vs packaged?

| Option | Description | Selected |
|--------|-------------|----------|
| Helper `resolveEnvPath()` baseado em `app.isPackaged` | Função nova em `apps/desktop/src/main/envPath.ts`. Single source of truth. | ✓ |
| Inline em index.ts | Ternary inline; menos arquivo mas duplica se outros módulos precisarem. | |
| Env var override + fallback | `JARVIS_ENV_PATH` opcional + fallback default. Complexidade desnecessária para uso pessoal. | |

**User's choice:** Helper `resolveEnvPath()` baseado em `app.isPackaged`
**Notes:** Single source of truth para migration P70, loadEnvFile e tray.

---

### Q10: Quando copiar `.env.example` → userData/.env no primeiro boot?

| Option | Description | Selected |
|--------|-------------|----------|
| Copy se `.env` não existir + log | Em packaged app, `if (!fs.existsSync(envPath))` copia template e loga. Migration P70 sobrescreve com valores do store. | ✓ |
| Copy + popup de boas-vindas | Mesmo copy + dialog visual. Adiciona UX explícita. | |
| Sempre garantir merge entre template e existente | A cada boot, adiciona keys ausentes. Fora do escopo P71. | |

**User's choice:** Copy se `.env` não existir + log
**Notes:** Idempotente; em dev mantém comportamento atual.

---

### Q11: Bundle do `.env.example` para acesso runtime?

| Option | Description | Selected |
|--------|-------------|----------|
| extraResources com filtro específico | `- from: '../../.env.example' to: '.env.example'` no electron-builder.yml. | ✓ |
| Bundle inline como string TypeScript | Script de build gera `envTemplate.ts`. Sem dep filesystem mas build step extra. | |
| Sem template — cria `.env` vazio | First-run cria arquivo vazio. User lê README. | |

**User's choice:** extraResources com filtro específico
**Notes:** Pattern idêntico aos outros 14 bundles do yml; sem build step novo.

---

## Whisper model bundle (tamanho)

### Q12: Quão modelos Whisper devem ir bundled no instalador?

| Option | Description | Selected |
|--------|-------------|----------|
| Só base (~142MB) | Instalador pequeno; outros on-demand via Settings. | |
| tiny + base (~217MB) | Cobre extremos baratos; resto on-demand. | |
| tiny + base + large-v3-turbo (~1.7GB) | Inclui premium; instalador grande mas user nunca precisa baixar. | |
| Todos os 5 (~5GB+) | Bundle completo; quebra limite NSIS 32-bit. | |
| **base + medium** (free-text) | (user disse "base e a media as demais fica dispotive para pessoa baixar") | ✓ |

**User's choice:** base + medium (free-text response)
**Notes:** Total embedded ~1.7GB; outros (tiny, small, large-v3-turbo) baixados on-demand.

---

### Q13: Como tratar o drift entre electron-builder.yml (large-v3) e UI (large-v3-turbo)?

| Option | Description | Selected |
|--------|-------------|----------|
| Atualizar yml para bater com decisão de bundle | Alinhar filter com base+medium; garantir arquivos existem antes do build. | ✓ |
| Filter generoso (qualquer ggml-*.bin) | Trocar para `ggml-*.bin`. User controla via filesystem. | |

**User's choice:** Atualizar yml para bater com decisão de bundle
**Notes:** Remove refs tiny/large-v3, adiciona medium.

---

### Q14: Como o user obtém modelos não-bundled?

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand via Settings UI | WHISPER-01 (P50) já entrega: troca dispara download com ProgressBar. | ✓ |
| Script standalone post-install | `node scripts/download-whisper-model.mjs` — mas user não tem repo cloned. Não serve. | |

**User's choice:** On-demand via Settings UI
**Notes:** Verificar que path de download é `userData/whisper-models/` em packaged.

---

### Q15: Onde os modelos baixados on-demand são salvos em packaged app?

| Option | Description | Selected |
|--------|-------------|----------|
| userData/whisper-models/ | C'odigo download (P50) escreve em `app.getPath('userData')/whisper-models`. Runtime resolver checa userData primeiro, fallback resourcesPath. | ✓ |
| Próximo do binário (resourcesPath) | Read-only em NSIS Program Files + AppImage FUSE. Inviável. | |
| Custom path via env var | `JARVIS_WHISPER_MODELS_PATH` override. Não requirement P71. | |

**User's choice:** userData/whisper-models/
**Notes:** Cobre bundle (fallback) + downloaded (primary).

---

### Q16: Se modelo solicitado não estiver disponível?

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger download automático se selecionado | Comportamento WHISPER-01 já documentado; JARVIS continua com modelo anterior até completar. | ✓ |
| Falhar com mensagem | STT acusa modelo ausente; user abre Settings manual. | |

**User's choice:** Trigger download automático
**Notes:** Hot-swap behavior já entregue em P50; só validar packaged path.

---

## Script `pnpm dist` + README DIST-05

### Q17: Como o script `pnpm dist` no root é organizado?

| Option | Description | Selected |
|--------|-------------|----------|
| 4 scripts: dist + dist:win/mac/linux | Cobertura literal do roadmap critério 1. | ✓ |
| 1 script só (multi-target) | `--win --mac --linux`. macOS falha em Linux host. | |
| Script com check de host OS | Node script detecta platform. Adiciona complexidade. | |

**User's choice:** 4 scripts: dist + dist:win/mac/linux
**Notes:** `pnpm dist` sem args = OS do host (electron-builder default).

---

### Q18: Estrutura da seção de Distribuição no README (DIST-05)?

| Option | Description | Selected |
|--------|-------------|----------|
| Seção "Build & Install" depois de Setup | Antes de "Problemas comuns"; Build cmds, locais, install per OS, SmartScreen/Gatekeeper, uninstall. Sem screenshots. | ✓ |
| DISTRIBUTION.md separado | docs/DISTRIBUTION.md linkado. Overkill para pessoal. | |
| README minimal + comments no electron-builder.yml | Não satisfaz DIST-05 ("README documenta passo-a-passo"). | |

**User's choice:** Seção "Build & Install" depois de Setup
**Notes:** Inserir antes de "Problemas comuns"; sem screenshots, pt-BR.

---

### Q19: Pre-build checks/wrapper antes do electron-builder?

| Option | Description | Selected |
|--------|-------------|----------|
| Script de pre-flight | Novo `scripts/preflight-dist.mjs` valida env, models, wine, host OS. | ✓ |
| Documentar checks no README | Sem script. User pode esquecer. | |
| Sem pre-flight | Deixa electron-builder falhar com mensagens não-claras. | |

**User's choice:** Script de pre-flight
**Notes:** Falha-fast com mensagem actionable; rodado como pre-script dos comandos dist:*.

---

### Q20: Idioma do README?

| Option | Description | Selected |
|--------|-------------|----------|
| Manter pt-BR consistente | README atual já é pt-BR. Nova seção também. Termos técnicos em inglês. | ✓ |
| Inglês só para Distribuição | README híbrido (pensando em repo público). | |
| Bilingue (pt-BR + EN) | Cada subseção dupla. Manutenção custosa. | |

**User's choice:** Manter pt-BR consistente
**Notes:** Phase pessoal v3.1; sem polish para repo público.

---

### Q21: Próximos passos?

| Option | Description | Selected |
|--------|-------------|----------|
| Pronto para CONTEXT.md | 4 áreas cobertas. | ✓ |
| Discutir ainda: ícone/branding do app | App icon NSIS/DMG/AppImage. | |
| Discutir ainda: GitHub Releases manual upload | Pós-build. | |

**User's choice:** Pronto para CONTEXT.md
**Notes:** App icon e GitHub Releases deferidos (capturados em `<deferred>` no CONTEXT.md).

---

## Claude's Discretion

Áreas onde o planner/executor tem flexibilidade:

- Ordem dos plans dentro da phase (proposta: envPath → yml updates → pre-flight → builds → README; planner pode reordenar)
- Localização do helper `resolveEnvPath()` (arquivo próprio vs adicionar a `paths.ts` se existir)
- Estrutura interna do tray menu item handler
- Tamanho/escopo exato do pre-flight script (mínimo viável vs validação mais ampla)
- Idioma das mensagens de log/erro do pre-flight (pt-BR/inglês/misto)
- Manter `release-v2` como output dir (Phase 22 GAP-15 razão ainda válida)

## Deferred Ideas

- App icon custom (.ico/.icns/.png 512px) por OS — polish visual deferido
- GitHub Releases upload manual — DIST-FUT-04 (GH Actions) é v3.2
- Validação cross-distro Linux (Ubuntu 22 + Fedora 38 containers) — uso pessoal não justifica
- Hot-reload `.env` em packaged app — out-of-scope v3.1 (P70 D-09)
- Watcher `.env` para auto-refresh do LLM — mesma razão
- Linux .deb e .rpm packages — DIST-FUT-03, v3.2+
