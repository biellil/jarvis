# Phase 9: Electron Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 09-electron-scaffold
**Areas discussed:** IPC patterns, React setup, Build workflow

---

## IPC patterns

### Como estruturar os handlers IPC no main process?

| Option | Description | Selected |
|--------|-------------|----------|
| Handlers centralizados em src/main/ipc/ por feature | Um arquivo por feature (ex: ipc/chat.ts com setupChatHandlers()). Main chama cada setup(). Fácil de escalar, claro onde adicionar novos handlers. | ✓ |
| Handlers inline no main/index.ts | Todos os ipcMain.handle() direto no arquivo principal. Simples para poucas features, mas fica bagunçado rápido. | |
| Class-based handlers (IpcHandler interface) | Classes implementando interface com método handle(). Mais OOP, útil se quiser DI/testing mais sofisticado. | |

**User's choice:** Handlers centralizados em src/main/ipc/ por feature (Recomendado)

---

### Como garantir type safety entre renderer e main?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared types em src/shared/ipc-types.ts | Um arquivo com interfaces Request/Response por canal. Preload importa e tipa contextBridge, renderer importa window.jarvis. Type errors aparecem no build se mudar API. | ✓ |
| Duplicar tipos (renderer e main separados) | Cada lado define seus próprios tipos. Mais isolado mas pode ficar dessincronizado — refactor quebrando em runtime. | |
| Zod schemas para validação runtime | Além de tipos TS, validar payloads IPC com Zod (igual gateway faz). Mais seguro mas overhead para IPC interno de um app local. | |

**User's choice:** Shared types em src/shared/ipc-types.ts (Recomendado)

---

### Como tratar erros que acontecem no main process via IPC?

| Option | Description | Selected |
|--------|-------------|----------|
| Handlers retornam { success, data?, error? } | Padrão Result type. Renderer sempre recebe resposta estruturada, nunca reject. Fácil de tipar e display error no UI. | ✓ |
| Throw exceptions normalmente (IPC propaga reject) | Handler lança erro, ipcRenderer.invoke() rejeita a Promise. Mais direto mas error message pode ser ofuscado pelo IPC. | |
| Event-based error channel separado | Handler envia erro via evento separado em vez de retornar. Mais complexo, útil para erros assíncronos não ligados a um invoke. | |

**User's choice:** Handlers retornam { success, data?, error? } (Recomendado)

---

### O success criteria menciona window.jarvis.sendText('teste'). Como estruturar esse exemplo no scaffold?

| Option | Description | Selected |
|--------|-------------|----------|
| Implementar sendText funcional que loga no main | Handler real em main/ipc/chat.ts que recebe a string e loga. Prova que IPC funciona end-to-end. Base para adicionar POST /api/chat depois. | ✓ |
| Stub que retorna mock response | Handler retorna { success: true, data: 'echo: teste' } sem lógica. Valida type safety mas não prova integração real. | |
| Fazer sendText já chamar POST /api/chat | Handler faz fetch para o gateway. Mais completo mas Phase 9 é scaffold — integração é Phase 12. | |

**User's choice:** Implementar sendText funcional que loga no main (Recomendado)

---

## React setup

### Usar React puro ou adicionar framework no renderer?

| Option | Description | Selected |
|--------|-------------|----------|
| React puro + react-router-dom | Sem framework adicional. Electron-vite já faz o build, React cobre o UI. Router para navegação se precisar (settings, etc). Gateway é Express puro — consistência. | ✓ |
| Vite SPA mode (sem Electron-vite) | Usar Vite standalone no renderer. Mais familiar pra quem conhece Vite, mas electron-vite já é Vite otimizado pra Electron. | |
| TanStack (Query + Router) | TanStack Query pra cache de API, TanStack Router. Mais tooling mas pode ser overkill pra um widget. | |

**User's choice:** React puro + react-router-dom (Recomendado)
**Notes:** Usuário confirmou entendimento de que renderer roda no Chromium embarcado, não no navegador externo.

---

### Como gerenciar estado no renderer React?

| Option | Description | Selected |
|--------|-------------|----------|
| Context API + useState/useReducer | Built-in React. Sem dependências extras. Suficiente pra um widget com poucos estados (orb state, input text). Simples e direto. | ✓ |
| Zustand | State manager leve (3kb). Menos boilerplate que Redux. Útil se tiver muitos estados globais, mas widget é pequeno. | |
| Nada ainda — só local state | useState em cada componente. Adicionar state manager depois se precisar. Começar mais simples possível. | |

**User's choice:** Context API + useState/useReducer (Recomendado)

---

### Estrutura de componentes no renderer — como organizar?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat em src/renderer/components/ | Todos os componentes em um diretório. App.tsx na raiz do renderer. Simples pra começar, reorganizar depois se crescer. | |
| Por feature: components/Orb/, components/Chat/ | Agrupar componentes relacionados. Mais organizado desde o início mas pode ser overkill pro scaffold. | ✓ |
| Atomic Design (atoms/molecules/organisms) | Metodologia de design system. Muito estruturado mas complexo demais pra Phase 9. | |

**User's choice:** Por feature: components/Orb/, components/Chat/

---

## Build workflow

### Scripts no package.json — seguir padrão do gateway?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, mesmos nomes: dev, build, start | Gateway tem pnpm dev/build/start. Desktop terá os mesmos. Consistência no monorepo — pnpm --filter desktop dev funciona igual. | ✓ |
| Scripts específicos de Electron: dev, build, package | Adicionar 'package' pra gerar executável (electron-builder). Mais completo mas packaging é fora do escopo da Phase 9. | |
| Scripts mínimos: apenas dev | Só o necessário pra rodar. Adicionar build/start quando precisar. | |

**User's choice:** Sim, mesmos nomes: dev, build, start (Recomendado)

---

### Comportamento do hot reload no modo dev?

| Option | Description | Selected |
|--------|-------------|----------|
| Renderer: hot reload, Main: restart | Mudanças no renderer atualizam sem fechar a janela. Mudanças no main reiniciam o Electron. Padrão electron-vite — bom equilíbrio. | ✓ |
| Full restart sempre | Qualquer mudança fecha e reabre o Electron. Mais lento mas garante estado limpo sempre. | |
| Hot reload em tudo (experimental) | Tentar hot reload no main também. Mais rápido mas pode causar bugs de estado. | |

**User's choice:** Renderer: hot reload, Main: restart (Recomendado)

---

### Sourcemaps e debugging no modo dev?

| Option | Description | Selected |
|--------|-------------|----------|
| Sourcemaps em dev, sem em prod | Dev tem sourcemaps inline — debugar TypeScript original. Prod não gera sourcemaps — build menor e mais rápido. | ✓ |
| Sourcemaps sempre | Dev e prod com sourcemaps. Útil pra debugar prod mas aumenta tamanho do bundle. | |
| Sem sourcemaps | Debugar via console.log. Mais leve mas perder stack traces TypeScript. | |

**User's choice:** Sourcemaps em dev, sem em prod (Recomendado)

---

## Claude's Discretion

Áreas onde o usuário disse "você decide" ou deixou para Claude:
- Configuração exata do electron-vite.config.ts (otimizações, aliases)
- Estrutura interna de pastas em cada feature de componente
- Naming convention para handlers IPC (sufixo Handler, prefix setup)
- Se adicionar .env reader ou usar process.env direto no main

## Deferred Ideas

**Testing strategy (Playwright/Vitest):** Área apresentada mas usuário não selecionou para discussão. Adicionar quando precisar validar flows completos.
