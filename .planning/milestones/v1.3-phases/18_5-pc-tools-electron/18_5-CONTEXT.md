# Phase 18.5: PC Control Tools — Electron Executor — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 18.5 (interativo)

<domain>
## Phase Boundary

Esta fase entrega o **lado cliente** do sistema de PC Control Tools. O backend (Fase 18) já gera payloads, audita dispatch, emite via SSE e tem endpoint de result reconciliation. Esta fase pluga tudo no Electron: consumo SSE, execução real via subprocess Linux, confirmação destrutiva via dialog nativo, e reporting de outcome de volta.

**Premissa arquitetural fundamental (revelada nesta discussão):**
O backend roda **remotamente** (VPS, servidor LAN, ou instância separada). Apenas o **Electron app** (UI/UX) roda no PC do usuário. O Electron é o **único** componente que tem acesso a executar subprocess no PC do usuário. Toda comunicação backend↔Electron atravessa rede (LAN ou internet) e precisa ser projetada para isso.

Fase 18.5 já assume essa topologia, mesmo que o deployment inicial seja localhost/LAN.

**Dentro de escopo (Fase 18.5):**
- Refatorar o cliente Electron de chat para usar `GET /chat/stream` (SSE) ao invés de `POST /chat`.
- Parser SSE manual no main process (Node `fetch` com `ReadableStream` + parser de framing).
- Reconhecimento de `event: action` no stream e despacho IPC pro fluxo de execução.
- 9 handlers Linux em Node usando `child_process.execFile` (NÃO `exec`) — escape obrigatório de args.
- Modal nativo `dialog.showMessageBox` para `requires_confirmation: true` antes de executar.
- API client interno que faz `POST /tool-calls/:id/result` com header `Authorization: Bearer <API_KEY>`.
- Set em memória de `tool_call_id` processados (TTL ~5min) para idempotência em caso de reconnect SSE.
- Reconnect automático do SSE (graças ao próprio fetch wrapper — ou retry exponencial no main).
- Gateway no `apps/gateway/` adiciona proxy para `POST /tool-calls/:id/result` e injeta a API key se vier do Electron.
- Smoke test: usuário pede "abre o terminal" → Electron executa `gnome-terminal` → backend grava outcome="success".

**Fora de escopo (Fase 18.5):**
- Migrar o backend para HTTPS / Let's Encrypt — fica pra deploy ops.
- Auth mais robusta (HMAC, mTLS) — fica pra v1.4 se necessário.
- Multi-cliente / sessão concorrente — sessão única decidida na Fase 17 mantém-se.
- Streaming UX completo no renderer (mostrar tokens aparecendo) — pode entrar como bônus se for fácil, senão fica pra Fase 19/20.
- Interrupt/resume no LangGraph para esperar confirmação real antes do agente assumir sucesso — v1.4.
- macOS/Windows handlers — Linux only.
- `analyze_screen` — Fase 19.

</domain>

<decisions>
## Implementation Decisions

### Q1 — Como o Electron recebe os eventos `action`
**1a — Migra cliente pra SSE.** O `apps/desktop/src/main/ipc/chat.ts` deixa de usar `POST /chat` (response síncrono) e passa a abrir `GET /chat/stream` no main process via `fetch()` com streaming. Parser SSE manual identifica:
- Linhas `data: <token>\n\n` sem `event:` → token de texto, despacha pro renderer via IPC `chat:token`
- Bloco `event: action\ndata: {json}\n\n` → parseia o JSON, despacha pra fila de execução de tools

Razão: em VPS/remoto, polling e response-síncrono têm latência alta; SSE é a forma certa de empurrar eventos tempo-real.

### Q2 — Gateway proxy
**2a — Gateway intermedia tudo.** Toda comunicação Electron↔Backend passa por `apps/gateway/`:
- `GET /api/chat/stream?message=...` → proxy para `GET <backend>/chat/stream?message=...`
- `POST /api/tool-calls/:id/result` → proxy para `POST <backend>/tool-calls/:id/result`

Razão: gateway é a fronteira de rede, onde TLS termination, rate limiting e auth podem viver. Mantém Electron ignorante de qual backend (Python ou TS) está respondendo.

### Q3 — Subprocess via stdlib
**3a — `child_process.execFile` da stdlib do Node.** Sem `execa`. Trade-off: zero deps novas, mas exige cuidado manual com escape.

**Regra de segurança crítica:**
- **NUNCA** usar `child_process.exec(string)`. Sempre `execFile(cmd, [arg1, arg2, ...])`.
- Args sempre como array, NUNCA concatenar string.
- Validar inputs no handler antes de chamar o subprocess (allowlist de chars pra `app_name`, regex pra path, etc).
- Exemplo correto: `execFile('xdg-open', [appName])` (xdg-open lida com escape internamente).
- Exemplo errado: `exec(\`xdg-open ${appName}\`)` (vulnerável a `app_name="firefox; rm -rf /"`).

### Q4 — Path resolution: só absolutos
**4a — Apenas paths absolutos aceitos.** `~`, `./`, `$HOME`, paths relativos retornam erro estruturado `{success: false, error: "path_must_be_absolute"}`.

Trade-off documentado: pode causar 1 turn extra de ida-e-volta com o LLM (LLM tenta `~/Desktop`, recebe erro, tenta de novo com `/home/<user>/Desktop`). UX aceitável; segurança ganha sobre conveniência.

### Q5 — Confirmação destrutiva: modal bloqueante
**5a — `dialog.showMessageBox()` nativo do Electron.** Modal bloqueante com botões "Sim/Não". `await` no main process antes de chamar o handler de execução.

Mensagem do modal em pt-BR, ex:
```
Confirmar ação destrutiva
Deletar arquivo: /home/biellil/Desktop/foo.txt
[Sim, deletar] [Cancelar]
```

Se usuário cancelar → reporta `{success: false, error: "user_denied"}` para o backend, que mapeia para `outcome='cancelled'` no audit log.

### Q6 — Testes mockados
**6a — Mock total: subprocess + IPC mockados.** Testes vitest puros:
- `child_process.execFile` mockado via `vi.mock('child_process')`
- `dialog.showMessageBox` mockado para retornar approve/deny
- Cobertura: cada handler com input válido (sucesso), input inválido (erro), confirmação aceita, confirmação negada, subprocess erro

Testes "subprocess real" com display X virtual (xvfb) ficam para Fase 20 (E2E validation), não aqui.

### Q7 — Reporting outcome no main process
**7a — Main process executa e reporta.** Quem chamou `execFile` é quem chama `POST /tool-calls/:id/result`. Renderer não fica sabendo do report.

### Q8 — Auth: API key estática
**8a — `Authorization: Bearer <API_KEY>`.** Variável de ambiente compartilhada entre backend e Electron:
- Backend: `JARVIS_API_KEY` (lida no startup, validada em todas as rotas exceto `/health`)
- Electron: `JARVIS_API_KEY` (lida no startup, injetada em todos os requests pro backend, inclusive SSE via query string `?api_key=` porque `EventSource` não permite header custom)

**Atenção:** SSE via `EventSource` não permite header custom. Como o Electron usa `fetch()` com ReadableStream (não `EventSource`), pode usar header. **Mas se um dia migrar pra `EventSource` no renderer, vira query string.**

API key gerada uma vez (`openssl rand -hex 32`) e salva em `.env` na VPS e no PC. Documentar no README.

### Q9 — Idempotência via set in-memory
**9a — `Set<number>` no main process com TTL.** Cada `tool_call_id` recebido é checado contra um set; se já está, ignora silenciosamente. TTL: 5 minutos (entradas são removidas após esse tempo pra não vazar memória).

Cobre: SSE reconnect que reentrega o mesmo evento.

### Q10 — Topologia de rede
**Decisão híbrida — design para VPS, deploy inicial em LAN/localhost.**

Arquitetura assume comunicação via rede (auth obrigatória, SSE robusto, idempotência, reconnect), mas o deployment inicial é:
- **Backend:** localhost ou LAN (`192.168.x.x:8001`)
- **Gateway:** localhost ou LAN (`192.168.x.x:3000`)
- **Electron:** PC do usuário, conecta via HTTP plain
- **Auth ligada mesmo em LAN** — forma o hábito e garante que mover pra VPS depois é só mudar URL
- HTTPS/cert válido fica como follow-up para quando migrar pra VPS de verdade

Variáveis de env do Electron:
- `JARVIS_BACKEND_URL` — default `http://localhost:3000` (gateway)
- `JARVIS_API_KEY` — sem default, falha o startup se não setado

### Q11 — Sessão única
**11a — Mantém sessão única do Fase 17.** Multi-cliente concorrente fica fora de escopo. Se um segundo cliente Electron conectar, recebe 429 do backend e mostra erro no UI.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend (Fase 18) — referência do que esta fase consome
- `apps/backend-ts/src/routes/chat.ts` — emite `data: <token>\n\n` e `event: action\ndata: {...}\n\n`
- `apps/backend-ts/src/routes/tool-calls.ts` — endpoint `POST /tool-calls/:id/result`
- `apps/backend-ts/src/session/tool-dispatch.ts` — formato exato do payload disparado (`{toolCallId, action, args, requiresConfirmation}`)
- `apps/backend-ts/src/session/pc-tools.ts` — as 9 actions e seus shapes
- `apps/backend-ts/test/fixtures/tools/*.json` — payloads de referência (mesmos do snapshot test do plano 18-01)

### Electron existente
- `apps/desktop/src/main/index.ts` — entry do main process, registra IPC handlers
- `apps/desktop/src/main/ipc/chat.ts` — implementação atual (POST /chat) que será refatorada
- `apps/desktop/src/main/ipc/index.ts` — registra todos os handlers
- `apps/desktop/src/preload/index.ts` — expõe `window.jarvis.*` no renderer
- `apps/desktop/src/renderer/src/App.tsx` — UI que consome `window.jarvis.chat.sendText`

### Gateway
- `apps/gateway/src/` — onde adicionar a rota proxy `/api/tool-calls/:id/result` e estender o handler de `/api/chat/stream`

### Python (não tem equivalente direto desta camada)
- O Python tem `ActionExecutor` no backend e não tem cliente desktop com executor próprio. Esta fase é genuinamente nova arquitetura — não tem código Python pra portar.

### Stack
- Node `child_process.execFile` (stdlib)
- Electron `dialog.showMessageBox`
- Native `fetch` com `ReadableStream` (Node 22 LTS já tem)
- `vitest` mocks

</canonical_refs>

<specifics>
## Specific Ideas

- **Parser SSE manual:** SSE framing é "chunks separados por `\n\n`, cada chunk tem linhas `key: value`". Implementação direta:
  ```typescript
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = frame.split('\n');
      let event: string | undefined;
      let data: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data.push(line.slice(6));
      }
      const dataStr = data.join('\n');
      if (event === 'action') {
        // parse JSON, despacha
      } else {
        // token de texto
      }
    }
  }
  ```

- **Allowlist de comandos por action:**

  | Action | Comando | Validação de args |
  |---|---|---|
  | open_app | `xdg-open` | app_name: regex `^[a-zA-Z0-9_\-]+$` |
  | close_app | `pkill` | app_name: regex `^[a-zA-Z0-9_\-]+$` |
  | list_files | `fs.promises.readdir` | path: absoluto, existe, é diretório |
  | search_files | `find` ou `glob` lib | pattern: sem `..`, sem caracteres especiais |
  | move_file | `fs.promises.rename` | source/dest: absolutos |
  | delete_file | `fs.promises.unlink` | file_path: absoluto, **REQUIRES_CONFIRMATION** |
  | set_volume | `pactl set-sink-volume @DEFAULT_SINK@ <N>%` | level: 0-100 |
  | set_brightness | `brightnessctl set <N>%` | level: 0-100 |
  | list_processes | `ps -eo pid,comm,pcpu,pmem --sort=-pcpu` | sem args |

- **Reconnect SSE:** quando o `fetch` reader termina inesperadamente (ex: timeout do gateway), o main process aguarda backoff exponencial (1s, 2s, 4s, max 30s) e abre nova conexão. Logado.

- **Erro estruturado:** todo handler retorna `{success: boolean, output: string|null, error: string|null}`. Erros típicos:
  - `path_must_be_absolute`
  - `path_not_found`
  - `permission_denied`
  - `command_not_found`
  - `subprocess_failed: <stderr trimado>`
  - `user_denied`
  - `invalid_args: <detalhe>`

- **Timeout de subprocess:** todos os handlers têm timeout de 30s. Se exceder, mata o processo e reporta `subprocess_timeout`.

- **Multiplas tools no mesmo turn:** se o agente disparar 3 tools em sequência durante um stream (ex: lista_files → move_file → delete_file), o Electron recebe os 3 eventos `event: action` no mesmo SSE. Processa em ordem (queue interno no main process) — não em paralelo (pra evitar race conditions com confirmação).

</specifics>

<deferred>
## Deferred Ideas

- **HTTPS/Let's Encrypt na VPS** — fica pra ops/deploy quando migrar do localhost.
- **HMAC nos tool_call_ids** — atual API key estática é suficiente single-user.
- **mTLS** — overkill.
- **Streaming UX no renderer (tokens aparecendo)** — fase futura. Esta fase só quebra a barreira do SSE; o renderer ainda recebe a resposta completa via IPC depois do stream terminar.
- **Multi-cliente concorrente** — refator de sessão única pra multi-tenant fica pra v1.4.
- **Interrupt/resume LangGraph** — agente esperar de verdade pela confirmação antes de assumir sucesso. v1.4.
- **macOS/Windows handlers** — fases futuras.
- **`analyze_screen`** — Fase 19 (vision).
- **Sandboxing dos subprocess (firejail, bubblewrap)** — paranoid tier, fora de v1.3.
- **Audit log local no Electron (cópia espelho do server-side)** — útil pra debug offline. Fica pra v1.4.
- **API key rotation** — manual por env var por enquanto.
- **`shutdown`, `kill_process`, comandos sudo** — não fazem parte das 9 tools, ficam pra v1.4 se forem requeridas.

</deferred>

---

*Phase: 18_5-pc-tools-electron*
*Context gathered: 2026-04-08 via /gsd-discuss-phase*
