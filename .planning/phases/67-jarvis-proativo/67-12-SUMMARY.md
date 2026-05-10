---
phase: 67-jarvis-proativo
plan: 12
status: complete
gap_closure: true
completed: 2026-05-10
---

# Plan 67-12 — POST /daily-summary route + remove hardcode

## Gap closed

**Gap 2 (Blocker, PROACT-06):** O backend hardcoded `'09:00'` em [index.ts:109](apps/backend-ts/src/index.ts#L109) e não tinha rota para o `pushProactiveConfigToBackend` do Electron atualizar o horário. Mudanças via Settings UI caíam em 404 silencioso.

## Commits

- `04c67d9`: ✨ feat(67-12): adicionar rota POST /daily-summary ao proactive router
- `4e77b38`: ♻️ refactor(67-12): remover hardcode '09:00' do index.ts — horário vem do Electron

## Mudanças

**Task 1 — adicionar rota POST /daily-summary** ([proactive.ts:229-244](apps/backend-ts/src/routes/proactive.ts#L229-L244)):
- Body: `{ enabled: boolean, time: string }`
- Quando `enabled && time`, chama `ProactiveScheduler.registerDailySummaryJob(time)`
- Retorna `{ ok: true }`
- Mesmo padrão da rota /quiet-hours já existente

**Task 2 — remover hardcode** ([index.ts:107-111](apps/backend-ts/src/index.ts#L107-L111)):
- Removidas 2 linhas: `ProactiveScheduler.registerDailySummaryJob('09:00')` + `console.log`
- Adicionado comentário explicativo: o horário real vem do Electron via `pushProactiveConfigToBackend` ao conectar

## Verificação

- `npx vitest run proactive.route` → 11/11 passing
- `grep "router.post.*daily-summary" routes/proactive.ts` → 1 match (linha 229)
- `grep "registerDailySummaryJob\|'09:00'" index.ts` → 0 matches (hardcode removido)

## Próximo passo

End-to-end: ao iniciar Electron, `pushProactiveConfigToBackend` envia o horário do `electron-store` (default `'09:00'`) para `POST /api/settings/daily-summary` → cron job registrado com horário correto. Mudanças via Settings UI agora propagam imediatamente.
