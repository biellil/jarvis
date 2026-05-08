---
status: complete
phase: 64-mcp-server
source:
  - 64-01-SUMMARY.md
  - 64-02-SUMMARY.md
  - 64-03-SUMMARY.md
started: 2026-05-08T20:30:00Z
updated: 2026-05-08T20:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Mata qualquer processo do JARVIS rodando, limpa caches efêmeros, e dá `pnpm dev` do zero.
  App boota sem erro no terminal, janela do JARVIS abre, e Settings (Ctrl+Shift+J) abre sem crash.
result: pass

### 2. MCP unit tests pass
expected: |
  `cd apps/backend-ts && npx vitest run src/mcp/` — todos os 10+ testes verdes
  (server.test.ts, tools/memory.test.ts, tools/file-actions.test.ts).
result: pass
notes: 3 test files, 10/10 tests passed (1.03s). stderr esperado vem do teste isError:true do recall_memory (console.error é a disciplina stdio).

### 3. Settings nav shows "Servidor MCP"
expected: |
  Abre Settings, na sidebar esquerda aparece um item "Servidor MCP" com ícone de servidor.
  Clicando nele, conteúdo principal mostra "Servidor MCP: Inativo" e botão "Habilitar".
result: pass

### 4. Toggle MCP Habilitar/Desabilitar
expected: |
  Clica "Habilitar" — status muda pra "Servidor MCP: Ativo" e aparece "Clientes conectados: 0".
  Clica "Desabilitar" — status volta pra "Inativo".
result: pass

### 5. Preferência MCP persiste após restart
expected: |
  Habilita o MCP, fecha o JARVIS completamente, abre de novo e abre Settings → "Servidor MCP".
  Status ainda mostra "Ativo" (estado vem do electron-store).
result: pass

### 6. MCP server lista 5 tools via stdio
expected: |
  Build do backend-ts e roda:
  `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node apps/backend-ts/dist/mcp/server.js`
  Resposta JSON lista exatamente 5 tools: recall_memory, list_files, openFile, openFolder, viewContent.
result: pass

### 7. recall_memory devolve dado real via MCP
expected: |
  `echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"recall_memory","arguments":{"query":"test"}}}' | node apps/backend-ts/dist/mcp/server.js`
  Resposta tem `content: [{ type: "text", text: "..." }]` com texto não-vazio (memória real ou fallback honesto).
result: pass

### 8. list_files devolve listagem real via MCP
expected: |
  Chamada `tools/call` em `list_files` com diretório permitido (ex.: home do usuário) retorna
  `content` com array de arquivos/pastas reais. Caminhos fora do allowlist falham com erro claro.
result: pass

### 9. Sem poluição em stdout do MCP server
expected: |
  Rodando `node apps/backend-ts/dist/mcp/server.js` interativamente, qualquer log do servidor sai em stderr
  (`2>` redireciona). stdout só carrega JSON-RPC. Nenhum console.log vazando.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
