# GPU Support - Guia Rápido

Este projeto tem 3 formas de usar GPU para transcrição Whisper:

## 🎯 Qual usar?

### Você está no Windows AGORA (sua situação atual)

✅ **Use: `docker-compose.yml` (CPU-only)**
```bash
docker compose up -d
```

**Performance:** 6s para 10s de áudio (modelo medium)
**Setup:** Zero — já está funcionando
**GPU:** Não usa (CPU only)

---

### Você quer GPU no Windows (sem migrar para Linux)

✅ **Use: Hybrid Architecture**

```powershell
# 1. Compile whisper.cpp com Vulkan no host
.\scripts\compile-whisper-vulkan.ps1

# 2. Setup GPU service
.\scripts\setup-gpu-service.ps1

# 3. Configure docker-compose.yml
# Adicione: WHISPER_GPU_SERVICE_URL=http://host.docker.internal:9000

# 4. Rode GPU service + Docker
C:\whisper-gpu-service\start.bat  # Terminal 1
docker compose up -d               # Terminal 2
```

**Performance:** 2s para 10s de áudio (3x speedup!)
**Setup:** ~15 minutos
**GPU:** AMD RX 7600 usada nativamente (Vulkan)

📖 **Guia:** `docs/HYBRID-GPU-ARCHITECTURE.md`

---

### Você migrou para Linux (futuro)

✅ **Use: `docker-compose.gpu.yml` (GPU in-Docker)**

```bash
# Pré-requisitos (uma vez)
sudo apt install mesa-vulkan-drivers vulkan-tools
sudo usermod -aG video,render $USER
# Logout e login

# Build e rode
docker compose -f docker-compose.gpu.yml build
docker compose -f docker-compose.gpu.yml up -d
```

**Performance:** 2s para 10s de áudio (3x speedup!)
**Setup:** ~5 minutos (após instalar Linux)
**GPU:** AMD RX 7600 via Vulkan in-Docker

📖 **Guia:** `docs/GPU-DOCKER-LINUX.md`

---

## 📊 Comparação

| Opção | OS | Performance | Setup | GPU | Funciona? |
|-------|----|-------------|-------|-----|-----------|
| **CPU Docker** | Win/Mac/Linux | 6s | Zero | Não | ✅ Agora |
| **Hybrid** | Windows | 2s | 15min | Sim (host) | ✅ Agora |
| **GPU Docker** | Linux only | 2s | 5min | Sim (Docker) | ⏳ Futuro |

---

## 🗂️ Arquivos

```
C:\jarvis\
├── Dockerfile.backend-ts          # CPU-only (padrão, funciona em tudo)
├── Dockerfile.backend-ts.gpu      # GPU Vulkan (Linux nativo apenas)
├── docker-compose.yml             # CPU-only (use AGORA)
├── docker-compose.gpu.yml         # GPU in-Docker (Linux futuro)
│
├── scripts/
│   ├── compile-whisper-vulkan.ps1 # Passo 1 hybrid (Windows)
│   └── setup-gpu-service.ps1      # Passo 2 hybrid (Windows)
│
└── docs/
    ├── GPU-OPTIONS.md             # Comparação todas opções
    ├── HYBRID-GPU-ARCHITECTURE.md # Hybrid (Windows AGORA)
    ├── GPU-DOCKER-LINUX.md        # GPU Docker (Linux futuro)
    └── GPU-SETUP-WINDOWS-AMD.md   # Compile whisper.cpp manual
```

---

## 🚀 Recomendação

### Se você quer testar AGORA:

```bash
docker compose up -d  # Já funciona com CPU + modelo medium
```

### Se latência de 6s incomoda:

**Windows:**
```powershell
.\scripts\compile-whisper-vulkan.ps1  # Compila com Vulkan
.\scripts\setup-gpu-service.ps1       # Cria GPU service
# Depois: configure WHISPER_GPU_SERVICE_URL
```

**Linux (quando migrar):**
```bash
docker compose -f docker-compose.gpu.yml up --build
```

---

## ❓ FAQ

**P: GPU funciona no Windows via Docker?**
R: ❌ Não nativamente. Use hybrid architecture.

**P: Preciso de NVIDIA para GPU funcionar?**
R: ❌ Não. Vulkan funciona com AMD, Intel e NVIDIA.

**P: Modelo medium funciona bem em CPU?**
R: ✅ Sim! 6s para 10s áudio é aceitável para assistente pessoal.

**P: Vale a pena GPU?**
R: Depende. Se 6s incomoda → sim (3x speedup). Se 6s é ok → não precisa.

---

**Atualizado:** 2026-04-13
**Hardware:** AMD Radeon RX 7600
**Status atual:** CPU Docker funcionando, GPU pronto para quando quiser
