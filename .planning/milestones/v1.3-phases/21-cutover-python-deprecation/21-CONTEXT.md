# Phase 21: Cutover & Python Deprecation — Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 21 (interativo)

<domain>
## Phase Boundary

Fase final do v1.3 — fazer o TypeScript ser o backend padrão permanente e remover completamente o backend Python do monorepo.

**Dentro de escopo:**
- Remover lógica de feature flag do gateway (`backendRouter.ts`, `resolveUpstreamUrl`) — TypeScript hardcoded
- Simplificar `apps/gateway/src/routes/chat.ts` para apontar fixo para `backendTsUrl`
- Remover `src/jarvis/` (backend Python) completamente do monorepo
- Remover `python-service` do `docker-compose.yml` e deletar `Dockerfile.python`
- Remover `config.fastapiUrl` do gateway (env var `FASTAPI_URL` torna-se obsoleto)
- Atualizar `README.md` — remover referências ao Python, atualizar stack e comandos
- Atualizar `.env.example` — remover `FASTAPI_URL`, `SQLITE_PATH` e outras vars Python-only

**Fora de escopo:**
- "1 semana de observação" do VAL-09 — user decidiu não usar mais Python, sem período de espera
- ARCHITECTURE.md, MIGRATION.md — user quer só atualizar README.md existente
- Novas features
</domain>

<decisions>
## Implementation Decisions

### D-01 — Default routing no gateway
**Remover feature flag, TypeScript hardcoded.**

Deletar `apps/gateway/src/middleware/backendRouter.ts` e `apps/gateway/src/middleware/backendRouter.test.ts`.

Em `apps/gateway/src/routes/chat.ts`: substituir `resolveUpstreamUrl(req)` por `config.backendTsUrl` diretamente. Sem header routing, sem feature flag.

Em `apps/gateway/src/config.ts`: remover `fastapiUrl` (não precisamos mais de `FASTAPI_URL`). Manter apenas `backendTsUrl`, `gatewayPort`, `apiKey`.

**Rollback:** User não quer mais Python. Sem plano de rollback — decisão definitiva.

---

### D-02 — Python backend removal
**Deletar src/jarvis/ completamente.**

- Remove o diretório `src/jarvis/` e todo seu conteúdo
- Se `src/` ficar vazio após remoção, remove `src/` também
- Remove `Dockerfile.python` da raiz do monorepo
- Remove dependências Python do projeto se houver (pyproject.toml, requirements.txt na raiz)

**Sem arquivo de migração** — remoção definitiva, sem README de deprecação.

---

### D-03 — Docker Compose
**Remover python-service completamente.**

Em `docker-compose.yml`:
- Deletar o serviço `python-service` (nome exato encontrado no arquivo)
- Remover volumes, networks, ou depends_on relacionados ao python-service
- Resultado: Compose fica com `backend-ts` + `gateway` (+ qualquer outro serviço não-Python)

---

### D-04 — Documentação
**Atualizar apenas README.md.**

Não criar novos docs. No README.md existente:
- Remover seção/menção ao Python backend (porta 8000, FastAPI, uvicorn)
- Atualizar stack table — remover linha Python/FastAPI
- Atualizar comandos de dev — `pnpm dev` só inicia TS stack
- Atualizar troubleshooting — remover itens específicos do Python
- Manter estrutura e formato existente do README

---

### D-05 — Env vars cleanup
**Remover vars obsoletas do .env.example.**

Remover de `.env.example`:
- `FASTAPI_URL` — gateway não usa mais
- `SQLITE_PATH` — Python usava, TS usa `DATABASE_PATH`
- Qualquer outra var exclusivamente Python

Atualizar `.env` se tiver essas vars (remover das variáveis ativas, comentar ou deletar).
</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — VAL-08, VAL-09, VAL-10
- `.planning/ROADMAP.md` — Phase 21 success criteria
- `apps/gateway/src/config.ts` — fastapiUrl a ser removido, backendTsUrl a manter
- `apps/gateway/src/routes/chat.ts` — 3 rotas que usam resolveUpstreamUrl, voltam para backendTsUrl direto
- `apps/gateway/src/middleware/backendRouter.ts` — arquivo a ser deletado
- `apps/gateway/src/middleware/backendRouter.test.ts` — arquivo a ser deletado
- `docker-compose.yml` — python-service a ser removido
- `src/jarvis/` — diretório a ser deletado
- `README.md` — atualizar referências ao Python
- `.env.example` — remover vars Python-only
</canonical_refs>

<deferred>
## Deferred Ideas

- **Período de observação de 1 semana (VAL-09)** — user decidiu não usar mais Python, sem período de espera
- **ARCHITECTURE.md** — pode ser criado no futuro como doc standalone
- **MIGRATION.md** — user não quis criar, histórico fica no git
- **Rollback plan** — user não precisa de rollback pro Python
</deferred>
