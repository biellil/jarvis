# Phase 69: MCP Server Removal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 69 — MCP Server Removal
**Areas discussed:** Bridge window.mcp, McpSection.tsx em P69, Limpeza electron-store, Smoke test MCP Client

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Bridge window.mcp | Como tratar o objeto window.mcp do preload — hoje mistura métodos do server e do client. | ✓ |
| McpSection.tsx em P69 | Phase 70 vai remover toda a section 'Servidor MCP' da UI. Em P69: stripar só sub-block server? Pra P70? Apagar section inteira? | ✓ |
| Limpeza electron-store | Apagar schema/accessors agora? Migração ativa que remove a chave no startup? Ou deixar dead pra P70? | ✓ |
| Smoke test MCP Client | Critério 3 exige smoke test E2E. Usar e2e-mock-server.test.ts existente? Escrever teste novo? UAT manual? | ✓ |

**User's choice:** Todas as 4 áreas selecionadas para discussão.

---

## Bridge window.mcp

| Option | Description | Selected |
|--------|-------------|----------|
| Manter window.mcp enxuto (recomendado) | Apaga toggle/getConnectedClients do preload e do bridge; window.mcp continua existindo só com reloadClient/getClientStatus/onClientStatusChanged. McpSection mantém as referências atuais. Mínimo churn, máxima cirurgia — mesma filosofia do Phase 68. | ✓ |
| Renomear para window.mcpClient | Mais explicit semanticamente — sinaliza que JARVIS só faz papel de client agora. McpSection.tsx e qualquer test que use window.mcp precisa migrar para window.mcpClient. Churn extra em troca de clareza. | |
| Eliminar bridge, fundir em window.settings | Move reloadClient/getClientStatus para dentro do bridge window.settings que já existe. Mais refactor; eliminar 1 bridge dedicado. Provavelmente over-engineering pra remoção. | |

**User's choice:** Manter window.mcp enxuto (recomendado)
**Notes:** Captura como D-01/D-02/D-03 em CONTEXT.md.

---

## McpSection.tsx em P69

| Option | Description | Selected |
|--------|-------------|----------|
| Stripar só o sub-block server agora (recomendado) | Em P69: remove o <Field> do Servidor MCP de dentro do McpSection.tsx; remove handleMcpToggle/mcpEnabled/mcpClients/mcpToggling do SettingsLayout. O sub-block 'Cliente MCP' fica visivelmente no mesmo lugar. UI permanece coerente entre P69 e P70 — nada quebrado, nada órfão. | ✓ |
| Não tocar UI em P69; deixar pra P70 | Só remove backend + IPC. O sub-block 'Servidor MCP' continua na UI clicando em IPC inexistente — toggle vira no-op com erro silencioso entre P69 e P70. Mais simples no diff de P69 mas deixa bug visível temporariamente. | |
| Apagar McpSection inteiro agora | Antecipa P70 — remove section key, McpSection.tsx, e a section da SettingsLayout. Mas o sub-block client UI também sai junto — usuário perde botão 'Reconectar' (config segue via .env). Phase 70 já promete remover essa section. | |

**User's choice:** Stripar só o sub-block server agora (recomendado)
**Notes:** Captura como D-11/D-12/D-13/D-14 em CONTEXT.md.

---

## Limpeza electron-store

| Option | Description | Selected |
|--------|-------------|----------|
| Apagar schema + accessors agora (recomendado) | Remove o campo do schema (store.ts:73-74), as funções getMcpServerEnabled/setMcpServerEnabled (linhas 454-459), e o read em ipc/settings.ts:101. electron-store ignora chaves desconhecidas no settings.json existente — então não causa crash. A chave órfã fica no JSON do usuário até a próxima editação sobrescrevê-lo. Simples, zero risco. | ✓ |
| Migration ativa: deletar a chave no boot | Adiciona um one-shot no startup do Electron que faz store.delete('mcpServerEnabled') se existir. Store fica limpinho após a primeira execução de v3.1. ~5 linhas extras + um teste. Consistente com a migração de LLM que P70 vai fazer. | |
| Manter schema deprecated; cleanup em P70 | Schema fica, marca // @deprecated, P70 faz o cleanup junto com a migração de LLM. Acopla P69 a P70. | |

**User's choice:** Apagar schema + accessors agora (recomendado)
**Notes:** Captura como D-09/D-10 em CONTEXT.md. Padrão de read-time tolerance de chaves órfãs em electron-store (já estabelecido em Phase 68).

---

## Smoke test MCP Client

| Option | Description | Selected |
|--------|-------------|----------|
| Confiar no e2e-mock-server.test.ts existente (recomendado) | P69 confirma que o teste continua passando após remoção do server. Verifica o caminho crítico: McpClientManager se conecta ao mock, listTools retorna tools, callTool funciona. É o teste já considerado E2E pelo Phase 65. Zero custo, alta confiança porque os módulos client/* não são tocados nesta phase. | ✓ |
| Adicionar smoke test de boot real do backend | Novo teste que bota MCP_SERVER_URL para um mock HTTP server vivo (vitest setupFile), bota o backend up, hits /v1/chat com uma mensagem que requer tool externo, verifica resposta. Cobertura mais real, mas demanda fixture HTTP server real (~50-100 LOC novo) e roda lento. | |
| Checklist UAT manual em VERIFICATION.md | P69 deixa documentado um passo-a-passo manual (configurar MCP_SERVER_URL para o servidor real do user, abrir chat, pedir tool externo, verificar tool aparece). Sem código de teste. Mais barato de implementar, depende do user rodar. | |

**User's choice:** Confiar no e2e-mock-server.test.ts existente (recomendado)
**Notes:** Captura como D-16 em CONTEXT.md.

---

## Final check

| Option | Description | Selected |
|--------|-------------|----------|
| Pronto para criar CONTEXT.md | Tenho as 4 decisões críticas + o achado de que createMcpServer é dead code. Gera o CONTEXT.md. | ✓ |
| Explorar mais gray areas | Tem outro ângulo — ex: estratégia de delete dos arquivos do server, atualização de PROJECT.md, dep @modelcontextprotocol/sdk, etc. | |

**User's choice:** Pronto para criar CONTEXT.md

---

## Claude's Discretion

- Ordem de splits dos plans dentro do phase (backend/electron/renderer).
- Trocar ou manter a label "Servidor MCP" no nav até P70.
- Limpar comentários históricos `// Phase 64` em arquivos remanescentes.

## Deferred Ideas

- Remoção da section MCP inteira do Settings UI (Phase 70).
- Renomear mcp-settings.ts para mcp-client-settings.ts (cosmético).
- Active migration deletando `mcpServerEnabled` no boot (rejected — chave órfã é inócua).
- Atualizar MCP-SRV-01/02/03 no PROJECT.md (pode ficar para complete-milestone audit).
- Remover dep `@modelcontextprotocol/sdk` (NÃO — client ainda usa).
