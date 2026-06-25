#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-192.168.3.86}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/partsbox-manager}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_proxmox}"
SERVICE_NAME="${SERVICE_NAME:-partsbox-library.service}"
WAIT_SECONDS="${WAIT_SECONDS:-60}"
TEST_IMAGE_PATH="${TEST_IMAGE_PATH:-/tmp/partsbox-server-test-label.png}"

log() {
  printf '%s\n' "$*"
}

run_ssh() {
  ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" "$@"
}

prompt_for_password() {
  if [[ -n "${PBM_TEST_PASSWORD:-}" ]]; then
    return
  fi

  if [[ -t 0 ]]; then
    read -r -s -p "PBM test password for authenticated label fetch (leave empty to skip): " PBM_TEST_PASSWORD
    printf '\n'
  fi
}

build_local() {
  log "Building local bundles..."
  (cd "$ROOT_DIR" && npm run build:library && npm run build:web)
}

sync_remote() {
  log "Stopping remote service..."
  run_ssh systemctl stop "$SERVICE_NAME"

  log "Clearing remote source/build tree while preserving data, node_modules, and .env..."
  run_ssh "cd '$REMOTE_DIR' && find . -mindepth 1 -maxdepth 1 ! -name data ! -name node_modules ! -name .env -exec rm -rf {} +"

  log "Streaming local tree to remote host..."
  tar \
    --exclude='./data' \
    --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./.claude' \
    --exclude='./.superpowers' \
    --exclude='./scratch' \
    --exclude='./label-test-image.png' \
    --exclude='./server-test-image.png' \
    --exclude='./text-probe.png' \
    --exclude='./tmp-*' \
    --exclude='./._*' \
    --exclude='./.env' \
    -cf - -C "$ROOT_DIR" . | ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" "cd '$REMOTE_DIR' && tar -xf -"

  log "Starting remote service..."
  run_ssh systemctl start "$SERVICE_NAME"
}

test_remote_server() {
  prompt_for_password

  log "Waiting ${WAIT_SECONDS}s for the service to settle..."
  sleep "$WAIT_SECONDS"

  log "Testing deployed server..."
  PBM_REMOTE_HOST="$REMOTE_HOST" \
  PBM_REMOTE_PORT="39200" \
  PBM_TEST_PASSWORD="${PBM_TEST_PASSWORD:-}" \
  PBM_TEST_IMAGE_PATH="$TEST_IMAGE_PATH" \
  node --input-type=module <<'EOF'
import fs from 'node:fs/promises';

const host = process.env.PBM_REMOTE_HOST;
const port = process.env.PBM_REMOTE_PORT ?? '39200';
const baseUrl = `http://${host}:${port}`;
const password = process.env.PBM_TEST_PASSWORD ?? '';
const imagePath = process.env.PBM_TEST_IMAGE_PATH ?? '/tmp/partsbox-server-test-label.png';

const authStatusRes = await fetch(`${baseUrl}/api/auth/status`);
const authStatusText = await authStatusRes.text();
if (!authStatusRes.ok) {
  throw new Error(`auth status failed: ${authStatusRes.status} ${authStatusText}`);
}

const authStatus = JSON.parse(authStatusText);
console.log(`auth status: ${JSON.stringify(authStatus)}`);

let token = '';
if (authStatus.enabled) {
  if (!password) {
    throw new Error('Server auth is enabled. Set PBM_TEST_PASSWORD and rerun this script.');
  }

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const loginText = await loginRes.text();
  if (!loginRes.ok) {
    throw new Error(`login failed: ${loginRes.status} ${loginText}`);
  }

  const login = JSON.parse(loginText);
  token = login.token;
  if (!token) {
    throw new Error('login response did not include a token');
  }
  console.log('login succeeded');
}

const headers = token ? { authorization: `Bearer ${token}` } : {};
const partsRes = await fetch(`${baseUrl}/api/mobile/parts?section=active`, { headers });
const partsText = await partsRes.text();
if (!partsRes.ok) {
  throw new Error(`parts request failed: ${partsRes.status} ${partsText}`);
}

const parts = JSON.parse(partsText);
const firstPart = Array.isArray(parts) ? parts[0] : parts.parts?.[0] ?? parts.items?.[0] ?? parts[0];
const partId = firstPart?.partId ?? firstPart?.id ?? firstPart?.part_id;
if (!partId) {
  throw new Error('could not determine a part id from the active parts response');
}

const pngRes = await fetch(`${baseUrl}/api/mobile/part/${partId}/label.png`, { headers });
const pngBuffer = Buffer.from(await pngRes.arrayBuffer());
if (!pngRes.ok) {
  throw new Error(`label fetch failed: ${pngRes.status} ${pngBuffer.toString('utf8')}`);
}

await fs.writeFile(imagePath, pngBuffer);
console.log(`label render OK: part=${partId} bytes=${pngBuffer.length} file=${imagePath}`);
EOF
}

build_local
sync_remote
test_remote_server
