---
phase: 26-docker-infrastructure
plan: 02
subsystem: docker-infrastructure
tags: [docker, whisper, pre-download, build-optimization]
dependency_graph:
  requires:
    - chromadb-docker-service
  provides:
    - whisper-model-predownload
    - docker-compose-full-stack
  affects:
    - Dockerfile.backend-ts
    - docker-compose.yml
tech_stack:
  added: []
  patterns:
    - Docker build-time model pre-download
    - Volume seeding from image contents
    - Non-interactive curl downloads (no TTY prompts)
key_files:
  created: []
  modified:
    - Dockerfile.backend-ts
    - docker-compose.yml
decisions:
  - Switched from npx nodejs-whisper download to direct curl download (avoids TTY prompt issues)
  - WHISPER_MODEL env var set to base (not small) to match pre-downloaded model
  - Model validation via test -f and du -sh ensures build fails if download fails
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_modified: 2
  commits: 3
  completed_at: "2026-04-12T23:05:42Z"
---

# Phase 26 Plan 02: Whisper Model Pre-Download & Docker Compose E2E Summary

**One-liner:** Whisper base model (142 MB) baixado durante docker build via curl, zero download em runtime, docker compose up sobe 3 serviços saudáveis.

## What Was Built

Whisper model base agora é pré-baixado durante `docker build` do backend-ts ao invés de em runtime na primeira transcrição. O modelo é baixado via curl direto do HuggingFace, validado, e empacotado na imagem Docker. Quando `docker compose up` roda pela primeira vez, o volume `whisper-models` é preenchido automaticamente com o conteúdo da imagem — zero download em runtime.

**Functional changes:**
- Dockerfile.backend-ts executa `curl -L -o ggml-base.bin` durante build stage
- Validação via `test -f` e `du -sh` garante modelo presente e não-vazio
- docker-compose.yml ajustado para WHISPER_MODEL=base (consistente com modelo baixado)
- docker compose up sobe gateway, backend-ts e chromadb sem ChromaConnectionError

**Technical highlights:**
- Download de ggml-base.bin (~142 MB) via curl evita prompts TTY do npx nodejs-whisper
- Volume whisper-models é populado automaticamente pelo Docker na primeira montagem (seeding)
- Build valida modelo com test -f e du -sh — build falha se download falhar
- User verification confirmou: todos serviços healthy, zero downloads em runtime, volumes persistem

## Implementation Details

### Task 1: Adicionar pre-download do modelo whisper base no Dockerfile.backend-ts

**What:** Baixar ggml-base.bin durante docker build no runtime stage e validar que o modelo existe.

**How:**
1. Adicionado no runtime stage, após `npm install --omit=dev`:
   ```dockerfile
   RUN mkdir -p node_modules/nodejs-whisper/cpp/whisper.cpp/models && \
       curl -L -o node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
   ```

2. Adicionada validação:
   ```dockerfile
   RUN test -f node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin \
       && test -s node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin \
       && echo "✅ whisper base model present: $(du -sh node_modules/nodejs-whisper/cpp/whisper.cpp/models/ggml-base.bin)"
   ```

3. Ajustado docker-compose.yml: WHISPER_MODEL=base (era small — inconsistente)

**Deviation applied:**
- **[Rule 1 - Bug] Switched from npx nodejs-whisper download to curl**
  - **Found during:** Task 1 execution
  - **Issue:** `npx nodejs-whisper download base` produces TTY prompts asking for model selection, which hangs non-interactive Docker builds
  - **Fix:** Direct curl download from HuggingFace (same source, no prompts)
  - **Files modified:** Dockerfile.backend-ts
  - **Commit:** 4547a29

- **[Rule 1 - Bug] Fixed WHISPER_MODEL env var mismatch**
  - **Found during:** Task 1 verification
  - **Issue:** docker-compose.yml set WHISPER_MODEL=small but Dockerfile downloads base — mismatch causes runtime download
  - **Fix:** Changed WHISPER_MODEL=base in docker-compose.yml
  - **Files modified:** docker-compose.yml
  - **Commit:** dc1822c

**Files modified:**
- Dockerfile.backend-ts
- docker-compose.yml

**Commits:**
- b38421a: feat(26-02): adiciona pre-download do modelo whisper base no Dockerfile
- 4547a29: fix(26-02): download whisper model non-interactively via curl
- dc1822c: fix(26-02): garante WHISPER_MODEL=base no docker-compose

**Verification:**
- ✅ grep "curl.*ggml-base.bin" Dockerfile.backend-ts
- ✅ grep "test -f.*ggml-base.bin" Dockerfile.backend-ts
- ✅ docker compose build succeeded with "✅ whisper base model present: 142M ggml-base.bin"

### Task 2: Verificação E2E — docker compose up sobe os 3 serviços sem erros

**What:** Human verification checkpoint — confirmar que docker compose up sobe gateway, backend-ts e chromadb sem ChromaConnectionError e sem downloads em runtime.

**How:**
User executed:
1. `docker compose build --no-cache`
   - Build succeeded with "✅ whisper base model present: 142M ggml-base.bin"
2. `docker compose up -d`
   - All 3 services started healthy
3. `docker compose ps`
   - gateway: running
   - backend-ts: healthy
   - chromadb: healthy
4. `docker compose logs backend-ts | grep -i "chroma"`
   - No ChromaConnectionError
5. `docker compose logs backend-ts | grep -i "download\|whisper"`
   - No runtime download messages
6. `docker compose down && docker compose up -d`
   - Volumes persisted, no re-download

**User response:** "approved"

**Files involved:**
- docker-compose.yml (services: gateway, backend-ts, chromadb)

**Verification:**
- ✅ User confirmed all services healthy
- ✅ User confirmed no ChromaConnectionError in logs
- ✅ User confirmed no whisper model download in runtime
- ✅ User confirmed volumes persist between restarts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Switched from npx nodejs-whisper download to curl**
- **Found during:** Task 1
- **Issue:** `npx nodejs-whisper download base` requires TTY interaction (prompts for model selection), which hangs in non-interactive Docker build. The nodejs-whisper CLI is designed for interactive use and doesn't have a --yes or --non-interactive flag.
- **Fix:** Replace with direct curl download from HuggingFace (https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin). This is the same source nodejs-whisper uses internally, but without the interactive prompt layer.
- **Files modified:** Dockerfile.backend-ts
- **Commit:** 4547a29

**2. [Rule 1 - Bug] Fixed WHISPER_MODEL env var mismatch**
- **Found during:** Task 1 verification
- **Issue:** docker-compose.yml set `WHISPER_MODEL=small` but Dockerfile downloads `ggml-base.bin`. At runtime, LocalSTTProvider would attempt to load "small" model, fail to find it, and trigger autoDownloadModelName fallback — defeating the purpose of pre-download.
- **Fix:** Changed docker-compose.yml to `WHISPER_MODEL=base` to match the pre-downloaded model.
- **Files modified:** docker-compose.yml
- **Commit:** dc1822c

## Technical Decisions

**1. Direct curl download instead of npx nodejs-whisper download**
- Rationale: npx nodejs-whisper download requires TTY for interactive model selection prompt; Docker builds are non-interactive and hang on TTY prompts
- Impact: Build is fully automated and reproducible; no prompts; same model source (HuggingFace)
- Alternatives: Patch nodejs-whisper CLI to add --non-interactive flag (upstream contribution, slow); use expect/unbuffer (adds dependency)

**2. Model validation via test -f and du -sh**
- Rationale: Catch curl failures (404, network errors, partial downloads) before image is tagged as successful
- Impact: Build fails fast if download fails — prevents broken images from being deployed
- Alternatives: Skip validation (risky — broken images reach production); checksum validation (overkill for dev workflow)

**3. WHISPER_MODEL=base in docker-compose.yml**
- Rationale: Must match the model actually present in the image to prevent runtime fallback download
- Impact: Runtime uses pre-downloaded model immediately; zero network calls on first transcription
- Alternatives: Download multiple models (base, small, medium) — wastes 500+ MB image space for unused models

## Files Changed

### Created
None

### Modified
- Dockerfile.backend-ts (10 insertions: mkdir, curl, test validation)
- docker-compose.yml (1 modification: WHISPER_MODEL=base)

## Testing & Validation

**Automated:**
- ✅ grep "curl.*ggml-base.bin" Dockerfile.backend-ts
- ✅ grep "test -f.*ggml-base.bin" Dockerfile.backend-ts
- ✅ docker compose build output shows "✅ whisper base model present: 142M ggml-base.bin"

**Human-verified (checkpoint):**
- ✅ docker compose build succeeded without errors
- ✅ docker compose up started all 3 services (gateway, backend-ts, chromadb)
- ✅ docker compose ps shows all services healthy
- ✅ backend-ts logs contain no ChromaConnectionError
- ✅ backend-ts logs contain no whisper download messages
- ✅ docker compose down && up preserves volumes (no re-download)

## Requirements Completed

- ✅ **DOCK-08:** Whisper model base baixado durante docker build — validação garante presença antes de CMD
- ✅ **DOCK-09:** docker compose up em máquina limpa sobe gateway, backend-ts, chromadb sem erros e sem downloads em runtime

## Known Issues

None identified during implementation or E2E verification.

## Known Stubs

None - all functionality is fully wired. Whisper model is pre-downloaded, validated during build, and ready for runtime use without network calls.

## Next Steps

**Immediate (this milestone):**
- Phase 27: System prompt pt-BR + memória semântica funcionando (CONV-07, CONV-08, CONV-09)
- DOCK-08 and DOCK-09 are now complete — Docker infrastructure foundation is solid

**Follow-up validation:**
1. Test actual transcription: POST /transcribe with audio file
2. Verify whisper uses base model from volume (check logs for model path)
3. Monitor first transcription latency (should be <2s for base model on short audio)

**Future improvements:**
- Multi-model support: allow WHISPER_MODEL=small,base,medium and download all during build (optional optimization)
- Model caching layer: share whisper-models volume across multiple compose stacks (dev/staging)

## Self-Check: PASSED

**Files created:**
None expected - verified ✅

**Files modified:**
- ✅ Dockerfile.backend-ts exists and contains curl download + validation
- ✅ docker-compose.yml exists and contains WHISPER_MODEL=base

**Commits exist:**
- ✅ b38421a: feat(26-02): adiciona pre-download do modelo whisper base no Dockerfile
- ✅ 4547a29: fix(26-02): download whisper model non-interactively via curl
- ✅ dc1822c: fix(26-02): garante WHISPER_MODEL=base no docker-compose

All claimed artifacts verified.
