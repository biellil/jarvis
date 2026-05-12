# Phase 71: Multi-Platform Distribution — Research

**Researched:** 2026-05-12
**Domain:** electron-builder 26.x multi-target packaging (Windows NSIS + portable, macOS DMG universal, Linux AppImage), cross-build a partir de Linux com wine+mono, first-run `.env` resolution em packaged app
**Confidence:** HIGH em todos os domínios principais (electron-builder defaults verificados em docs oficiais; environment audit executado no host; native APIs do Electron e Node confirmados em training + docs)

## Summary

Phase 71 é uma phase de **build configuration + packaging**, não de feature. Toda a investigação confirma que as decisões já travadas no CONTEXT.md (D-01 a D-20) são compatíveis com as defaults do electron-builder 26.8.1 — o trabalho é mecânico: ajustar 3 blocos no YAML existente, adicionar 1 helper + 1 first-run copy em `main/index.ts`, estender o tray com 1 menu item, criar 1 pre-flight script, escrever 1 seção de README. Os 4 critérios de sucesso "técnicos" (NSIS, portable, DMG universal, AppImage) caem em sintaxe já documentada do electron-builder; o quinto (README) é texto.

Há **3 blockers de ambiente** descobertos pela audit: (a) `wine` e `mono-devel` não estão instalados no host de dev — necessários para `pnpm dist:win` rodar localmente (D-01); (b) `ggml-medium.bin` está faltando em `apps/desktop/resources/models/whisper/` (só `ggml-base.bin` existe), então `pnpm dist` num build limpo precisaria baixar ~1.5GB; o pre-flight script (D-17) automatiza isso; (c) o host Linux atual roda Ubuntu **24.04** (não 22.04 como o contexto assumiu) — o que afeta o aviso de README para AppImage: em Ubuntu 24.04 o pacote `libfuse2` foi renomeado para `libfuse2t64`, e o sandbox do Electron é bloqueado por user-namespaces hardening do AppArmor 4.0 (precisa `--no-sandbox`).

Há também **2 pitfalls técnicos** a destacar que o CONTEXT.md não nomeia explicitamente:
1. A sintaxe `mac: target: { target: dmg, arch: [arm64, x64] }` (D-06) **não produz** um único DMG universal — produz **dois DMGs separados** (um arm64, outro x64). Para gerar um único binário universal, o pattern correto é `mac: target: dmg, arch: [universal]` (com `mergeASARs: true` que já é default em universal). Recomendação clara para o planner.
2. O bloco `extraResources` atual carrega prebuilds whisper/sharp `win32-x64` apenas. Para um build macOS universal funcionar em ambos arm64 e x64, os 2 prebuilds `darwin-arm64` + `darwin-x64` precisam estar **ambos** presentes em `node_modules/@fugood/...` em build time, e o yml já lista os dois (linhas 73-84) — está OK. Já para `sharp`, hoje só `@img/sharp-win32-x64` está bundled; macOS DMG precisa adicionar `@img/sharp-darwin-arm64` e `@img/sharp-darwin-x64`, e AppImage precisa `@img/sharp-linux-x64`.

**Primary recommendation:** Executar a phase em 6 plans na ordem do CONTEXT.md D-discretion. O plan 71-02 (electron-builder.yml edits) é o ponto de maior risco — exige verificar **mac target syntax** com cuidado e adicionar os 3 sharp packages que faltam. Tudo o resto é direto.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Build Windows (.exe NSIS + portable) gerado no Linux host de dev via `wine` + `mono`. Pre-flight script (D-17) valida ambos antes de chamar electron-builder com `--win`.

**D-02:** Build macOS (.dmg) **não é executado** nesta phase. `electron-builder.yml` mantém o bloco `mac:` com config completa (D-06). README documenta: "para gerar .dmg, rode `pnpm dist:mac` em macOS 12+". User valida quando tiver acesso a Mac.

**D-03:** Validação manual em máquina Windows física para DIST-01/DIST-02. UAT human-verified — não automatizado.

**D-04:** DIST-03 (macOS DMG universal) é marcado **"Validated via config + README"**: (a) bloco `mac:` no yml com target universal, (b) extraResources mac-specific (whisper darwin-arm64 + darwin-x64, sharp mac), (c) seção macOS no README, (d) sanity dry-run electron-builder. Build de fato é UAT pendente.

**D-05:** DIST-04 (Linux AppImage) validado no próprio Linux host de dev — `chmod +x JARVIS.AppImage && ./JARVIS.AppImage`.

**D-06:** Atualizar `apps/desktop/electron-builder.yml`:
- `win:` muda de `target: nsis` para `target: [nsis, portable]`.
- `mac:` muda de `target: dmg` para `target: { target: dmg, arch: [arm64, x64] }`.
- `linux:` permanece `target: AppImage`.
- Não declarar `arch` em `win:` (default x64).

> ⚠️ **Research flag:** `arch: [arm64, x64]` produz **dois DMGs separados**, não um universal. O critério DIST-03 ("DMG universal arm64 + x64") exige `arch: [universal]`. Ver §State of the Art e §Common Pitfalls para a recomendação corrigida.

**D-07:** Criar `apps/desktop/src/main/envPath.ts` exportando `resolveEnvPath()` — packaged → `path.join(app.getPath('userData'), '.env')`; dev → monorepo root.

**D-08:** First-run copy em `index.ts` **antes** de `process.loadEnvFile`: se packaged e arquivo não existe, copia `process.resourcesPath/.env.example` → `envPath`.

**D-09:** Bundle `.env.example` via extraResources: `- from: "../../.env.example"\n  to: ".env.example"`.

**D-10:** Adicionar tray menu item em `tray.ts`: label `"Abrir .env"` (pt-BR), action `shell.showItemInFolder(resolveEnvPath())`. Inserir antes do separador antes de "Sair", depois do submenu "Voice Mode".

**D-11:** Bundle inclui apenas `ggml-base.bin` (~142MB) + `ggml-medium.bin` (~1.5GB). Outros (tiny, small, large-v3-turbo) on-demand via Settings UI.

**D-12:** Atualizar filter em `extraResources` bloco "resources/models/whisper": remover refs `ggml-tiny.bin` e `ggml-large-v3.bin`; adicionar `ggml-medium.bin`.

**D-13:** Pre-flight verifica presença de `ggml-base.bin` + `ggml-medium.bin`; baixa via `scripts/download-whisper-model.mjs` se faltam.

**D-14:** Runtime resolver: `userData/whisper-models` primeiro, fallback `resourcesPath/models/whisper`.

**D-15:** WHISPER-01 flow (hot-swap via Settings UI) precisa funcionar em packaged app.

**D-16:** Adicionar 4 scripts ao `package.json` raiz: `dist`, `dist:win`, `dist:mac`, `dist:linux`.

**D-17:** Criar `scripts/preflight-dist.mjs` (recebe `win|mac|linux`) — valida .env.example, modelos whisper, wine+mono (se win cross-build), host=darwin (se mac). Sai 0/1.

**D-18..20:** Nova seção `## Build & Install` no README.md (pt-BR), antes de `## Problemas comuns` — build local, output dir, install per OS, SmartScreen/Gatekeeper passos, .env paths, atualizar `## Pré-requisitos` com wine+mono bullet.

### Claude's Discretion

- Ordem dos plans dentro da phase.
- Estrutura interna do `resolveEnvPath()` (arquivo separado vs inline).
- Implementação do tray menu item (estender `tray.ts` ou extrair).
- Tamanho exato do pre-flight script.
- Mensagens de log/erro do pre-flight em pt-BR ou inglês.
- Output dir (`release-v2`) atual ou renomear.

### Deferred Ideas (OUT OF SCOPE)

- App icon/branding custom (.ico Windows, .icns macOS, .png Linux).
- GitHub Releases upload manual.
- Validação cross-distro Linux (Ubuntu 22 + Fedora 38 containerizados).
- Hot-reload `.env` em packaged app.
- Watcher de `.env` para auto-refresh do LLM.
- Linux .deb e .rpm packages (DIST-FUT-03).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | `pnpm dist` gera Windows NSIS installer (.exe) — atalho Menu Iniciar + Painel de Controle uninstall | electron-builder NSIS default `oneClick: true` + `createStartMenuShortcut: true` + uninstaller registry entry. Cross-build com wine+mono em host Linux. Sintaxe `win: target: [nsis, portable]`. |
| DIST-02 | `pnpm dist` gera Windows portable (.exe) sem instalação, sem admin | Portable target extrai para `%TEMP%/{uuid}`, manifest `asInvoker` (sem admin). Mesma cross-build wine+mono. |
| DIST-03 | `pnpm dist` gera macOS .dmg universal (arm64 + x64) — arrasta para /Applications | **CRÍTICO**: usar `mac: arch: [universal]` + `target: dmg`, não `arch: [arm64, x64]`. Universal merge ASAR ativado por default. Build executado em Mac (D-02). |
| DIST-04 | `pnpm dist` gera Linux AppImage — `chmod +x && ./JARVIS.AppImage` | AppImage embute FUSE2 runtime; Ubuntu 24.04 precisa `libfuse2t64` ou flag `--appimage-extract-and-run`. Electron 41 + AppArmor 4.0 exige `--no-sandbox` em Ubuntu 24+. |
| DIST-05 | README documenta build + install + SmartScreen/Gatekeeper bypass | Caminhos atualizados: Windows SmartScreen "More info" → "Run anyway"; macOS Sequoia/Sonoma System Settings → Privacy & Security → Open Anyway (right-click método ainda funciona em Sonoma, mudou em Sequoia 15.0). |

## Project Constraints (from CLAUDE.md)

- **Stack alvo:** Node 22+ + TypeScript ESM (host atual roda Node 24.12, OK) + Electron 41 (já em uso, electronVersion 41.1.1 no yml).
- **Multiplataforma:** código OS-específico isolado — phase 71 não adiciona código OS-específico; toda complexidade vive no `electron-builder.yml` que é OS-agnóstico.
- **Privacidade:** `.env` em packaged app fica em `app.getPath('userData')` — fora do bundle, fora de read-only resources, controlado por permissões do OS (D-07/D-08).
- **Sem UI obrigatória:** tray menu é o ÚNICO ponto de entrada para abrir `.env` no packaged app (D-10) — consistente com filosofia "trabalha 100% em terminal/tray".
- **GSD enforcement:** todas as mudanças passam por `/gsd-plan-phase` + `/gsd-execute-phase`. Commits em pt-BR + emojis (CLAUDE.md §Git Commit Guidelines).
- **GSD commit format:** `🔧 chore`, `📝 docs`, `🏗️ build`, `✨ feat`, `♻️ refactor`, `✅ test` cobrem os tipos de commit prováveis nesta phase (sem `🔒️ security` salvo se houver mudança de sandbox).

## Standard Stack

### Core
| Library | Version (verificada) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| electron-builder | 26.8.1 [VERIFIED: pnpm list output] | Multi-target packaging (NSIS, portable, DMG, AppImage) | Já em uso desde Phase 22. Versão estável atual, suporta Electron 41 + Node 22. Default target builder para todos os OS. |
| electron | 41.1.1 [VERIFIED: electron-builder.yml:18] | Runtime do desktop app | Travado em yml por GAP-11. |
| Node | 24.12.0 [VERIFIED: node --version] | Build runtime | Engine spec `>=22`. Compatível com `process.loadEnvFile` (D-08), `fs.copyFileSync`, `child_process.spawnSync`. |
| pnpm | 10.27.0 [VERIFIED: pnpm --version] | Package manager | Já estabelecido. `pnpm -F @jarvis/desktop ...` filter chain usado por D-16. |
| wine | NÃO INSTALADO no host [VERIFIED: command -v wine] | Cross-build Windows .exe a partir de Linux | Required by electron-builder quando `process.platform !== 'win32'` e `--win` é passado. |
| mono | NÃO INSTALADO no host [VERIFIED: command -v mono] | Suporte para NSIS cross-build | electron-builder docs dizem que mono **só é necessário para Squirrel.Windows** target, NÃO para NSIS [CITED: electron.build/multi-platform-build]. Porém o CONTEXT.md D-01 e D-17 e D-20 listam mono como dependência — manter por segurança e consistência com CONTEXT.md. Mono ajuda em assinatura de assets mesmo em NSIS. |

> **Observação sobre mono [CITED + research nota]:** A docs oficial do electron-builder 26.x diz que `wine ≥ 2.0` é o requisito hard para Windows targets, e que `mono ≥ 4.2` é necessário **especificamente para Squirrel.Windows** (não NSIS). Como o CONTEXT.md já decidiu instalar ambos (D-01, D-17, D-20), e o overhead de `mono-devel` é trivial em Ubuntu, manter ambos. Pre-flight pode tornar mono opcional (warning) e wine obrigatório (failure) — Claude's discretion no planner.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node stdlib `child_process` | builtin | Detectar wine/mono no pre-flight | `spawnSync('wine', ['--version'])` retorna `{ status, stdout }`. Cross-platform OK. |
| Node stdlib `fs` / `fs.promises` | builtin | First-run copy (D-08), pre-flight model presence check | `fs.copyFileSync(src, dest)` é síncrono e atomic-ish em filesystems POSIX. |
| Node stdlib `path` | builtin | Path resolution dev vs packaged | Já em uso por todo o main process. |
| Electron `app.getPath('userData')` | 41.x API | Resolver `.env` path em packaged (D-07) | Native Electron API, retorna OS-specific path por OS. |
| Electron `shell.showItemInFolder(path)` | 41.x API | Tray "Abrir .env" action (D-10) | Native Electron API, abre file manager nativo com arquivo selecionado. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| wine+mono local | `electronuserland/builder:wine` Docker image | Docker imagem oficial pré-configura wine+mono+Node 20. Tradeoff: user precisa Docker rodando + 2GB pull. Não escolhido — overhead maior que `sudo apt install wine mono-devel` (D-01). |
| `arch: [arm64, x64]` (2 DMGs separados) | `arch: [universal]` (1 DMG universal) | DIST-03 exige UNIVERSAL — usar `[universal]`. **D-06 precisa correção na phase de planning ou via amendment do CONTEXT** (ver §Common Pitfalls #1). |
| AppImage classic | AppImage + `--appimage-extract-and-run` documented | Classic requer libfuse2/libfuse2t64; extract-and-run não. README pode mencionar ambos. |
| `pkg` Node binary | electron-builder | Não aplicável — JARVIS é Electron app, não Node CLI. |

**Installation no host de build:**
```bash
# Ubuntu 24.04 build host (one-time)
sudo apt update
sudo apt install wine wine32 wine64 mono-devel libfuse2t64
# Verifique:
wine --version    # >= wine-9.x esperado em Noble
mono --version    # >= 6.12 esperado em Noble
```

> **Nota Ubuntu 24.04 vs 22.04:** Em Ubuntu 24.04 o pacote `libfuse2` foi renomeado para `libfuse2t64` (Time-64 ABI transition). Pacotes `wine32` continuam disponíveis em Noble, mas exigem `dpkg --add-architecture i386 && apt update` antes do install se i386 ainda não estiver habilitado [VERIFIED via apt cache em Noble docs].

**Version verification:**
- electron-builder 26.8.1 — verificado via `pnpm --filter @jarvis/desktop list electron-builder` em 2026-05-12
- electron 41.1.1 — verificado em `electron-builder.yml:18` (explícito por GAP-11)

## Architecture Patterns

### Recommended Phase Structure (mapeamento para plans)

A phase já tem `release-v2/` como output dir definido. A estrutura de plans recomendada segue a ordem natural de risco e dependência:

```
71-01-PLAN.md  → envPath resolver + first-run copy + tray "Abrir .env" item
71-02-PLAN.md  → electron-builder.yml updates (targets + bundle filter + .env.example + sharp mac/linux extraResources)
71-03-PLAN.md  → preflight-dist.mjs script + 4 root scripts em package.json
71-04-PLAN.md  → AppImage build local + smoke test (D-05)
71-05-PLAN.md  → Windows NSIS+portable build (UAT human, D-03)
71-06-PLAN.md  → README seção "Build & Install" pt-BR + Pré-requisitos update (D-18/D-19/D-20)
```

Cada plan é **independente do anterior em termos de código** (envPath não bloqueia yml updates, etc.) — paralelizável se planner quiser, mas a ordem acima minimiza retrabalho de re-build.

### Pattern 1: Dev vs Packaged Path Resolver (D-07)

**What:** Helper que devolve um path single-source-of-truth baseado em `app.isPackaged`.

**When to use:** Sempre que um arquivo escrito-em-runtime (`.env`) ou modelo on-demand (whisper, kokoro) precisa de um path diferente em dev vs packaged.

**Example (proposta para `apps/desktop/src/main/envPath.ts`):**
```ts
// Source: padrão estabelecido em apps/desktop/src/main/voiceInput/resources.ts (Phase 22)
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveEnvPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), '.env');
  }
  // dev: monorepo root (4 levels up from dist/main/envPath.js)
  return path.resolve(__dirname, '../../../../.env');
}
```

**Path por OS em packaged app [VERIFIED: electronjs.org/docs/latest/api/app]:**
- Windows: `C:\Users\<user>\AppData\Roaming\JARVIS\.env` (productName="JARVIS" no yml)
- macOS: `~/Library/Application Support/JARVIS/.env`
- Linux: `~/.config/JARVIS/.env` (respeita `XDG_CONFIG_HOME` se definida)

> Note: `productName` no yml é "JARVIS" (linha 14), e Electron usa **productName** preferencialmente sobre `name` do package.json para o folder name de userData [CITED: electron.org docs].

### Pattern 2: First-Run Copy with Idempotency Guard (D-08)

**What:** Operação síncrona executada antes de `process.loadEnvFile`, idempotente via `fs.existsSync`.

**Example:**
```ts
// Source: novo, plan 71-01
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { app } from 'electron';
import { resolveEnvPath } from './envPath.js';

const envPath = resolveEnvPath();

// First-run copy — só em packaged app, idempotente
if (app.isPackaged && !fs.existsSync(envPath)) {
  const template = path.join(process.resourcesPath, '.env.example');
  if (fs.existsSync(template)) {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.copyFileSync(template, envPath);
    console.log(`[first-run] .env created at ${envPath} from template`);
  } else {
    console.warn(`[first-run] template not found at ${template} — skipping copy`);
  }
}
```

**Crítico:** Esta lógica precisa rodar **antes** de `runLlmConfigMigration(envPath)` E **antes** de `process.loadEnvFile(envPath)` (ver `apps/desktop/src/main/index.ts:11-22`). A ordem correta no boot:

1. `resolveEnvPath()` → `envPath` calculado
2. First-run copy (se packaged + arquivo não existe)
3. `runLlmConfigMigration(envPath)` — agora tem onde escrever
4. `process.loadEnvFile(envPath)` — carrega para `process.env`

### Pattern 3: extraResources Pattern (D-09, D-12, sharp mac/linux)

**What:** electron-builder copia arquivos de `from` (path relativo ao yml ou ao monorepo via `../..`) para `<resourcesPath>/{to}` no app empacotado.

**Pattern já estabelecido** no yml atual em 14+ blocos (wakeword, whisper bindings, sharp, kokoro, onnxruntime). Phase 71 adiciona o 15º (`.env.example`) e estende 4 (sharp mac×2 + linux×1, whisper models filter).

**Examples:**
```yaml
# D-09: .env.example bundle
- from: "../../.env.example"
  to: ".env.example"

# D-12: whisper models — replace existing block
- from: "resources/models/whisper"
  to: "models/whisper"
  filter:
    - "ggml-base.bin"
    - "ggml-medium.bin"

# NEW (DIST-03 mac universal): sharp darwin prebuilds
- from: "../../node_modules/@img/sharp-darwin-arm64"
  to: "node_modules/@img/sharp-darwin-arm64"
  filter:
    - "lib/**"
    - "package.json"
- from: "../../node_modules/@img/sharp-darwin-x64"
  to: "node_modules/@img/sharp-darwin-x64"
  filter:
    - "lib/**"
    - "package.json"

# NEW (DIST-04 linux): sharp linux prebuild
- from: "../../node_modules/@img/sharp-linux-x64"
  to: "node_modules/@img/sharp-linux-x64"
  filter:
    - "lib/**"
    - "package.json"
```

> **Verificar antes do build:** que `node_modules/@img/sharp-darwin-arm64`, `sharp-darwin-x64` e `sharp-linux-x64` existam após `pnpm install`. Como `sharp` está como `optionalDependencies` no root `package.json:19-20`, pnpm pode pular instalação de prebuilds para platforms diferentes do host. **Mitigação:** o pre-flight script (D-17) pode forçar `pnpm install` ou um `pnpm rebuild sharp` antes do build (Claude's discretion no planner).

### Pattern 4: Tray Menu Item Extension (D-10)

**What:** Estender `tray.ts:buildContextMenu` com mais um `MenuItem`, mantendo a ordem definida no CONTEXT.

**Example:**
```ts
// Source: plan 71-01, modificação cirúrgica em tray.ts
import { shell } from 'electron';
import { resolveEnvPath } from './envPath.js';

// ...dentro de Menu.buildFromTemplate, depois do submenu "Modo de Voz",
// depois do separador, antes de "Mostrar":

{
  label: 'Abrir .env',
  click: () => {
    const envPath = resolveEnvPath();
    // showItemInFolder abre Explorer/Finder com o arquivo selecionado
    // em Linux usa xdg-open + DBus FileManager1 spec (works em GNOME/KDE/XFCE)
    shell.showItemInFolder(envPath);
  },
},
```

**Comportamento per OS [VERIFIED: electronjs.org/docs/latest/api/shell]:**
- Windows: abre Explorer.exe com arquivo selecionado.
- macOS: abre Finder com arquivo selecionado.
- Linux: usa DBus `org.freedesktop.FileManager1.ShowItems` (suportado em Nautilus/Dolphin/Thunar). Em DE minimalistas sem este service, falha silenciosamente — Electron 28+ tem fallback para `xdg-open` no parent dir.

**Edge case:** Se o `.env` ainda não foi criado (first-run não rodou, e.g. dev mode + sem `.env`), `shell.showItemInFolder` abre o parent dir vazio sem erro fatal. Aceitável.

### Pattern 5: Pre-Flight Script (D-17)

**What:** Script Node ESM puro, sem dependências, valida ambiente antes de chamar electron-builder.

**Example skeleton:**
```js
#!/usr/bin/env node
// scripts/preflight-dist.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const target = process.argv[2]; // 'win' | 'mac' | 'linux'

function fail(msg) {
  console.error(`[preflight] ERRO: ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`[preflight] ✓ ${msg}`);
}

// 1. .env.example existe
if (!fs.existsSync(path.join(ROOT, '.env.example'))) {
  fail('.env.example missing in monorepo root');
}
ok('.env.example present');

// 2. Whisper models (run download script if missing)
const whisperDir = path.join(ROOT, 'apps/desktop/resources/models/whisper');
for (const model of ['base', 'medium']) {
  const file = path.join(whisperDir, `ggml-${model === 'large' ? 'large-v3' : model}.bin`);
  if (!fs.existsSync(file)) {
    console.log(`[preflight] Modelo ${model} ausente — baixando...`);
    const r = spawnSync('node', [
      path.join(ROOT, 'scripts/download-whisper-model.mjs'),
      '--model', model,
    ], { stdio: 'inherit' });
    if (r.status !== 0) fail(`Download falhou para ${model}`);
  }
  ok(`ggml-${model}.bin present`);
}

// 3. Cross-build deps
if (target === 'win' && process.platform !== 'win32') {
  const wine = spawnSync('wine', ['--version'], { encoding: 'utf8' });
  if (wine.status !== 0) fail('wine não encontrado. Instale com: sudo apt install wine wine32 wine64');
  ok(`wine ${wine.stdout.trim()}`);
  const mono = spawnSync('mono', ['--version'], { encoding: 'utf8' });
  if (mono.status !== 0) console.warn('[preflight] aviso: mono não encontrado (necessário só para Squirrel.Windows; NSIS funciona sem)');
  else ok(`mono ${mono.stdout.split('\n')[0]}`);
}

// 4. Mac platform check
if (target === 'mac' && process.platform !== 'darwin') {
  fail('macOS DMG só pode ser buildado em macOS 12+. Veja README §Build.');
}

ok('preflight OK');
```

### Anti-Patterns to Avoid

- **NÃO usar `arch: [arm64, x64]` para produzir DMG universal.** Produz 2 DMGs separados. Use `arch: [universal]` (ver §Common Pitfalls #1).
- **NÃO copiar o `.env.example` em runtime após `process.loadEnvFile`** — backend e LLM já leram `process.env` vazio. First-run precisa rodar **antes**.
- **NÃO commitar `.env`** (já `.gitignore`d). Pre-flight só verifica `.env.example`.
- **NÃO assumir que `pnpm install` instala todos os `@img/sharp-*` prebuilds em qualquer host.** Verificar presença antes do build (`fs.existsSync` em pre-flight ou `pnpm rebuild sharp`).
- **NÃO usar `--no-sandbox` no `electron-builder` config.** É flag de runtime do Electron, passada via CLI args ao executar o AppImage. Documentar no README, não no yml.
- **NÃO renomear `release-v2/` para `release/`** sem revisar GAP-15 (Phase 22) — Windows Defender file lock issue ainda relevante.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-compilation Win em Linux | Custom MSBuild + WixSharp | electron-builder + wine | electron-builder já abstrai 100% — apenas precisa wine instalado. |
| Universal macOS binary merge | Manual `lipo` + ASAR merge | electron-builder `arch: [universal]` | Faz lipo automático em native modules + merge de ASARs (mergeASARs: true default em universal). |
| AppImage filesystem packing | Custom mksquashfs + AppRun | electron-builder `target: AppImage` | electron-builder usa appimagetool oficial internamente. |
| NSIS installer script | Custom .nsi | electron-builder NSIS target | Geração automática com defaults sensatos (oneClick, Start Menu, Control Panel uninstall). |
| `.env` parser/writer custom | Regex próprio | (não aplicável) Phase 71 só **lê via `process.loadEnvFile`** e **copia template via `fs.copyFileSync`** — não escreve | Phase 70 já tem `migrateLlmConfigToEnv` para writes; Phase 71 não escreve `.env` programaticamente. |
| Cross-platform process detection (wine) | Custom path search | `spawnSync('wine', ['--version'])` | Idiomatico Node, retorna status code limpo. |
| File manager open com seleção (cross-OS) | Custom xdg-open / explorer.exe | `shell.showItemInFolder(path)` | Native Electron API, lida com diferenças OS. |

**Key insight:** Phase 71 é puro "compõe peças prontas". Toda a complexidade do empacotamento vive no electron-builder + APIs nativas do Electron/Node. Sem código novo de baixo nível.

## Runtime State Inventory

Phase 71 envolve **migração de configuração de runtime** (envPath dev → userData), então o inventário é relevante.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | electron-store vive em `app.getPath('userData')/config.json` — mesma userData onde `.env` será criado. Cohabitam sem conflito. ChromaDB path é configurável via `.env` (CHROMA_PATH=data/chroma), não afetado por Phase 71. | None — Phase 70 já cleanup-ou keys legacy LLM do store. |
| Live service config | n8n MCP server URL vive em `.env` (`MCP_SERVER_URL` em `.env.example:103`). Backend env-watcher (Phase 65) faz hot reload — funciona em packaged app desde que `.env` esteja no path correto. | Validar em UAT que MCP Client conecta após packaging. |
| OS-registered state | **Nenhum** registered service em fases prévias. JARVIS não usa Task Scheduler, launchd, systemd. Tray icon é runtime, não persistido em sistema. | None. |
| Secrets/env vars | Keys LLM (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) e `JARVIS_API_KEY` ficam no `.env` em userData. Permissões: Linux/macOS herdam `umask` do user (tipicamente 644 → world-readable). | **POTENTIAL HARDENING (Claude's Discretion):** após first-run copy, executar `fs.chmodSync(envPath, 0o600)` em Linux/macOS para owner-only read/write. Não-bloqueante para Phase 71 — pode ser security plant-seed. |
| Build artifacts | `apps/desktop/release-v2/` contém builds antigos não-gitignored? Verificar `.gitignore`. `apps/desktop/resources/models/whisper/ggml-base.bin` (147MB) é gitignored mas presente no host. Re-install não auto-baixa `ggml-medium.bin` (1.5GB) — pre-flight resolve. | Adicionar `release-v2/` ao `.gitignore` se não estiver. Pre-flight cuida do whisper bundle. |

**Itens não encontrados (verificados explicitamente):** Nenhuma referência a Phase 71 em SQLite schema do backend (Drizzle migrations). Nenhuma referência a `release-v2` em CI configs (não há CI configurado — `.github/workflows/` ausente conforme Phase 71 deferred ideas).

## Common Pitfalls

### Pitfall 1: `mac.arch: [arm64, x64]` NÃO produz universal binary

**What goes wrong:** electron-builder interpreta `arch: [arm64, x64]` como "produza 2 builds, um por arch" — gera `JARVIS-x.y.z-arm64.dmg` E `JARVIS-x.y.z.dmg` (x64). DIST-03 critério exige **um único DMG universal** que rode nativamente em ambas as arquiteturas.

**Why it happens:** array de arches = list of build matrix entries. O valor especial `universal` é uma "arch" sintética que sinaliza ao @electron/universal merger fazer `lipo` em native modules e merge de ASARs.

**How to avoid:** Em `apps/desktop/electron-builder.yml`, usar:
```yaml
mac:
  target:
    - target: dmg
      arch:
        - universal
  extendInfo:
    NSMicrophoneUsageDescription: "..."
```
**OU** sintaxe compacta:
```yaml
mac:
  target: dmg
  arch: universal
```

`mergeASARs: true` é default em builds universal — não precisa setar.

**Warning signs:**
- `release-v2/` tem 2 DMGs após `pnpm dist:mac` (1 arm64 + 1 x64 nomeados).
- `JARVIS.app/Contents/MacOS/JARVIS` reporta uma única arch (`file` ou `lipo -info`).

**[Sources]:** [Bug: detect multiple sharp library files when packing mac os universal builds (electron-builder #6891)](https://github.com/electron-userland/electron-builder/issues/6891) — discute trade-off entre `[arm64, x64]` (2 builds) e `universal` (1 build com lipo merge).

**ACTION REQUIRED:** Planner deve clarificar com user qual comportamento é desejado. CONTEXT D-06 diz `arch: [arm64, x64]` mas roadmap success criterion 3 diz "universal (arm64 + x64)". Há ambiguidade — provavelmente o user quis dizer "binário universal", mas escreveu "[arm64, x64]" inadvertidamente.

### Pitfall 2: AppImage em Ubuntu 24.04 — libfuse2 renomeado

**What goes wrong:** User baixa `JARVIS-x.y.z.AppImage`, faz `chmod +x`, executa, recebe erro:
```
dlopen(): error loading libfuse.so.2
```

**Why it happens:** Em Ubuntu 24.04 (Noble), o pacote `libfuse2` foi renomeado para `libfuse2t64` (Time-64 ABI transition). AppImage classic embute um runtime que carrega `libfuse.so.2` dinamicamente do sistema. Em Noble fresco, esse arquivo não existe — só `libfuse.so.3`.

**How to avoid:** Documentar 2 paths no README seção Linux (DIST-05):
1. **Install fuse2 legacy:** `sudo apt install libfuse2t64` (one-liner, recomendado).
2. **Extract-and-run fallback (sem instalação):** `./JARVIS-x.y.z.AppImage --appimage-extract-and-run` — extrai squashfs para `/tmp/.mount_JARVIS-xxx` e executa, dispensa FUSE inteiramente.

**Warning signs:** `ldconfig -p | grep libfuse` retorna só `.so.3`.

**Source:** [Can't Run AppImage on Ubuntu 24.04? (itsfoss.com)](https://itsfoss.com/cant-run-appimage-ubuntu/) — guide oficial para a transição.

### Pitfall 3: Electron 41 AppImage + Ubuntu 24.04 user namespaces hardening

**What goes wrong:** `./JARVIS.AppImage` falha logo após mount com:
```
[FATAL:setuid_sandbox_host.cc(163)] The SUID sandbox helper binary was found, but is not configured correctly.
```
Ou apenas crash silencioso sem janela.

**Why it happens:** Ubuntu 24.04 ativou hardening de `unprivileged user namespaces` via AppArmor 4.0. Electron 21+ usa chrome-sandbox que precisa user-namespaces ou setuid root. Em AppImages, chrome-sandbox extraído para `/tmp/.mount_xxx` não tem setuid bit, e AppArmor bloqueia o namespace fallback.

**How to avoid (3 opções, da menos invasiva à mais permanente):**
1. **Runtime flag:** `./JARVIS.AppImage --no-sandbox` — desativa sandbox do Chromium. Trade-off: renderer perde isolamento OS-level. Aceitável para uso pessoal (CONTEXT D-05 já valida em Linux do user).
2. **AppArmor profile:** criar `/etc/apparmor.d/jarvis-appimage` com `userns,` directive. Mais permanente, exige permissão sudo no install.
3. **System-wide opt-out (NÃO recomendado):** `sudo sysctl kernel.apparmor_restrict_unprivileged_userns=0` — desativa hardening para todos os apps.

**Recomendação README:** documentar opção 1 (mais simples), mencionar opção 2 brevemente. Não recomendar opção 3.

**Source:** [How to Fix AppImage Sandbox Issues in Ubuntu 24.04 (tamim.blog)](https://tamim.blog/post/fix-appimage-sandbox-issues-ubuntu-24-04/).

### Pitfall 4: Windows portable não pode ser auto-deletado em runtime

**What goes wrong:** Portable .exe extrai para `%TEMP%/{uuid}` e executa de lá. Se app tenta auto-update ou self-delete, falha — Windows mantém handle no .exe enquanto processo roda.

**Why it happens:** Design feature do `pkg-fetch` runtime do portable target. Cleanup do TEMP dir acontece em next boot via `cleanmgr`.

**How to avoid:** Não tentar auto-update no portable (DIST-FUT-01 já deferido). Documentar no README que portable é "extract & forget" — não persiste settings no `.exe` dir, usa `userData` global como qualquer install.

**Warning signs:** N/A — comportamento esperado.

**Source:** [Make portable a true portable? (electron-builder #6473)](https://github.com/electron-userland/electron-builder/issues/6473).

### Pitfall 5: macOS Sequoia (15.0+) mudou o Gatekeeper bypass

**What goes wrong:** README escrito assumindo macOS 14 (Sonoma) — instrui "right-click → Open → Open Anyway". Em macOS 15 (Sequoia) essa opção foi removida; right-click só mostra "Open" sem o override de Gatekeeper.

**Why it happens:** Apple removeu right-click Open bypass em Sequoia para reforçar Gatekeeper. Único caminho: System Settings → Privacy & Security → scroll to bottom → "Open Anyway" button (aparece SOMENTE depois da primeira tentativa que falhou).

**How to avoid:** README DIST-05 deve documentar o path Sequoia 15+:
1. Tente abrir `JARVIS.app` (vai falhar com "cannot be opened because Apple cannot check it for malicious software").
2. Vá em System Settings → Privacy & Security.
3. Role até o fim da página, clique em "Open Anyway" no card que aparece para JARVIS.
4. Confirme no diálogo seguinte.

Em macOS 14 (Sonoma) e anteriores, o método right-click ainda funciona como alternativa.

**Source:** [Apple Support: Safely open apps on your Mac](https://support.apple.com/en-us/102445) + [MacOS Sequoia "Allow Apps from Anywhere"](https://discussions.apple.com/thread/255759797).

### Pitfall 6: pnpm + electron-builder + native modules em build host diferente do target

**What goes wrong:** Build de macOS DMG em Linux (D-02 explicitamente proibido). Build de Linux AppImage em Linux mas com sharp prebuilt para win32-x64 apenas — AppImage gerado falha ao carregar `sharp` em runtime no Linux.

**Why it happens:** `pnpm install` em Linux baixa **apenas** os optionalDependencies relevantes para a plataforma host (`sharp` puxa `@img/sharp-linux-x64` em Linux, `@img/sharp-win32-x64` apenas em Windows). Cross-build com wine NÃO baixa o `@img/sharp-win32-x64` automaticamente.

**How to avoid:**
1. Pre-flight verifica existência de `node_modules/@img/sharp-{platform}-{arch}` correspondente ao target.
2. Se faltar, executar `pnpm install --force` ou setar env `npm_config_platform=win32` antes de `pnpm install` (advanced, Claude's discretion).
3. **Alternativa simpler para uso pessoal:** rodar `pnpm install` uma vez por target platform. Documentar no README.

**Warning signs:** electron-builder log warning "extraResources source not found: node_modules/@img/sharp-win32-x64". Build não falha, mas AppImage em runtime trava ao import sharp.

**Source:** [Sharp issue #3622](https://github.com/lovell/sharp/issues/3622) — discute Universal build com sharp.

## Code Examples

Verified patterns from official sources e do código atual do JARVIS.

### electron-builder.yml — bloco win expandido (D-06)
```yaml
# Source: electron-builder docs (https://www.electron.build/) + CONTEXT.md D-06
win:
  target:
    - nsis
    - portable
  # Sem 'arch' declarado — default x64
  # Defaults NSIS aplicam:
  #   oneClick: true             (instalação one-step sem prompts)
  #   perMachine: false          (instala em %APPDATA%\Local\Programs\JARVIS)
  #   createStartMenuShortcut: true   (atalho Menu Iniciar — DIST-01)
  #   createDesktopShortcut: true     (atalho Área de Trabalho — bonus)
  #   runAfterFinish: true       (abre JARVIS após install)
  #   Uninstaller registry entry: automático (Painel de Controle — DIST-01)
```

### electron-builder.yml — bloco mac universal CORRIGIDO (D-06 + Pitfall 1)
```yaml
# Source: electron-builder docs §macOS Configuration
# CORREÇÃO ao CONTEXT D-06: usar 'universal' em vez de '[arm64, x64]'
mac:
  target:
    - target: dmg
      arch:
        - universal
  # mergeASARs: true é default em universal — não precisa declarar
  extendInfo:
    NSMicrophoneUsageDescription: "JARVIS precisa do microfone para detectar o wake word 'Hey JARVIS'."
```

### electron-builder.yml — bloco linux (D-06, sem mudança no target)
```yaml
linux:
  target: AppImage
  # AppImage default artifactName: "${productName}-${version}.${ext}" → "JARVIS-0.1.0.AppImage"
  # category: "Utility" sugerido — opcional, melhora integração com menu apps
  category: Utility
```

### root package.json scripts (D-16)
```json
{
  "scripts": {
    "dev": "pnpm run --parallel --stream --filter \"@jarvis/*\" dev",
    "build": "pnpm run --recursive --filter \"@jarvis/*\" build",
    "dist": "node scripts/preflight-dist.mjs $(node -e \"console.log({linux:'linux',darwin:'mac',win32:'win'}[process.platform])\") && pnpm -F @jarvis/desktop build:dist",
    "dist:win": "node scripts/preflight-dist.mjs win && pnpm -F @jarvis/desktop build:dist:win",
    "dist:mac": "node scripts/preflight-dist.mjs mac && pnpm -F @jarvis/desktop build:dist:mac",
    "dist:linux": "node scripts/preflight-dist.mjs linux && pnpm -F @jarvis/desktop build:dist:linux"
  }
}
```

> **Simplificação alternativa:** Se a inline `node -e` complica, o `pnpm dist` (sem target) pode pular o pre-flight target check e só validar models + .env.example (Claude's discretion no planner).

### Tray menu item (D-10) — diff cirúrgico em tray.ts

Inserir no array de `Menu.buildFromTemplate`, **após** o bloco `Modo de Voz` (linhas 88-128) e **antes** do separador antes de "Mostrar":

```ts
// Source: novo, plan 71-01, position depois de Modo de Voz submenu
{ type: 'separator' },
{
  label: 'Abrir .env',
  click: () => {
    shell.showItemInFolder(resolveEnvPath());
  },
},
```

Adicionar imports no topo:
```ts
import { Tray, Menu, app, BrowserWindow, systemPreferences, shell } from 'electron';
import { resolveEnvPath } from './envPath.js';
```

### scripts/download-whisper-model.mjs — adicionar suporte ao "medium" (D-13)

O script atual (linhas 22-38) só tem `tiny`, `base`, `large`. Precisa adicionar entry `medium`:

```js
// Add ao MODELS object — URL via huggingface direto (não xet-bridge AWS signed URL que expira)
medium: {
  filename: 'ggml-medium.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  sizeMb: 1500,
},
```

> **Bonus cleanup:** As URLs com signed query strings AWS (linhas 25, 30, 35) **expiram em ~1 ano**. URLs `huggingface.co/.../resolve/main/...` (já em uso em `whisperResources.ts:61-66`) são permanentes. Phase 71 pode substituir todas (Claude's discretion, baixa prioridade).

### README §Build & Install — esqueleto (D-18)

```markdown
## Build & Install

### Build local

Gera binários distribuíveis para uma plataforma específica:

\`\`\`bash
pnpm dist          # gera para o OS atual (Linux=AppImage, macOS=DMG, Windows=NSIS+portable)
pnpm dist:linux    # AppImage (Linux host)
pnpm dist:win      # NSIS installer + portable (Linux ou Windows host, requer wine+mono em Linux)
pnpm dist:mac      # DMG universal (macOS host APENAS)
\`\`\`

**Pré-requisito para cross-build Windows em Linux:**

\`\`\`bash
sudo apt install wine wine32 wine64 mono-devel
\`\`\`

> macOS DMG só pode ser buildado em macOS 12+ (limitação Apple). Em Linux/Windows host, `pnpm dist:mac` falha-fast com mensagem clara.

### Onde os binários ficam

Após `pnpm dist:*`, os binários estão em `apps/desktop/release-v2/`:
- **Windows NSIS:** `JARVIS Setup 0.1.0.exe`
- **Windows portable:** `JARVIS 0.1.0.exe`
- **macOS DMG:** `JARVIS-0.1.0-universal.dmg`
- **Linux AppImage:** `JARVIS-0.1.0.AppImage`

### Instalação Windows

**NSIS installer (.exe):**
1. Duplo-clique em `JARVIS Setup 0.1.0.exe`.
2. **SmartScreen:** Windows pode mostrar "Microsoft Defender SmartScreen prevented an unrecognized app from starting". Clique em **More info** → **Run anyway**.
3. O instalador segue automático (one-click). JARVIS instala em `%APPDATA%\Local\Programs\JARVIS\` e cria atalhos no Menu Iniciar e na Área de Trabalho.
4. Desinstalação: Painel de Controle → "Apps & Features" → "JARVIS" → Uninstall.

**Portable (.exe):**
1. Duplo-clique em `JARVIS 0.1.0.exe`.
2. Mesmo aviso SmartScreen — "More info" → "Run anyway".
3. JARVIS executa diretamente, sem instalação, sem privilégios admin. Settings persistem em `%APPDATA%\JARVIS\` (mesmo path da versão instalada).

### Instalação macOS

1. Duplo-clique em `JARVIS-0.1.0-universal.dmg` para montar.
2. Arraste `JARVIS.app` para `/Applications`.
3. **Gatekeeper:** primeira execução bloqueada com "JARVIS cannot be opened because Apple cannot check it for malicious software". Caminho para bypass:
   - **macOS 15 (Sequoia) e mais novo:** Após a tentativa de abrir, vá em **System Settings → Privacy & Security**, role até o fim da página, clique em **Open Anyway** no card que aparece para JARVIS.
   - **macOS 12-14 (Monterey/Ventura/Sonoma):** Right-click em `JARVIS.app` → **Open** → **Open** no diálogo de confirmação.
4. Primeira execução pede permissão de microfone — conceda em System Settings → Privacy & Security → Microphone.

### Instalação Linux

\`\`\`bash
chmod +x JARVIS-0.1.0.AppImage
./JARVIS-0.1.0.AppImage
\`\`\`

**Ubuntu 24.04+ (Noble):** o pacote `libfuse2` foi renomeado. Se aparecer `error loading libfuse.so.2`:
\`\`\`bash
sudo apt install libfuse2t64
\`\`\`
Alternativa sem instalar nada: `./JARVIS-0.1.0.AppImage --appimage-extract-and-run`.

**Sandbox error em Ubuntu 24+:** se aparecer `SUID sandbox helper binary was found, but is not configured correctly`, execute com `--no-sandbox`:
\`\`\`bash
./JARVIS-0.1.0.AppImage --no-sandbox
\`\`\`

### Configuração pós-install (`.env`)

Após primeira execução, JARVIS cria automaticamente um arquivo `.env` baseado em `.env.example`. Caminho por OS:

| OS | Caminho |
|----|---------|
| Windows | `%APPDATA%\JARVIS\.env` |
| macOS | `~/Library/Application Support/JARVIS/.env` |
| Linux | `~/.config/JARVIS/.env` (respeita `$XDG_CONFIG_HOME`) |

**Atalho:** clique no ícone do JARVIS na bandeja do sistema (tray) e selecione **"Abrir .env"** — abre o arquivo no gerenciador de arquivos do sistema.

Edite `LLM_PROVIDER`, `OPENAI_API_KEY`, `LM_STUDIO_URL` etc. e **reinicie o JARVIS** para aplicar mudanças.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `arch: [arm64, x64]` (2 DMGs) | `arch: [universal]` (1 DMG universal via lipo + ASAR merge) | electron-builder 22.10+ (2021); melhorias contínuas até 26.x | DIST-03 critério "universal" exige migration na D-06. |
| AppImage + libfuse2 | AppImage + libfuse2t64 (Ubuntu 24.04) ou `--appimage-extract-and-run` | Ubuntu 24.04 Noble release (April 2024) — Time-64 ABI transition | README DIST-05 precisa documentar (Pitfall 2). |
| macOS Gatekeeper right-click Open | System Settings → Privacy & Security → Open Anyway (Sequoia 15+) | macOS 15 Sequoia (Sept 2024) | README DIST-05 precisa documentar caminho diferenciado por versão (Pitfall 5). |
| Electron Chromium sandbox setuid | Electron sandbox via user-namespaces (bloqueado em Ubuntu 24.04 AppArmor 4.0) | Ubuntu 24.04 + AppArmor 4.0 (April 2024) | README DIST-05 deve mencionar `--no-sandbox` runtime flag para Linux (Pitfall 3). |
| Custom `.env` parsing | `process.loadEnvFile` (Node 21+ native) | Node 21 LTS (Oct 2023) | Já em uso no `index.ts:27`. Phase 71 não muda parsing — só ajusta path resolver. |
| `pkg` Node binary | electron-builder (Electron-only) | electron-builder 1.0 (2017) | N/A — JARVIS sempre foi Electron. |

**Deprecated/outdated:**
- **Squirrel.Windows:** target legado, deprecated em favor de NSIS. JARVIS não usa.
- **electron-packager:** lower-level, depreciado em favor de electron-builder para distribution.
- **Wine 1.x:** unsupported. Wine 6+ recomendado para Electron 41. Ubuntu 24.04 ships wine-9.x.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | wine-9.x em Ubuntu 24.04 funciona com electron-builder 26.8.1 para gerar NSIS .exe | Standard Stack | Build cross-platform falha. Mitigação: pre-flight valida `wine --version` ≥ 6.x; usuário pode cair em Docker `electronuserland/builder:wine` como fallback. |
| A2 | `mac: arch: [universal]` produz 1 DMG universal corretamente com `@fugood/whisper.node` darwin-arm64 + darwin-x64 prebuilds presentes em `node_modules` | Common Pitfalls | DMG falha em runtime em uma das archs. Mitigação: D-04 deixa UAT do DMG manual em Mac do user; falha detectada antes de release. |
| A3 | `pnpm install` em Linux host instala `@img/sharp-linux-x64` mas NÃO instala `@img/sharp-darwin-*` ou `@img/sharp-win32-x64` automaticamente | Common Pitfalls #6 | Build cross-target falha silenciosamente no extraResources copy ("source not found" warning). Mitigação: pre-flight verifica + planner pode forçar `pnpm install --force` ou rebuild sharp. |
| A4 | Electron 41 `app.getPath('userData')` em Linux respeita `$XDG_CONFIG_HOME` | Pattern 1 | `.env` cai em path inesperado em distros não-default. Mitigação: documentar fallback `~/.config/JARVIS/` no README. |
| A5 | `shell.showItemInFolder` funciona em distros Linux com Nautilus/Dolphin/Thunar via DBus `org.freedesktop.FileManager1` | Pattern 4 | Em DE minimalistas (i3, dwm sem file manager), action falha silenciosamente. Mitigação: comportamento aceitável (uso pessoal user roda GNOME/KDE confirmado pelo CONTEXT). |
| A6 | macOS Sequoia 15.0 ainda permite "Open Anyway" via System Settings (não tornou apps unsigned 100% bloqueados) | Pitfall 5 | README inválido para macOS 15+. Mitigação: doc atualizada via Apple Support recente (out 2024). Re-verificar próximo a release. |
| A7 | `--appimage-extract-and-run` flag funciona em AppImages gerados por electron-builder 26.x | Pitfall 2 | User com fuse2 missing fica sem AppImage funcional. Mitigação: flag é padrão AppImage spec (não específico do builder), testado por upstream appimagetool. |
| A8 | Atualizar `download-whisper-model.mjs` para suportar `medium` é seguro (URL HuggingFace permanente) | Code Examples §download script | Download falha → pre-flight aborta. Mitigação: URLs HuggingFace já em uso em `whisperResources.ts:64` em produção. |
| A9 | `productName: JARVIS` (sem espaços, sem caracteres especiais) é válido como folder name em userData em todos os OS | Pattern 1 | Path resolution quebra em algum OS. Mitigação: "JARVIS" é ASCII puro, válido em NTFS/HFS+/APFS/ext4/btrfs. |
| A10 | electron-builder 26.8.1 default `oneClick: true` ainda cria entry no Painel de Controle "Apps & Features" sem config extra | Standard Stack | DIST-01 critério não atendido. Mitigação: comportamento documentado em [electron.build/nsis.html](https://www.electron.build/nsis.html) e estável desde v20+. |

**Empty Assumptions table seria preferível — várias claims aqui são `[CITED]` em docs mas listadas defensivamente para o planner verificar via execução.**

## Open Questions

1. **CONTEXT D-06 mac arch ambiguity**
   - What we know: D-06 textualmente diz `target: { target: dmg, arch: [arm64, x64] }`.
   - What's unclear: Roadmap success criterion 3 e DIST-03 dizem "DMG universal arm64 + x64" — sugere universal binary, não dois DMGs.
   - Recommendation: Planner deve confirmar com user (ou via discuss-phase amendment) qual semântica querida. **Recomendação técnica: usar `arch: [universal]`** — atende o critério "universal", produz 1 artifact, e mantém o spirit da decisão de cobrir ambas arches. Se o user de fato quer **2 DMGs separados**, isso muda README, validação UAT e expectativas. ALTA prioridade clarificar.

2. **macOS DMG validation strategy sem Mac físico**
   - What we know: D-02 / D-04 — Phase 71 não tenta build de DMG em Linux (electron-builder rejeita). UAT do DMG fica para quando user tiver Mac.
   - What's unclear: Como validar **agora** que a config mac do yml é sintaticamente correta sem `--mac` flag rodando? `electron-builder --help` não valida config. Em Linux, `electron-builder --linux --config electron-builder.yml` parseia o yml inteiro (inclusive mac block) e falha em syntax errors.
   - Recommendation: Pre-flight `mac` target falha-fast em Linux (D-17 D-04). Validação de syntax indireta: `pnpm dist:linux` parseia o yml inteiro e dá warning se mac block tiver problema. Aceitável.

3. **sharp `@img/*` prebuilds em build cross-target**
   - What we know: `optionalDependencies` puxa só os relevantes ao host atual via pnpm.
   - What's unclear: É necessário hack `npm_config_platform` ou `pnpm install --force` antes de cross-build?
   - Recommendation: Pre-flight verifica `fs.existsSync('node_modules/@img/sharp-{platform}-{arch}')` para o target. Se faltar, log claro de remedy: `pnpm install --force --filter @jarvis/desktop` ou comparar com `pnpm rebuild sharp`. Não bloquear no planner — discovery durante UAT do primeiro build cross.

4. **`.env` chmod 0o600 hardening**
   - What we know: Runtime State Inventory flagged que `.env` em userData herda umask user (provavelmente 644).
   - What's unclear: Vale a pena Phase 71 adicionar `fs.chmodSync(envPath, 0o600)` após first-run copy?
   - Recommendation: Sim em Linux/macOS (zero custo, hardening real). Skip em Windows (chmod n/a em NTFS native). Marcar como Claude's discretion no plan 71-01.

5. **Bundle size budget**
   - What we know: D-11 sets bundle a ggml-base (142MB) + ggml-medium (1.5GB) = ~1.7GB de whisper. Mais sharp (~30MB), onnxruntime (~30MB), kokoro models (depending on what's bundled, see Phase 62 yml), Electron runtime (~150MB).
   - What's unclear: Tamanho final aproximado do NSIS .exe? Do AppImage? DMG universal duplica binários? NSIS hard limit 2GB?
   - Recommendation: Estimativa: NSIS ~2.0-2.5GB, AppImage similar, DMG universal ~3GB+ (universal duplica nativos selecionados que não fazem lipo). NSIS suporta arquivos >2GB com `unicode: true` (default). Não é blocker. UAT pode pesar artifacts e flag size. Plant-seed para deferred: reduzir bundle removendo `ggml-medium.bin` (downgrade para `tiny + base`) se size virar problema em release pública.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build runtime | ✓ | 24.12.0 | — |
| pnpm | Package manager | ✓ | 10.27.0 | — |
| electron-builder | Packaging | ✓ (devDep) | 26.8.1 | — |
| `fakeroot` | AppImage build | ✓ | system installed | — |
| `fusermount` (libfuse3) | AppImage runtime test | ✓ | system installed | — |
| `libfuse2t64` | AppImage runtime (Ubuntu 24.04) | ✗ | — | `--appimage-extract-and-run` flag em runtime |
| `wine` | Cross-build Windows .exe | ✗ | — | **NÃO HÁ FALLBACK em host atual** — user precisa `sudo apt install wine wine32 wine64` ou Docker `electronuserland/builder:wine` |
| `mono` (mono-devel) | NSIS auxiliary (técnico: só Squirrel.Windows precisa) | ✗ | — | NSIS funciona sem mono [CITED: electron.build docs]; pre-flight pode emitir warning não-fatal |
| `apps/desktop/resources/models/whisper/ggml-base.bin` | Whisper bundle (D-11) | ✓ | 147MB | — |
| `apps/desktop/resources/models/whisper/ggml-medium.bin` | Whisper bundle (D-11, D-13) | ✗ | — | Pre-flight (D-13/D-17) baixa via `scripts/download-whisper-model.mjs medium` — automatizado |
| `.env.example` raiz | extraResources bundle (D-09) | ✓ | 5.4KB | — |
| `.env` raiz | dev runtime | ✓ | 2.3KB | — |
| `node_modules/@img/sharp-linux-x64` | AppImage extraResources | a verificar | — | `pnpm install --force` |
| `node_modules/@img/sharp-darwin-arm64` | DMG mac extraResources | a verificar | — | (na verdade, build de mac não roda em Linux host — necessário só quando user buildar em Mac) |
| `node_modules/@img/sharp-darwin-x64` | DMG mac extraResources | a verificar | — | idem |
| `node_modules/@img/sharp-win32-x64` | NSIS+portable extraResources | a verificar | — | `pnpm install --force` se cross-build Win |
| macOS host | DMG build (D-02) | ✗ (Linux host) | — | **NÃO HÁ FALLBACK** — Apple proíbe cross-build; D-02 explicitamente difere o build para o user em Mac |
| Windows host | NSIS+portable UAT install (D-03) | ✗ (Linux host) | — | UAT acontece em Windows físico do user — não bloqueia phase, só bloqueia ✓ final do critério |

**Missing dependencies with no fallback:**
- **macOS host:** DMG build adiado por D-02 (validated via config). Não bloqueia phase.
- **Windows host:** UAT install adiado por D-03. Não bloqueia phase code/config; bloqueia ✓ final do DIST-01/02 critérios — esperado.

**Missing dependencies with fallback:**
- **wine + mono:** D-01 + D-17 + D-20 endereçam — README documenta install, pre-flight verifica. **User precisa rodar `sudo apt install wine mono-devel libfuse2t64` antes da primeira execução de `pnpm dist:win`.** Não bloqueia phase plan/research, mas bloqueia execução do build Win.
- **ggml-medium.bin:** Pre-flight script baixa automaticamente (D-13). Não bloqueia.
- **sharp prebuilds cross-platform:** Pre-flight verifica + remedy claro. Não bloqueia, descobre tarde se acontecer.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest 4.1.2` (já em uso em `apps/desktop`, `apps/backend-ts`, `apps/gateway`) |
| Config file | `apps/desktop/vitest.config.ts` (existente) |
| Quick run command | `pnpm -F @jarvis/desktop test --run` |
| Full suite command | `pnpm test` (todos os workspaces) |
| Smoke command | `pnpm typecheck` (validação cross-workspace, ~10-15s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **DIST-01-1** | `pnpm dist:win` produz `JARVIS Setup x.y.z.exe` em `apps/desktop/release-v2/` | build-smoke | `pnpm dist:win && test -f apps/desktop/release-v2/JARVIS\ Setup\ 0.1.0.exe` | Wave 0 — adicionar smoke script `scripts/smoke-build-win.sh` |
| **DIST-01-2** | NSIS .exe instala em Windows 10/11 com atalho Menu Iniciar + Painel de Controle uninstall | manual UAT | (não automatizável sem CI agent Windows) | UAT humana em VERIFICATION.md |
| **DIST-02-1** | `pnpm dist:win` produz `JARVIS x.y.z.exe` (portable) em `apps/desktop/release-v2/` | build-smoke | `test -f apps/desktop/release-v2/JARVIS\ 0.1.0.exe` (mesmo run de DIST-01-1) | Wave 0 — incluído em smoke-build-win.sh |
| **DIST-02-2** | Portable executa sem instalação, sem admin | manual UAT | (não automatizável) | UAT humana |
| **DIST-03-1** | `electron-builder.yml` parseia com bloco mac universal corretamente | config-smoke | `pnpm -F @jarvis/desktop exec electron-builder --linux --config electron-builder.yml --publish never -p never` (parseia yml inteiro, builda só linux, falha se mac syntax broken) | Wave 0 — não há test, comando é o test |
| **DIST-03-2** | `pnpm dist:mac` produz DMG universal em Mac | manual UAT (no Mac do user) | (D-04 — não rodável em Linux host) | UAT humana |
| **DIST-04-1** | `pnpm dist:linux` produz `JARVIS-x.y.z.AppImage` executável | build-smoke + smoke-launch | `pnpm dist:linux && ./apps/desktop/release-v2/JARVIS-0.1.0.AppImage --appimage-version` | Wave 0 — script `scripts/smoke-build-linux.sh` |
| **DIST-04-2** | AppImage abre janela em Ubuntu 24+ com `--no-sandbox` | manual UAT (D-05 — no host do user) | xvfb-run + headless smoke (opcional) | UAT humana |
| **DIST-05-1** | README contém seção `## Build & Install` com sub-headings esperados | content-smoke | `grep -q "^## Build & Install" README.md && grep -q "SmartScreen" README.md && grep -q "Gatekeeper" README.md && grep -q "libfuse2t64" README.md` | Wave 0 — bash check |
| **envPath resolver** | `resolveEnvPath()` retorna userData em packaged, monorepo root em dev | unit | `pnpm -F @jarvis/desktop vitest run envPath` | Wave 0 — `apps/desktop/src/main/__tests__/envPath.test.ts` |
| **first-run copy** | Em packaged + arquivo ausente, copia `.env.example` para userData | unit (mock fs + app.isPackaged) | `pnpm -F @jarvis/desktop vitest run firstRun` | Wave 0 — pode ir no mesmo `envPath.test.ts` ou separado |
| **tray Abrir .env** | Click no item invoca `shell.showItemInFolder(envPath)` | unit (mock shell + Menu) | `pnpm -F @jarvis/desktop vitest run tray` | Wave 0 — pode estender `tray.test.ts` se existir, ou criar |
| **preflight wine missing** | `node scripts/preflight-dist.mjs win` em Linux sem wine falha com exit 1 e mensagem actionable | integration | `node scripts/preflight-dist.mjs win; [ $? -eq 1 ]` | Wave 0 — adicionar a `scripts/test-preflight.sh` |
| **preflight mac on Linux** | `node scripts/preflight-dist.mjs mac` em Linux falha com exit 1 e mensagem clara | integration | `node scripts/preflight-dist.mjs mac; [ $? -eq 1 ]` | Wave 0 — incluído em test-preflight.sh |

### Sampling Rate

- **Per task commit:** `pnpm -F @jarvis/desktop test --run` (~30s, cobre unit tests novos)
- **Per wave merge:** `pnpm typecheck && pnpm test` (~1-2min)
- **Phase gate:** Full suite green + build smoke per target (AppImage local + config parse validation for Win/Mac) + manual UAT checklist em VERIFICATION.md para DIST-01-2 / DIST-02-2 / DIST-03-2 / DIST-04-2

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/__tests__/envPath.test.ts` — unit tests para `resolveEnvPath()` (dev vs packaged) e first-run copy (mock `fs`, `app.isPackaged`, `process.resourcesPath`)
- [ ] `apps/desktop/src/main/__tests__/tray-env.test.ts` ou estender `tray.test.ts` — mock `shell.showItemInFolder`, validar invoke
- [ ] `scripts/smoke-build-linux.sh` — chama `pnpm dist:linux` num env limpo + verifica artifact presence + smoke `--appimage-version`
- [ ] `scripts/smoke-build-win.sh` — chama `pnpm dist:win` + verifica 2 artifacts (NSIS + portable). Pulado em host sem wine (planner decide se skip ou fail).
- [ ] `scripts/test-preflight.sh` — invoca pre-flight em vários cenários (target=win without wine, target=mac on Linux, all OK)
- [ ] **Manual UAT checklist em VERIFICATION.md** — listar passos human-verified para DIST-01-2 (Windows install), DIST-02-2 (portable run), DIST-03-2 (Mac install via DMG), DIST-04-2 (AppImage launch). User valida cada um.

*(Existing test infrastructure já cobre: vitest está pronto, env detection ok. Gaps são puramente de scripts de smoke + UAT human checklist.)*

## Security Domain

Security enforcement está ativo no config. Phase 71 toca packaging e file I/O — categorias ASVS V5 e V6 relevantes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 71 não toca auth flows (JARVIS_API_KEY já existe). |
| V3 Session Management | no | N/A (assistente local, sem sessions externas). |
| V4 Access Control | yes | First-run `.env` copy escreve em userData — controle de acesso a credenciais (API keys) precisa preservar permissões adequadas (umask). Recomendação: `chmod 0o600` em Linux/macOS após copy. |
| V5 Input Validation | yes | Pre-flight script aceita argv (`target`). Whitelist explícita: `if (!['win', 'mac', 'linux'].includes(target)) fail()`. |
| V6 Cryptography | no | Phase 71 não introduz crypto novo. (Code signing é DIST-FUT-02, deferred.) |

### Known Threat Patterns for {electron-builder + first-run config}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API keys em `.env` world-readable | Info Disclosure | `chmod 0o600` após first-run copy (Linux/macOS); Windows herda ACL do parent dir (`%APPDATA%\JARVIS\` é user-only por default em Win 10+). |
| Path traversal em `.env.example` copy | Tampering | `process.resourcesPath` é OS-only-writable em packaged install. `path.join(...)` é safe — nenhum argv user controla path. |
| Pre-flight target argv injection | Tampering | Whitelist `target ∈ {win, mac, linux}`. Pre-flight não usa `eval` nem `child_process.exec` com string concat. |
| Bundled `.env.example` com placeholder secrets | Info Disclosure | `.env.example` por design NÃO contém secrets reais (já é convenção do repo). Verificar via grep no pre-flight: `grep -E "(=sk-|=ghp_)" .env.example && fail()`. Defensivo. |
| Tampered AppImage (sem code signing) | Spoofing | DIST-FUT-02 (deferred). Phase 71 documenta SmartScreen/Gatekeeper bypass como aceitação consciente de unsigned binary. README inclui aviso. |
| Unsigned NSIS triggers AV false positive | Repudiation / DoS | Mesmo. Aceito por design (uso pessoal). Documentado. |
| Wine sandbox escape em build host | Tampering (build chain) | Wine roda como user normal; sem privileged execution. `electron-builder` invoca wine para rodar makensis — escopo limitado a build dir. Não compromete host. |

> **Plant-seed recomendado:** Phase 71 não bloqueia, mas Phase 71.5 ou Phase 72 deveria adicionar code signing (Windows EV cert + macOS notarization). Já está em DIST-FUT-02 (v3.2).

## Sources

### Primary (HIGH confidence)
- electron-builder docs §NSIS — [electron.build/nsis.html](https://www.electron.build/nsis.html) — defaults: oneClick=true, perMachine=false, createStartMenuShortcut=true, createDesktopShortcut=true, runAfterFinish=true [VERIFIED via WebFetch]
- electron-builder docs §Multi-platform Build — [electron.build/multi-platform-build](https://www.electron.build/multi-platform-build) — wine 2.0+ required, mono 4.2+ only for Squirrel.Windows, macOS limitation [VERIFIED via WebFetch]
- Electron docs §app.getPath — [electronjs.org/docs/latest/api/app](https://www.electronjs.org/docs/latest/api/app) — userData = appData + name/productName, paths por OS [VERIFIED via WebSearch summary]
- Apple Support — [support.apple.com/en-us/102445](https://support.apple.com/en-us/102445) — Gatekeeper bypass em macOS Sequoia 15+
- AppImage docs §FUSE — [docs.appimage.org/user-guide/troubleshooting/fuse.html](https://docs.appimage.org/user-guide/troubleshooting/fuse.html) — libfuse2 dependency, extract-and-run fallback

### Secondary (MEDIUM confidence)
- electron-builder issue #6891 — [github.com/electron-userland/electron-builder/issues/6891](https://github.com/electron-userland/electron-builder/issues/6891) — universal builds + sharp arch-specific files
- electron-builder issue #1667 — [github.com/electron-userland/electron-builder/issues/1667](https://github.com/electron-userland/electron-builder/issues/1667) — portable target artifactName + win.portable interaction with nsis
- electron-builder issue #6473 — [github.com/electron-userland/electron-builder/issues/6473](https://github.com/electron-userland/electron-builder/issues/6473) — portable extracts to %TEMP%, asInvoker manifest
- It's FOSS — [itsfoss.com/cant-run-appimage-ubuntu](https://itsfoss.com/cant-run-appimage-ubuntu/) — Ubuntu 24.04 libfuse2t64 transition
- TamimBlog — [tamim.blog/post/fix-appimage-sandbox-issues-ubuntu-24-04](https://tamim.blog/post/fix-appimage-sandbox-issues-ubuntu-24-04/) — AppArmor user-namespaces hardening + --no-sandbox

### Tertiary (LOW confidence — verify in execution)
- electron-builder.Interface.NsisOptions — [electron.build/electron-builder.Interface.NsisOptions.html](https://www.electron.build/electron-builder.Interface.NsisOptions.html) — TypeScript types reference (LOW: just types, not behavior docs)
- pnpm + native modules cross-platform install — anecdotal de issues sharp/electron-builder; behavior pode variar entre pnpm 8/9/10. Validar em UAT.

### Internal references (VERIFIED via local file read)
- `apps/desktop/electron-builder.yml` — state atual, 170 linhas
- `apps/desktop/src/main/index.ts:11-30` — boot sequence, envPath, migration hook
- `apps/desktop/src/main/tray.ts` — tray menu pattern para extension (D-10)
- `apps/desktop/src/main/voiceInput/resources.ts` — pattern dev vs packaged path resolver (Phase 22)
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — runtime resolver + on-demand download pattern
- `scripts/download-whisper-model.mjs` — pre-flight invoca este script (D-13/D-17)
- `.env.example` — template para bundle (D-09)
- `README.md` — target de edit (D-18/D-19/D-20)
- `.planning/phases/70-llm-config-migration/70-CONTEXT.md` D-01 — defer de envPath packaged para Phase 71
- `.planning/phases/68-whisper-model-override-fix/68-CONTEXT.md` — UI normalization (5 modelos: tiny/base/small/medium/large-v3-turbo)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas via `pnpm list`, defaults via docs oficiais.
- Architecture patterns: HIGH — Pattern 1, 3, 4, 5 já existem no codebase (apenas extensão); Pattern 2 (first-run copy) é trivial fs + fs.existsSync.
- Pitfalls: HIGH — todos pitfalls verificados em docs oficiais + GitHub issues + community reports (links nas Sources).
- Mac universal ambiguity (Pitfall 1 + Open Question 1): HIGH-MEDIUM — sintaxe correta confirmada em docs, mas D-06 do CONTEXT diverge; depende de discussão com user. Flagged como ACTION REQUIRED.
- Environment audit: HIGH — host probed diretamente. wine/mono missing confirmados via `command -v`.
- Validation architecture: MEDIUM — gap entre tests que existem hoje (vitest unit) e UAT human-verified necessária. Estrutura proposta é razoável mas precisa Wave 0 setup.

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 dias — electron-builder estável, Ubuntu 24.04 stable, macOS Sequoia recente mas estável; revisar se electron-builder 27.x sai)

---

*Phase: 71-multi-platform-distribution*
*Research conducted: 2026-05-12*
