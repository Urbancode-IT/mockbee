#!/usr/bin/env bash
# Isolated MockBee install — does NOT touch other apps (progz, Zen, InOut, etc).
# Run as the deploy user (e.g. zen). Needs sudo only for systemd + nginx site add.
#
# Usage:
#   bash setup-isolated.sh [git-repo-url] [app-root]
# Example:
#   bash setup-isolated.sh https://github.com/Urbancode-IT/mockbee.git "$HOME/mockbee"
set -euo pipefail

REPO_URL="${1:-https://github.com/Urbancode-IT/mockbee.git}"
APP_ROOT="${2:-$HOME/mockbee}"
BACKEND="$APP_ROOT/backend"
SERVICE_NAME=mockbee-api
NGINX_SITE=mockbee-api
PORT=8001

echo "==> Isolated MockBee root: $APP_ROOT"
echo "    Will NOT modify other nginx sites, ufw, or other app folders."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js missing. Install Node 20 first, then re-run."
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx missing. Install with: sudo apt-get install -y nginx"
  exit 1
fi

if [ ! -d "$APP_ROOT/.git" ]; then
  git clone "$REPO_URL" "$APP_ROOT"
else
  git -C "$APP_ROOT" pull --ff-only || true
fi

cd "$BACKEND"
npm ci --omit=dev || npm install --omit=dev

if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "Created $BACKEND/.env — edit MONGO_URI, GEMINI_API_KEY, MOCKBEE_APP_URL"
fi

# Ensure bind stays local (nginx proxies); do not overwrite existing .env values
grep -q '^HOST=' "$BACKEND/.env" || echo 'HOST=127.0.0.1' >> "$BACKEND/.env"
grep -q '^PORT=' "$BACKEND/.env" || echo "PORT=$PORT" >> "$BACKEND/.env"

RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"
NODE_BIN="$(command -v node)"

echo "==> Writing systemd unit (only $SERVICE_NAME)"
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=MockBee API (isolated)
After=network.target
Wants=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${BACKEND}
EnvironmentFile=${BACKEND}/.env
ExecStart=${NODE_BIN} src/server.js
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "==> Adding nginx site ONLY if missing (does not remove/replace other sites)"
NGINX_AVAIL="/etc/nginx/sites-available/${NGINX_SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE}"

if [ -f "$NGINX_AVAIL" ]; then
  echo "    Existing $NGINX_AVAIL left unchanged."
else
  sudo tee "$NGINX_AVAIL" >/dev/null <<EOF
# MockBee API — isolated; edit server_name to your domain
server {
    listen 80;
    listen [::]:80;
    server_name api.mockbee.local;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
fi

if [ ! -e "$NGINX_ENABLED" ]; then
  sudo ln -s "$NGINX_AVAIL" "$NGINX_ENABLED"
fi

sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "Done (isolated)."
echo "  App:     $APP_ROOT"
echo "  Service: systemctl status $SERVICE_NAME"
echo "  Local:   curl http://127.0.0.1:${PORT}/"
echo "  Next:    nano $BACKEND/.env"
echo "           sudo nano $NGINX_AVAIL   # set server_name"
echo "  Untouched: other ~/ apps, other nginx sites, firewall."
