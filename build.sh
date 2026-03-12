#!/bin/bash
set -e

echo "=== 犀牛支付 - 生产构建脚本 ==="
echo ""

# Configuration
OUTPUT_DIR="./dist"
BACKEND_DIR="./backend"
FRONTEND_DIR="./frontend"
PUBLIC_KEY_FILE="./public.pem"

# Target OS (linux for server deployment)
TARGET_OS="${1:-linux}"
TARGET_ARCH="${2:-amd64}"

mkdir -p "$OUTPUT_DIR"

# ---- Step 1: Check tools ----
echo "[1/6] Checking build tools..."

if ! command -v garble &> /dev/null; then
    echo "  Installing garble..."
    go install mvdan.cc/garble@latest
fi

echo "  garble: OK"
echo "  go: $(go version)"

# ---- Step 2: Read public key for embedding ----
echo "[2/6] Preparing license public key..."

if [ ! -f "$PUBLIC_KEY_FILE" ]; then
    echo "  WARNING: public.pem not found. License verification will be disabled."
    echo "  Run: cd backend && go run cmd/license-tool/main.go -genkeys"
    PUB_KEY_CONTENT=""
else
    PUB_KEY_CONTENT=$(cat "$PUBLIC_KEY_FILE")
    echo "  Public key loaded."
fi

# ---- Step 3: Build frontend ----
echo "[3/6] Building frontend..."

cd "$FRONTEND_DIR"
npm ci --silent
npm run build
cd ..

cp -r "$FRONTEND_DIR/dist" "$OUTPUT_DIR/static"
echo "  Frontend built and copied to dist/static/"

# ---- Step 4: Build Go binary with garble ----
echo "[4/6] Building Go binary (garble + stripped)..."

cd "$BACKEND_DIR"

LDFLAGS="-s -w"
LDFLAGS="$LDFLAGS -X 'xinipay/internal/license.publicKeyPEM=$PUB_KEY_CONTENT'"

CGO_ENABLED=0 GOOS=$TARGET_OS GOARCH=$TARGET_ARCH \
    garble -literals -tiny -seed=random \
    build -ldflags="$LDFLAGS" -o "../$OUTPUT_DIR/xinipay" ./cmd/server/

cd ..
echo "  Binary: $OUTPUT_DIR/xinipay"

# ---- Step 5: UPX compression (optional) ----
echo "[5/6] UPX compression..."

if command -v upx &> /dev/null; then
    upx --best --lzma "$OUTPUT_DIR/xinipay" || echo "  UPX failed (non-critical), skipping"
    echo "  UPX compression done."
else
    echo "  UPX not found, skipping compression."
fi

# ---- Step 6: Build auxiliary tools ----
echo "[6/6] Building auxiliary tools..."

cd "$BACKEND_DIR"

CGO_ENABLED=0 GOOS=$TARGET_OS GOARCH=$TARGET_ARCH \
    go build -ldflags="-s -w" -o "../$OUTPUT_DIR/fingerprint" ./cmd/fingerprint/

cd ..
echo "  Fingerprint tool: $OUTPUT_DIR/fingerprint"

# ---- Summary ----
echo ""
echo "=== Build Complete ==="
echo ""
echo "Output directory: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR/"
echo ""
echo "Deployment files:"
echo "  xinipay       - Main server binary"
echo "  fingerprint   - Machine fingerprint tool (give to client)"
echo "  static/       - Frontend assets"
echo "  config.yaml   - Configuration (create from template)"
echo "  license.enc   - License file (sign with license-tool)"
echo ""
echo "IMPORTANT: Never deploy private.pem or license-tool to client servers!"
