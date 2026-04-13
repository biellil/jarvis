# GPU no Docker (Linux Native)

**Status:** ✅ Pronto para usar quando você migrar para Linux
**Hardware detectado:** AMD Radeon RX 7600
**Backend GPU:** Vulkan (compatível com AMD/Intel/NVIDIA)

## ⚠️ Importante

Esses arquivos **só funcionam em Linux host nativo** (Ubuntu, Fedora, etc.).

**Não funciona em:**
- ❌ Windows (mesmo com WSL2)
- ❌ macOS
- ❌ Docker Desktop (qualquer OS)

**Para Windows/macOS:**
- Use `docker-compose.yml` (CPU-only)
- Ou use hybrid architecture (GPU no host + Docker CPU)

---

## 📋 Pré-requisitos no Linux

### 1. Drivers GPU AMD instalados

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mesa-vulkan-drivers vulkan-tools

# Fedora
sudo dnf install mesa-vulkan-drivers vulkan-tools

# Arch
sudo pacman -S vulkan-radeon vulkan-tools

# Verifique instalação
vulkaninfo --summary

# Deve mostrar:
# GPU id = 0 (AMD Radeon RX 7600)
```

### 2. Verifique /dev/dri está acessível

```bash
ls -la /dev/dri

# Deve mostrar:
# crw-rw---- 1 root video  226, 0 ... card0
# crw-rw---- 1 root render 226, 128 ... renderD128
```

### 3. Adicione seu usuário aos grupos video e render

```bash
sudo usermod -aG video $USER
sudo usermod -aG render $USER

# Logout e login novamente para aplicar
```

### 4. Teste GPU no Docker (sanity check)

```bash
# Testa se Docker consegue acessar GPU
docker run --rm -it \
  --device=/dev/dri:/dev/dri \
  ubuntu:22.04 \
  ls -la /dev/dri

# Deve mostrar card0 e renderD128 dentro do container
```

---

## 🚀 Usando GPU no Docker

### Opção 1: docker-compose.gpu.yml (Recomendado)

```bash
# Build com GPU support
docker compose -f docker-compose.gpu.yml build

# Rode serviços
docker compose -f docker-compose.gpu.yml up -d

# Veja logs (deve mostrar "using Vulkan device")
docker compose -f docker-compose.gpu.yml logs -f backend-ts
```

### Opção 2: Build manual

```bash
# Build imagem GPU
docker build -f Dockerfile.backend-ts.gpu -t jarvis-backend-ts:gpu .

# Rode com passthrough GPU
docker run -it --rm \
  --device=/dev/dri:/dev/dri \
  --group-add video \
  --group-add render \
  -e VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json \
  jarvis-backend-ts:gpu
```

---

## 🔍 Verificação GPU Funcionando

### 1. Verifique logs do container

```bash
docker compose -f docker-compose.gpu.yml logs backend-ts | grep -i vulkan

# Deve mostrar algo como:
# "ggml_vulkan: Using Vulkan device: AMD Radeon RX 7600"
```

### 2. Teste transcrição com áudio

```bash
# Envie áudio para transcrição
curl -X POST http://localhost:8001/transcribe \
  -F "audio=@test.wav"

# Verifique latência:
# GPU: ~2s para 10s de áudio
# CPU: ~6s para 10s de áudio
```

### 3. Verifique uso GPU no host

```bash
# AMD
radeontop

# Ou genérico
watch -n 1 cat /sys/kernel/debug/dri/0/amdgpu_pm_info
```

---

## ⚙️ Configuração Avançada

### Escolher GPU específica (multi-GPU)

```yaml
# docker-compose.gpu.yml
environment:
  # GPU 0 (primeira GPU)
  - VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json

  # GPU 1 (segunda GPU - se tiver)
  # - MESA_VK_DEVICE_SELECT=1
```

### Debug Vulkan

```yaml
# docker-compose.gpu.yml
environment:
  # Habilita debug layers
  - VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation
  - VK_LOADER_DEBUG=all

# Depois veja logs:
docker compose -f docker-compose.gpu.yml logs backend-ts
```

### Limitar VRAM usage

```yaml
# docker-compose.gpu.yml
environment:
  # Limite VRAM em MB (ex: 2GB)
  - VK_MEMORY_BUDGET=2048
```

---

## 🐛 Troubleshooting

### "Vulkan device not found"

**Problema:** Whisper não detecta GPU

**Solução:**
```bash
# 1. Verifique drivers no host
vulkaninfo --summary

# 2. Verifique /dev/dri no container
docker exec -it jarvis-backend-ts ls -la /dev/dri

# 3. Verifique ICD loader
docker exec -it jarvis-backend-ts ls -la /usr/share/vulkan/icd.d/
```

### "/dev/dri: Permission denied"

**Problema:** Container não tem acesso à GPU

**Solução:**
```bash
# Verifique grupos
groups

# Adicione ao video e render
sudo usermod -aG video $USER
sudo usermod -aG render $USER

# Logout e login
```

### Build falha "Vulkan not found"

**Problema:** Vulkan SDK não instalado no host (afeta build)

**Solução:**
```bash
# Ubuntu/Debian
sudo apt install libvulkan-dev

# Fedora
sudo dnf install vulkan-headers vulkan-loader-devel

# Rebuild
docker compose -f docker-compose.gpu.yml build --no-cache
```

### Performance GPU pior que CPU

**Problema:** Overhead de virtualização ou driver incorreto

**Solução:**
```bash
# 1. Verifique qual driver está sendo usado
docker exec -it jarvis-backend-ts vulkaninfo | grep deviceName

# 2. Force driver correto (AMD)
# Em docker-compose.gpu.yml:
environment:
  - VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json

# 3. Se continuar lento, use hybrid architecture ao invés
```

---

## 📊 Performance Esperada (RX 7600)

| Modelo | CPU (cores) | GPU Vulkan | Speedup |
|--------|-------------|------------|---------|
| base | ~3s (10s áudio) | ~1s | 3x |
| medium | ~6s (10s áudio) | ~2s | 3x |

**VRAM usage:**
- base: ~500MB
- medium: ~1.5GB

---

## 🔄 Migrando de CPU para GPU

Se você já está usando `docker-compose.yml` (CPU):

```bash
# 1. Pare containers atuais
docker compose down

# 2. Build nova imagem GPU
docker compose -f docker-compose.gpu.yml build

# 3. Inicie com GPU
docker compose -f docker-compose.gpu.yml up -d

# 4. Dados persistem (volumes são os mesmos)
```

**Rollback para CPU:**
```bash
docker compose -f docker-compose.gpu.yml down
docker compose up -d  # Volta para CPU
```

---

## 📝 Arquivos Criados

```
C:\jarvis\
├── Dockerfile.backend-ts          # CPU-only (atual, Windows/macOS)
├── Dockerfile.backend-ts.gpu      # GPU Vulkan (Linux nativo)
├── docker-compose.yml             # CPU-only (padrão)
└── docker-compose.gpu.yml         # GPU Vulkan (Linux nativo)
```

**Quando usar cada um:**

| Arquivo | Quando usar |
|---------|-------------|
| `Dockerfile.backend-ts` | Windows, macOS, Linux sem GPU |
| `Dockerfile.backend-ts.gpu` | Linux nativo com GPU AMD/Intel/NVIDIA |
| `docker-compose.yml` | Desenvolvimento, produção sem GPU |
| `docker-compose.gpu.yml` | Produção Linux com GPU |

---

## 🎯 Checklist Rápido

Quando você migrar para Linux e quiser GPU:

- [ ] Instale drivers GPU: `sudo apt install mesa-vulkan-drivers vulkan-tools`
- [ ] Verifique GPU: `vulkaninfo --summary`
- [ ] Verifique /dev/dri: `ls -la /dev/dri`
- [ ] Adicione aos grupos: `sudo usermod -aG video,render $USER`
- [ ] Logout e login
- [ ] Build GPU: `docker compose -f docker-compose.gpu.yml build`
- [ ] Rode GPU: `docker compose -f docker-compose.gpu.yml up -d`
- [ ] Verifique logs: `docker logs jarvis-backend-ts | grep Vulkan`

---

## 🤝 Suporte

**Funciona:**
- ✅ Ubuntu 20.04+, Debian 11+, Fedora 35+, Arch
- ✅ AMD GPU (RX 400+, RDNA 1-3)
- ✅ Intel GPU (Gen 9+, Arc)
- ✅ NVIDIA GPU (com driver proprietário)

**Não funciona:**
- ❌ Windows (WSL2 GPU support é limitado)
- ❌ macOS (sem Vulkan support em containers)
- ❌ Docker Desktop (qualquer OS)

**Para Windows/macOS:**
- Use `docs/HYBRID-GPU-ARCHITECTURE.md` (GPU no host + Docker CPU)
- Ou aceite CPU-only com modelo medium (ainda é bom)

---

**Criado:** 2026-04-13
**Hardware:** AMD Radeon RX 7600
**Testado:** Pendente (Linux migration required)
