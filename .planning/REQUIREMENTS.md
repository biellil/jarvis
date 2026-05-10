# Requirements: JARVIS v3.1 — Distribution & Cleanup

**Defined:** 2026-05-10
**Core Value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.

## v3.1 Requirements

Requirements for milestone v3.1 (Distribution & Cleanup). Each maps to roadmap phases.

### Settings UI Simplification

- [ ] **SIMP-01**: Settings UI sem seção "LLM Provider" — dropdown de provider, API keys (Gemini/OpenAI/Anthropic) e LM Studio URL não aparecem mais na interface
- [ ] **SIMP-02**: Settings UI sem seção "Servidor MCP" — toggle e lista de clientes removidos da interface
- [ ] **SIMP-03**: Migração automática de configs existentes (electron-store keys de Gemini/OpenAI/Anthropic + provedor selecionado + LM Studio URL) para arquivo `.env` na primeira execução pós-v3.1, sem intervenção manual do usuário
- [ ] **SIMP-04**: Backend lê `LLM_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` e `LM_STUDIO_URL` do `.env` no startup; restart aplica mudanças corretamente

### MCP Server Removal

- [ ] **MCP-RM-01**: JARVIS deixa de expor MCP Server — stdio transport e as 5 tools (recall_memory, list_files, openFile, openFolder, viewContent) são removidos do backend-ts; IPC handlers `mcp:*` e bridge `window.mcp` removidos do Electron
- [ ] **MCP-RM-02**: MCP Client (JARVIS conecta em servers MCP externos configurados via `.env`) continua funcionando inalterado — smoke test E2E confirma que tools MCP externas seguem disponíveis no chat

### Multi-Platform Distribution

- [ ] **DIST-01**: Build gera Windows NSIS installer (.exe) instalável em Windows 10/11 com atalho no Menu Iniciar e desinstalação via Painel de Controle
- [ ] **DIST-02**: Build gera Windows portable (.exe) executável sem instalação — extrai/roda sem privilégios admin
- [ ] **DIST-03**: Build gera macOS .dmg universal (arm64 + x64) instalável em macOS 12+ — usuário arrasta para /Applications
- [ ] **DIST-04**: Build gera Linux AppImage executável em Ubuntu 22+/Fedora 38+ — chmod +x e roda sem instalação
- [ ] **DIST-05**: README documenta passo-a-passo de build local (`pnpm dist`) e instalação por plataforma, incluindo aviso sobre SmartScreen warning (Windows) e Gatekeeper (macOS) por ausência de code signing

### Whisper Model Override Fix

- [ ] **WBUG-01**: Modelo Whisper carregado pelo pipeline STT bate com modelo configurado pelo usuário em Settings (tiny/base/small/medium/large) — não há mais fallback silencioso para "medium"
- [ ] **WBUG-02**: Modo "auto" continua selecionando modelo por VRAM corretamente (preserva contrato STT-02 de v1.6: >8GB→large, 4-8GB→base, <4GB→tiny)
- [ ] **WBUG-03**: Teste de regressão automatizado previne reincidência — `resolveWhisperModel` recebe configuração explícita (não-auto) e retorna o modelo configurado, sem override por VRAM

## Future Requirements

Deferred to future milestones. Tracked but not in v3.1 roadmap.

### Distribution

- **DIST-FUT-01**: Auto-update via electron-updater + GitHub Releases — v3.2
- **DIST-FUT-02**: Code signing — Windows EV cert + macOS notarization — v3.2+
- **DIST-FUT-03**: Linux .deb e .rpm packages — v3.2+
- **DIST-FUT-04**: GitHub Actions workflow para build automatizado em release tag — v3.2

## Out of Scope

Explicitly excluded from v3.1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-update implementation | Adiado para v3.2 — adiciona complexidade significativa e infra de releases não está pronta |
| Code signing (Windows EV cert / macOS notarization) | Uso pessoal — usuário aceita SmartScreen warning e Gatekeeper bypass; certificado custaria ~US$300/ano sem ROI claro |
| Reintroduzir LLM provider/keys na Settings UI | Decisão da v3.1 é configurar tudo via `.env` — backend é o controlador, frontend não decide modelo |
| MCP Server reintroduzido (stdio ou HTTP) | Removido inteiro em v3.1; JARVIS só consome MCP externo daqui em diante |
| Watcher de `.env` em runtime para hot-reload | v3.1 exige restart para mudanças no `.env`; hot-reload via watcher fica para milestone futuro se necessário |
| GitHub Actions / CI release pipeline | Build local com `pnpm dist` é suficiente para uso pessoal; CI fica para v3.2 |
| Linux .deb/.rpm packages | AppImage cobre maioria das distros sem custo de manutenção; pacotes nativos ficam para futuro |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| WBUG-01 | Phase 68 | Pending |
| WBUG-02 | Phase 68 | Pending |
| WBUG-03 | Phase 68 | Pending |
| MCP-RM-01 | Phase 69 | Pending |
| MCP-RM-02 | Phase 69 | Pending |
| SIMP-01 | Phase 70 | Pending |
| SIMP-02 | Phase 70 | Pending |
| SIMP-03 | Phase 70 | Pending |
| SIMP-04 | Phase 70 | Pending |
| DIST-01 | Phase 71 | Pending |
| DIST-02 | Phase 71 | Pending |
| DIST-03 | Phase 71 | Pending |
| DIST-04 | Phase 71 | Pending |
| DIST-05 | Phase 71 | Pending |

**Coverage:**
- v3.1 requirements: 14 total
- Mapped to phases: 14/14 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-10*
*Last updated: 2026-05-10 after roadmap v3.1 created*
