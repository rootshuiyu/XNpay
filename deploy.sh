#!/bin/bash
set -e

echo "=== 犀牛支付 - 服务器部署脚本 ==="

# ---- Install Docker if not present ----
if ! command -v docker &> /dev/null; then
    echo "[1/4] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "  Docker installed."
else
    echo "[1/4] Docker already installed."
fi

# ---- Install docker-compose plugin ----
if ! docker compose version &> /dev/null; then
    echo "[2/4] Installing docker-compose plugin..."
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
else
    echo "[2/4] docker-compose already available."
fi

# ---- Clone or update repo ----
APP_DIR="/opt/xinipay"

if [ -d "$APP_DIR" ]; then
    echo "[3/4] Updating existing installation..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "[3/4] Cloning repository..."
    git clone https://github.com/rootshuiyu/XNpay.git "$APP_DIR"
    cd "$APP_DIR"
fi

# ---- Build and start ----
echo "[4/4] Building and starting services..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "=== Deployment Complete ==="
echo ""
docker compose ps
echo ""
echo "Access: http://$(curl -s ifconfig.me):80"
echo "Admin:    admin / admin123"
echo "Merchant: merchant / merchant123"
