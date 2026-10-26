#!/usr/bin/env bash
# Run on a fresh Ubuntu 22.04/24.04 Linode as root (or with sudo).
# Usage: bash setup-linode.sh [git-repo-url]
set -euo pipefail

REPO_URL="${1:-https://github.com/Urbancode-IT/mockbee.git}"
APP_ROOT=/opt/mockbee
BACKEND="$APP_ROOT/backend"

echo "==> Installing Node 20, nginx, git"
apt-get update -y
apt-get install -y curl git nginx ufw
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Creating mockbee user + app dir"
id -u mockbee >/dev/null 2>&1 || useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin mockbee
mkdir -p "$APP_ROOT"
if [ ! -d "$APP_ROOT/.git" ]; then
  git clone "$REPO_URL" "$APP_ROOT"
else
  git -C "$APP_ROOT" pull --ff-only || true
fi

echo "==> Installing backend deps"
cd "$BACKEND"
npm ci --omit=dev || npm install --omit=dev

if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "Created $BACKEND/.env — edit GEMINI_API_KEY, MONGO_URI, MOCKBEE_APP_URL, admin password."
fi
chown -R mockbee:mockbee "$APP_ROOT"

echo "==> systemd service"
cp "$BACKEND/deploy/mockbee-api.service" /etc/systemd/system/mockbee-api.service
systemctl daemon-reload
systemctl enable mockbee-api
systemctl restart mockbee-api

echo "==> nginx reverse proxy"
cp "$BACKEND/deploy/nginx-mockbee-api.conf" /etc/nginx/sites-available/mockbee-api
ln -sf /etc/nginx/sites-available/mockbee-api /etc/nginx/sites-enabled/mockbee-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> firewall (SSH + HTTP/HTTPS)"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable || true

echo ""
echo "Done. Next:"
echo "  1. Edit $BACKEND/.env (MONGO_URI, GEMINI_API_KEY, MOCKBEE_APP_URL)"
echo "  2. Point DNS A record → this Linode IP; edit server_name in nginx site"
echo "  3. sudo certbot --nginx -d api.yourdomain.com"
echo "  4. Frontend: set VITE_API_BASE=https://api.yourdomain.com"
echo "  5. systemctl status mockbee-api"
