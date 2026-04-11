## From 19_5-04
- src/main/__tests__/tray.test.ts: DESK-04 espera 3 itens de menu, existem 4 (pré-existente, desatualizado).
- src/main/__tests__/integration-chat.test.ts: módulo `express` não declarado no tsconfig/devDeps — erros TS2307/TS7006 pré-existentes.
- WebkitAppRegion CSS types: App.tsx, ChatInput.tsx usam `WebkitAppRegion` inline sem cast — erros TS2353 pré-existentes desde Fase 10/12.
