# Deployment Guide

This guide describes how to deploy the PartsBox Manager Passive Library Browser on a local server, a Proxmox LXC container, or any Linux server, configure authentication, and expose it safely to the network or the companion iOS app.

---

## Architecture Overview

The PartsBox Manager ecosystem consists of:
1. **Passive Library Browser (NPM Backend)**: Synced from PartsBox and hosted on a home server (e.g. Proxmox LXC, VM, or Raspberry Pi) to browse and manage component inventory.
2. **Companion SwiftUI iOS App**: Connects to the Passive Library Browser to allow quick barcode scanning, inventory updates, and direct Bluetooth label printing on the go.

---

## 1. Prerequisites

Before starting, ensure your server has:
* **Node.js (v20 or higher)**
* **npm (or pnpm)**
* **Git**
* **Libvips** (Required by the `sharp` image-processing library for rendering label previews):
  * **Debian/Ubuntu**: `sudo apt-get install libvips-dev`
  * **macOS**: `brew install vips`
  * **Alpine Linux**: `apk add vips-dev`

---

## 2. Server Installation

Clone the repository to your server's deployment directory (e.g., `/opt/partsbox-manager`):

```bash
sudo mkdir -p /opt/partsbox-manager
sudo chown -R $USER:$USER /opt/partsbox-manager
git clone <your-repository-url> /opt/partsbox-manager
cd /opt/partsbox-manager
```

### Install Dependencies
Install production and development dependencies:

```bash
npm ci
```

### Build the Application
Compile the frontend client and the backend TypeScript library server:

```bash
# Build the React/TypeScript frontend
npm run build:web

# Build the library server bundle
npm run build:library
```

---

## 3. Configuration (`.env`)

Create a production `.env` configuration file at `/opt/partsbox-manager/.env`:

```ini
# PartsBox API Access (Required)
# Retrieve this from your PartsBox settings -> API Keys
PARTSBOX_API_KEY=partsboxapi_your_secret_key

# DigiKey API Credentials (Optional - for parts enrichment)
DIGIKEY_CLIENT_ID=your_digikey_client_id
DIGIKEY_CLIENT_SECRET=your_digikey_client_secret

# Server Listening Port & Host
LIBRARY_PORT=39200
LIBRARY_HOST=0.0.0.0
LIBRARY_DATA_DIR=./data
LIBRARY_WEB_ROOT=./web/dist

# Inventory Sync Schedules
# Sync interval from PartsBox (1800000 ms = 30 minutes)
LIBRARY_SYNC_INTERVAL_MS=1800000
# Sync queue for local edits when offline (60000 ms = 1 minute)
PENDING_SYNC_INTERVAL_MS=60000

# Authentication (Single-User Security)
AUTH_ENABLED=true
AUTH_PASSWORD_HASH=your_scrypt_password_hash_here
AUTH_TOKEN_SECRET=your_long_random_jwt_signing_secret
AUTH_TOKEN_TTL_SECONDS=315360000  # Long duration for single-user convenience
AUTH_ALLOW_LOCAL_BYPASS=false
```

---

## 4. Single-User Authentication Setup

If you expose your instance to the LAN or internet, you must enable authentication. PartsBox Manager uses secure password hashing and signed HMAC tokens.

### Option A: Automatic Authorization Setup
The simplest way to configure authentication is to generate a secure random password and write the credentials directly to your `.env` file:

```bash
npm run auth:reset
```
*This command outputs a secure plaintext password (e.g., `pbm-XYZ...`) to the console, generates a secure `scrypt` hash, rotates `AUTH_TOKEN_SECRET`, and updates `.env` automatically.*

### Option B: Custom Password Hash Generation
If you want to choose your own password, generate the secure hash manually:

```bash
printf '%s' 'your-custom-password' | npm run auth:hash
```
Copy the resulting output (starting with `scrypt$...`) and paste it as the value for `AUTH_PASSWORD_HASH` in `.env`.

---

## 5. Deployment as a Systemd Service

For continuous operation on Linux (Debian, Ubuntu, Proxmox LXC), run PartsBox Manager under `systemd`.

1. Copy the systemd service template from the repository:
   ```bash
   sudo cp deploy/partsbox-library.service /etc/systemd/system/
   ```

2. Reload the systemd daemon to read the new service file:
   ```bash
   sudo systemctl daemon-reload
   ```

3. Enable the service to start automatically at boot and start it now:
   ```bash
   sudo systemctl enable --now partsbox-library
   ```

4. Check the service status to verify it started successfully:
   ```bash
   sudo systemctl status partsbox-library
   ```

5. Monitor the server logs:
   ```bash
   journalctl -u partsbox-library -f --no-pager
   ```

---

## 6. Reverse Proxy Setup (TLS Termination)

If exposing your instance to the web, we strongly recommend using a reverse proxy to handle HTTPS encryption.

### Option A: Caddy Server (Recommended)
Caddy automatically provisions and renews SSL certificates. Add this to your `/etc/caddy/Caddyfile`:

```caddy
partsbox.yourdomain.com {
    reverse_proxy 127.0.0.1:39200
}
```

### Option B: Nginx
Create an Nginx configuration file (e.g., `/etc/nginx/sites-available/partsbox`):

```nginx
server {
    listen 80;
    server_name partsbox.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name partsbox.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/partsbox.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/partsbox.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:39200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 7. Connecting the iOS App

The SwiftUI app needs to talk to this server.

### Bonjour/Zeroconf Auto-Discovery
The server automatically advertises itself on the local network using Bonjour (service type: `_partsbox-manager._tcp`). 

* **Important**: For Bonjour to work, the server must be deployed on the same physical network/subnet as your iOS device, and must run on host networking (no docker bridges blocking multicast DNS on UDP port 5353).
* When both the device and server are on the same Wi-Fi network, open **Manage** in the iOS App and tap **Discover on Casa**. The app will discover the active base URL automatically.

### Manual Fallback
If automatic discovery is blocked or you are connecting via a reverse proxy (e.g. Tailscale or public domain), enter the URL manually in the iOS app's **Manage** section:
```text
https://partsbox.yourdomain.com
```
*(Make sure to copy the active token generated by your web browser and paste it into the authentication field in the app if single-user auth is enabled).*
