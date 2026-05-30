# Deployment Guide — Hetzner Cloud VPS

This guide walks through deploying OpenPM on a Hetzner Cloud VPS using Docker Compose and Caddy as a TLS-terminating reverse proxy.

## 1. Provision a VPS

Recommended minimum specs: **CX22** (2 vCPU, 4 GB RAM). For teams with heavy document processing, consider **CPX31** (4 vCPU, 8 GB RAM).

Create the server in the Hetzner Cloud Console with **Ubuntu 24.04**. Add your SSH public key during provisioning.

## 2. Basic Server Hardening

```bash
# As root — create a non-root user
adduser deploy
usermod -aG sudo docker deploy   # will add to docker group after Docker install
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/

# Firewall: allow SSH, HTTP, HTTPS only
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Optionally disable password SSH login:

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd
```

## 3. Install Docker

```bash
# Install the Docker apt repo
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow non-root user to run Docker
usermod -aG docker deploy
newgrp docker   # or log out and back in
```

Verify:

```bash
docker compose version
```

## 4. Install Caddy

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
```

## 5. Clone the Repository and Configure

```bash
su - deploy
git clone https://github.com/your-org/openpm.git /home/deploy/openpm
cd /home/deploy/openpm
cp .env.example .env
```

Edit `.env` and fill in every value:

```bash
# Deployment environment — set to "production" to enable hardening checks
ENVIRONMENT=production

# Database
POSTGRES_PASSWORD=<strong-random-password>

# Auth — generate with: openssl rand -hex 32
SECRET_KEY=<output-of-openssl-rand-hex-32>

# AES-256 key for encrypting provider credentials at rest.
# Generate with: openssl rand -base64 32
OPENPM_ENCRYPTION_KEY=<output-of-openssl-rand-base64-32>

# Token lifetimes (optional overrides)
ACCESS_TOKEN_EXPIRE_DAYS=7

# Storage (leave as-is when using the Docker volume)
STORAGE_PATH=/storage

# Public URLs — replace with your actual domain
FRONTEND_URL=https://openpm.example.com
NEXT_PUBLIC_API_URL=https://openpm.example.com

# Upload size limit in bytes (default 50 MB)
MAX_UPLOAD_BYTES=52428800

# Worker concurrency
ARQ_MAX_JOBS=5

# OCR (optional)
KREUZBERG_FORCE_OCR=false
KREUZBERG_OCR_LANGUAGE=deu+eng
```

> **Note on LLM / embedding providers:** These are configured through the Settings UI after first login. They are stored encrypted in the database (see `docs/provider-setup.md`).

## 6. Configure Caddy

Create `/etc/caddy/Caddyfile`:

```caddyfile
openpm.example.com {
    # API and auth routes — proxy to backend
    # flush_interval -1 disables buffering so SSE (pipeline events, chat stream) works
    handle /api/* {
        reverse_proxy localhost:8000 {
            flush_interval -1
        }
    }

    handle /auth/* {
        reverse_proxy localhost:8000 {
            flush_interval -1
        }
    }

    # Everything else goes to the Next.js frontend
    handle {
        reverse_proxy localhost:3000
    }
}
```

Replace `openpm.example.com` with your actual domain. Caddy will obtain and auto-renew a Let's Encrypt TLS certificate.

Reload Caddy:

```bash
sudo systemctl reload caddy
```

> **SSE note:** The `flush_interval -1` directive on backend routes is required. Without it, Caddy buffers chunked responses and the browser never receives pipeline progress events or streaming chat tokens.

## 7. Start the Stack

```bash
cd /home/deploy/openpm

# Start all services in detached mode (production compose file only — no hot-reload)
docker compose -f docker-compose.yml up -d

# Run database migrations
docker compose exec backend alembic upgrade head
```

Check that all containers are healthy:

```bash
docker compose ps
```

Verify the health endpoint:

```bash
curl https://openpm.example.com/api/health/ready
# Expected: {"db":"ok","redis":"ok","qdrant":"ok","status":"ready"}
```

## 8. Updating

```bash
cd /home/deploy/openpm
git pull
docker compose pull
docker compose -f docker-compose.yml up -d
docker compose exec backend alembic upgrade head
```

This sequence pulls the latest images, recreates only changed containers, and applies any new migrations. Downtime is typically a few seconds.

## 9. Restoring from Backup

The companion script `scripts/backup.sh` produces a dated directory (or tarball) containing three artifacts per backup run:

- `openpm_YYYYMMDD.sql` — a PostgreSQL dump (`pg_dump` format)
- `qdrant_YYYYMMDD/` — a Qdrant collection snapshot (created via the Qdrant `/snapshots` API)
- `storage_YYYYMMDD.tar.gz` — a tar of the `storage/` directory (uploaded files + per-project git repos)

Retention: 7 daily, 4 weekly, 12 monthly copies in `BACKUP_DIR`.

### Restore procedure

1. **Stop the stack:**

   ```bash
   docker compose -f docker-compose.yml down
   ```

2. **Restore the database:**

   ```bash
   # Start only postgres
   docker compose -f docker-compose.yml up -d postgres

   # Drop and recreate the database
   docker compose exec postgres psql -U openpm -c "DROP DATABASE openpm;"
   docker compose exec postgres psql -U openpm -c "CREATE DATABASE openpm;"

   # Restore from the SQL dump
   docker compose exec -T postgres psql -U openpm openpm < /path/to/openpm_YYYYMMDD.sql
   ```

   If the backup was created with `pg_dump -Fc` (custom format), use `pg_restore` instead:

   ```bash
   docker compose exec -T postgres pg_restore -U openpm -d openpm < /path/to/openpm_YYYYMMDD.dump
   ```

3. **Restore Qdrant collections:**

   Start Qdrant and upload the snapshot via its REST API:

   ```bash
   docker compose -f docker-compose.yml up -d qdrant

   # For each collection snapshot in qdrant_YYYYMMDD/:
   curl -X POST "http://localhost:6333/collections/{collection_name}/snapshots/upload" \
     -H "Content-Type: multipart/form-data" \
     -F "snapshot=@/path/to/qdrant_YYYYMMDD/{collection_name}.snapshot"

   # Then restore it:
   curl -X PUT "http://localhost:6333/collections/{collection_name}/snapshots/recover" \
     -H "Content-Type: application/json" \
     -d '{"location": "file:///qdrant/storage/snapshots/{collection_name}/{collection_name}.snapshot"}'
   ```

4. **Restore uploaded files and project git repos:**

   ```bash
   # Clear existing storage volume contents
   docker run --rm -v openpm_storage_data:/storage alpine sh -c "rm -rf /storage/*"

   # Extract backup into the volume
   docker run --rm \
     -v openpm_storage_data:/storage \
     -v /path/to/backup:/backup \
     alpine tar -xzf /backup/storage_YYYYMMDD.tar.gz -C /storage --strip-components=1
   ```

5. **Start the full stack and run migrations:**

   ```bash
   docker compose -f docker-compose.yml up -d
   docker compose exec backend alembic upgrade head
   ```
