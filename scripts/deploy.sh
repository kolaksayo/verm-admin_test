#!/usr/bin/env bash
# deploy.sh — install or update Verm Admin at /opt/verm-admin_test
set -e

DEPLOY_DIR="/opt/verm-admin_test"
REPO_URL="https://github.com/kolaksayo/verm-admin_test.git"
BRANCH="claude/admin-center-mongodb-YPyBe"
SERVICE_NAME="verm-admin"

echo ""
echo "==> Verm Admin deploy"
echo ""

# ── 1. Clone or pull ─────────────────────────────────────────────────────────
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "--> Pulling latest code..."
  git -C "$DEPLOY_DIR" fetch origin "$BRANCH"
  git -C "$DEPLOY_DIR" reset --hard "origin/$BRANCH"
else
  echo "--> Cloning repository to $DEPLOY_DIR..."
  git clone --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"

# ── 2. Check for .env ────────────────────────────────────────────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo ""
  echo "ERROR: $DEPLOY_DIR/.env not found."
  echo "       Copy .env.example and fill in your values:"
  echo "         cp $DEPLOY_DIR/.env.example $DEPLOY_DIR/.env"
  echo "         nano $DEPLOY_DIR/.env"
  echo ""
  exit 1
fi

# ── 3. Install dependencies ───────────────────────────────────────────────────
echo "--> Installing server dependencies..."
npm install --omit=dev

echo "--> Installing client dependencies..."
cd client && npm install && cd ..

# ── 4. Build frontend ─────────────────────────────────────────────────────────
echo "--> Building React frontend..."
npm run build

# ── 5. Install systemd service ────────────────────────────────────────────────
echo "--> Installing systemd service..."

# Detect the real node path (handles nvm / system node)
NODE_BIN=$(which node)
# Update the service file's ExecStart to point at the correct node binary
sed "s|ExecStart=.*|ExecStart=$NODE_BIN server/index.js|" \
  "$DEPLOY_DIR/verm-admin.service" \
  > /etc/systemd/system/${SERVICE_NAME}.service

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# ── 6. Start / restart service ────────────────────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "--> Restarting $SERVICE_NAME..."
  systemctl restart "$SERVICE_NAME"
else
  echo "--> Starting $SERVICE_NAME..."
  systemctl start "$SERVICE_NAME"
fi

echo ""
echo "==> Done!"
echo ""
systemctl status "$SERVICE_NAME" --no-pager
echo ""
echo "Useful commands:"
echo "  View logs   : journalctl -u $SERVICE_NAME -f"
echo "  Stop        : systemctl stop $SERVICE_NAME"
echo "  Restart     : systemctl restart $SERVICE_NAME"
echo "  Disable     : systemctl disable $SERVICE_NAME"
echo ""
