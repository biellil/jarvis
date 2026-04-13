# GPU no Docker - Opções para AMD Radeon RX 7600

**TL;DR:** Docker Desktop Windows **não suporta** GPU AMD nativamente. Você tem 3 opções:

## Comparação Rápida

| Opção | Funciona? | Performance | Complexidade | Recomendado? |
|-------|-----------|-------------|--------------|--------------|
| **1. CPU no Docker** | ✅ Sim | Baseline | ⭐ Fácil | ✅ **Comece aqui** |
| **2. Hybrid (GPU host)** | ✅ Sim | 3x mais rápido | ⭐⭐ Médio | ✅ **Se CPU for lento** |
| **3. GPU in-Docker (WSL2)** | ⚠️ Talvez | Imprevisível | ⭐⭐⭐ Difícil | ❌ **Não recomendado** |
| **4. Linux host nativo** | ✅ Sim | 3x mais rápido | ⭐⭐⭐⭐ Muito difícil | ❌ **Overkill** |

---

## Opção 1: CPU no Docker (Atual) ✅ RECOMENDADO INICIALMENTE

**Status:** ✅ **Funcionando AGORA** — modelo medium já está instalado

**Performance:**
- 10s de áudio → ~6s de transcrição
- Acurácia em português: **excelente** (modelo medium)

**Setup:**
```bash
# Já está pronto!
docker compose up -d
```

**Quando usar:**
- ✅ Você quer testar o sistema AGORA
- ✅ Você não liga para ~6s de latência
- ✅ Você quer zero complexidade

**Quando não usar:**
- ❌ Latência de 6s é inaceitável
- ❌ Você quer máxima performance

---

## Opção 2: Hybrid Architecture (GPU Host + Docker CPU) ✅ RECOMENDADO SE CPU FOR LENTO

**Status:** ✅ **100% funcional** com AMD no Windows

**Performance:**
- 10s de áudio → **~2s de transcrição** (3x speedup)
- GPU AMD Radeon RX 7600 usada nativamente (Vulkan)

**Arquitetura:**
```
Windows Host (GPU Vulkan nativa)
  ↓
whisper-gpu-service:9000 (Python FastAPI)
  ↓ HTTP
Docker backend-ts:8001 (fallback CPU)
```

**Setup automatizado (~15 minutos):**

### Passo 1: Compile whisper.cpp com Vulkan

```powershell
# Roda script automatizado
.\scripts\compile-whisper-vulkan.ps1

# O script vai:
# 1. Verificar pré-requisitos (CMake, Vulkan SDK, Visual Studio)
# 2. Clonar whisper.cpp
# 3. Compilar com Vulkan (-DGGML_VULKAN=ON)
# 4. Baixar modelo medium (1.5GB)
# 5. Testar GPU
```

**Pré-requisitos** (instalados automaticamente se não tiver):
- Visual Studio Build Tools 2022
- CMake 3.20+
- Vulkan SDK 1.3.280+
- Git

### Passo 2: Setup GPU Service

```powershell
# Roda script automatizado
.\scripts\setup-gpu-service.ps1

# O script vai:
# 1. Criar C:\whisper-gpu-service\app.py (FastAPI)
# 2. Instalar dependências Python (fastapi, uvicorn)
# 3. Criar start.bat
# 4. Testar serviço
```

### Passo 3: Configure Docker para usar GPU

```yaml
# docker-compose.yml — adicione à seção backend-ts environment:
- WHISPER_GPU_SERVICE_URL=http://host.docker.internal:9000
```

### Passo 4: Rode tudo

**Terminal 1 (GPU Service):**
```powershell
C:\whisper-gpu-service\start.bat
```

**Terminal 2 (Docker):**
```bash
docker compose restart backend-ts
```

**Teste:**
```powershell
# Health check
curl http://localhost:9000/health

# Deve mostrar:
# {"status":"healthy","gpu":"AMD Radeon RX 7600","backend":"Vulkan"}
```

**Quando usar:**
- ✅ Você quer máxima performance
- ✅ Latência de 6s (CPU) é inaceitável
- ✅ Você pode rodar um serviço extra no host
- ✅ ~15 minutos de setup é aceitável

**Quando não usar:**
- ❌ Você quer zero complexidade (use Opção 1)
- ❌ CPU de 6s já está bom

**Documentação completa:**
- `docs/HYBRID-GPU-ARCHITECTURE.md`
- `docs/GPU-SETUP-WINDOWS-AMD.md`

---

## Opção 3: GPU in-Docker via WSL2 ⚠️ NÃO RECOMENDADO

**Status:** ⚠️ **Experimentalmente possível**, mas **muito instável**

**Por que não funciona bem:**
- WSLg (WSL2 GUI support) tem suporte GPU AMD incompleto
- Docker Desktop pode não expor `/dev/dri` corretamente
- Performance pode ser **pior** que CPU (overhead virtualização)
- Quebra frequentemente com updates de driver AMD

**Se você REALMENTE quer tentar:**

### Teste se GPU é acessível no WSL2

```bash
# No WSL2 Ubuntu
sudo apt install mesa-vulkan-drivers vulkan-tools
vulkaninfo --summary

# Deve mostrar: AMD Radeon RX 7600
# Se não mostrar = não vai funcionar no Docker
```

### Teste passthrough para Docker

```bash
# Testa se /dev/dri é acessível
docker run --rm -it --device=/dev/dri ubuntu:22.04 bash

# Dentro do container:
ls -la /dev/dri
# Deve mostrar: card0, renderD128

# Se não mostrar = não vai funcionar
```

### Se passou nos testes, atualize Dockerfile

```dockerfile
FROM ubuntu:22.04

# Install Vulkan runtime
RUN apt-get update && apt-get install -y \
    libvulkan1 \
    mesa-vulkan-drivers \
    vulkan-tools

# Build whisper.cpp
RUN cd whisper.cpp \
    && cmake -B build -DGGML_VULKAN=ON \
    && cmake --build build --config Release
```

```yaml
# docker-compose.yml
services:
  backend-ts:
    devices:
      - /dev/dri:/dev/dri
    environment:
      - VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json
```

**Problemas esperados:**
- ❌ Build pode falhar (Vulkan não encontrado)
- ❌ Runtime pode não detectar GPU
- ❌ Performance pode ser pior que CPU
- ❌ Quebra com updates de driver

**Recomendação:** **NÃO use essa opção**. Use Opção 2 (Hybrid) ao invés.

---

## Opção 4: Linux Host Nativo ❌ OVERKILL

**Status:** ✅ Funcionaria perfeitamente, mas...

**Setup:**
1. Instale Ubuntu/Fedora nativo (não WSL2)
2. Instale drivers AMD amdgpu
3. Instale ROCm
4. Use Docker com `--device=/dev/kfd --device=/dev/dri`

**Por que não fazer:**
- ❌ Requer reinstalar Windows → Linux
- ❌ Perde ambiente Windows
- ❌ Muito trabalho para ganho marginal
- ✅ Opção 2 (Hybrid) dá mesmo resultado sem reinstalar OS

---

## Recomendação Final

### Se você está começando AGORA:

1. **Use Opção 1** (CPU no Docker) — já está funcionando
2. **Teste o sistema** — veja se latência de ~6s incomoda
3. **Se incomodar** → migre para Opção 2 (Hybrid GPU)

### Se latência de CPU for problema:

1. **Use Opção 2** (Hybrid) — 15 minutos de setup, 3x speedup
2. Roda scripts automatizados:
   - `.\scripts\compile-whisper-vulkan.ps1`
   - `.\scripts\setup-gpu-service.ps1`
3. Adiciona `WHISPER_GPU_SERVICE_URL` ao docker-compose.yml
4. Done — GPU funcionando!

### ❌ NÃO use:

- ❌ Opção 3 (WSL2 passthrough) — muito instável
- ❌ Opção 4 (Linux nativo) — overkill

---

## FAQ

**P: Posso usar CUDA ao invés de Vulkan?**
R: ❌ Não. CUDA é exclusivo NVIDIA. AMD usa ROCm (Linux) ou Vulkan (cross-platform).

**P: Por que Docker Desktop não suporta AMD GPU?**
R: Docker Desktop usa WSL2, que tem suporte GPU apenas para NVIDIA (nvidia-docker). AMD não tem equivalente.

**P: Posso rodar GPU service em outro PC?**
R: ✅ Sim! Configure `WHISPER_GPU_SERVICE_URL=http://IP_DO_PC_COM_GPU:9000`

**P: GPU service usa muita RAM?**
R: Modelo medium usa ~2GB RAM + VRAM da GPU.

**P: Fallback para CPU funciona automaticamente?**
R: ✅ Sim. Se GPU service estiver offline, backend-ts usa CPU automaticamente.

---

**Resumindo:**

| Você quer | Use |
|-----------|-----|
| Testar AGORA | Opção 1 (CPU) — já funciona |
| Máxima performance | Opção 2 (Hybrid) — 15min setup |
| Zero complexidade | Opção 1 (CPU) — aceita 6s latência |
| Experimentar | Opção 2 (Hybrid) — GPU funciona 100% |
