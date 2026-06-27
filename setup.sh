#!/bin/bash
# Digital Human Studio — Mac Setup Script
# Usage: ./setup.sh [all|node|python|ffmpeg|wav2lip|piper|models]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

TARGET="${1:-all}"

# ── Node.js ───────────────────────────────────────────────────────────────────
setup_node() {
  info "Checking Node.js..."
  if ! command -v node &>/dev/null; then
    warn "Node.js not found. Install from https://nodejs.org or via nvm:"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "  nvm install 20"
  else
    NODE_VER=$(node --version)
    ok "Node.js $NODE_VER"
  fi
  info "Installing npm dependencies..."
  npm install
  ok "npm install done"
}

# ── Python ────────────────────────────────────────────────────────────────────
setup_python() {
  info "Checking Python..."
  PYTHON=""
  for bin in python3.9 python3 python; do
    if command -v "$bin" &>/dev/null; then
      PYTHON="$bin"
      PY_VER=$("$bin" --version 2>&1)
      ok "$bin → $PY_VER"
      break
    fi
  done
  if [ -z "$PYTHON" ]; then
    fail "Python not found. Install Python 3.9+ from https://python.org"
    return 1
  fi

  info "Installing Python worker dependencies..."
  $PYTHON -m pip install opencv-python mediapipe numpy Pillow librosa soundfile scipy requests tqdm 2>&1 | tail -5
  ok "Python deps installed"
}

# ── FFmpeg ────────────────────────────────────────────────────────────────────
setup_ffmpeg() {
  info "Checking FFmpeg..."
  if command -v ffmpeg &>/dev/null; then
    FF_VER=$(ffmpeg -version 2>&1 | head -1)
    ok "FFmpeg found: $FF_VER"
  else
    warn "FFmpeg not found. Installing via Homebrew..."
    if command -v brew &>/dev/null; then
      brew install ffmpeg
      ok "FFmpeg installed"
    else
      fail "Homebrew not found. Install FFmpeg manually: https://ffmpeg.org/download.html"
      echo "  Or install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    fi
  fi
}

# ── Wav2Lip ───────────────────────────────────────────────────────────────────
setup_wav2lip() {
  info "Setting up Wav2Lip..."
  WAV2LIP_DIR="$SCRIPT_DIR/Wav2Lip"

  if [ ! -d "$WAV2LIP_DIR" ]; then
    info "Cloning Wav2Lip..."
    git clone https://github.com/Rudrabha/Wav2Lip.git "$WAV2LIP_DIR"
    ok "Wav2Lip cloned"
  else
    ok "Wav2Lip already cloned"
  fi

  info "Installing Wav2Lip dependencies..."
  PYTHON=""
  for bin in python3.9 python3; do
    if command -v "$bin" &>/dev/null; then PYTHON="$bin"; break; fi
  done

  if [ -n "$PYTHON" ]; then
    $PYTHON -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu 2>&1 | tail -3
    $PYTHON -m pip install -r "$WAV2LIP_DIR/requirements.txt" 2>&1 | tail -5
    ok "Wav2Lip Python deps installed"
  fi

  CKPT_DIR="$WAV2LIP_DIR/checkpoints"
  mkdir -p "$CKPT_DIR"

  if [ ! -f "$CKPT_DIR/wav2lip_gan.pth" ]; then
    echo ""
    warn "Wav2Lip checkpoint needs manual download (SharePoint restriction):"
    echo "  1. Visit: https://github.com/Rudrabha/Wav2Lip#getting-the-weights"
    echo "  2. Download: wav2lip_gan.pth"
    echo "  3. Place at: $CKPT_DIR/wav2lip_gan.pth"
  else
    ok "Wav2Lip checkpoint found"
  fi

  echo ""
  info "s3fd face detection model (for Wav2Lip):"
  S3FD_PATH="$WAV2LIP_DIR/face_detection/detection/sfd/s3fd.pth"
  if [ ! -f "$S3FD_PATH" ]; then
    mkdir -p "$(dirname "$S3FD_PATH")"
    warn "Download s3fd.pth from:"
    echo "  https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth"
    echo "  Save as: $S3FD_PATH"
  else
    ok "s3fd model found"
  fi
}

# ── Piper TTS ─────────────────────────────────────────────────────────────────
setup_piper() {
  info "Setting up Piper TTS..."
  echo ""
  echo "Option 1 — pip install (recommended for development):"
  echo "  pip3 install piper-phonemize"
  echo ""
  echo "Option 2 — Download Piper binary:"
  echo "  Visit: https://github.com/rhasspy/piper/releases"
  echo "  Download the macOS build and put 'piper' in your PATH"
  echo ""
  echo "After installing Piper, download a voice model:"
  echo "  Voice models: https://huggingface.co/rhasspy/piper-voices"
  echo "  Place .onnx + .onnx.json files in: $SCRIPT_DIR/workers/voices/"
  echo ""
  echo "  Example (Amy US English):"
  echo "  wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx -P workers/voices/"
  echo "  wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json -P workers/voices/"
  ok "Piper setup instructions shown"
}

# ── Storage dirs ──────────────────────────────────────────────────────────────
setup_dirs() {
  info "Creating storage directories..."
  mkdir -p storage/faces storage/voices storage/videos storage/originals storage/thumbnails storage/temp data workers/voices
  for d in storage/faces storage/voices storage/videos storage/originals storage/thumbnails storage/temp; do
    touch "$d/.gitkeep" 2>/dev/null || true
  done
  ok "Directories ready"
}

# ── Copy env ──────────────────────────────────────────────────────────────────
setup_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    ok "Created .env from .env.example — edit it to add API keys"
  else
    ok ".env already exists"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Digital Human Studio — Setup"
echo "======================================================"
echo ""

case "$TARGET" in
  node)    setup_node ;;
  python)  setup_python ;;
  ffmpeg)  setup_ffmpeg ;;
  wav2lip) setup_wav2lip ;;
  piper)   setup_piper ;;
  dirs)    setup_dirs ;;
  all)
    setup_dirs
    setup_env
    setup_ffmpeg
    setup_node
    setup_python
    echo ""
    echo "======================================================"
    ok "Core setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Start server:  npm start"
    echo "  2. Open browser:  http://localhost:4200"
    echo "  3. Login:         admin@digitalhuman.local / Admin2024!"
    echo ""
    echo "For better lip sync (optional):"
    echo "  ./setup.sh wav2lip   — local Wav2Lip (needs ~2GB + checkpoint)"
    echo "  ./setup.sh piper     — local Piper TTS (better voice quality)"
    echo "======================================================"
    ;;
  *)
    echo "Usage: ./setup.sh [all|node|python|ffmpeg|wav2lip|piper|dirs]"
    exit 1
    ;;
esac
