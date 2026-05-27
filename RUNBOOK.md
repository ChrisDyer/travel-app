# Travel App — Deployment Runbook

> This runbook describes a Hetzner VPS + Cloudflare Zero Trust deployment. Adapt paths, domain, and provider details for your own setup.

## Stack

| Component | Choice |
|-----------|--------|
| Hosting | Hetzner Cloud VPS (CAX11, ARM, 2 vCPU / 4 GB RAM) |
| OS | Ubuntu 24.04 |
| Runtime | Node.js v24 via nvm |
| Process manager | PM2 |
| Reverse proxy | nginx (SSL termination) |
| Auth | Cloudflare Access (Zero Trust, email allowlist) |
| DNS | Cloudflare |
| Database | SQLite (`local.db` at project root) |
| Backups | Daily rclone to cloud storage |

---

## Initial VPS Setup

### 1. Provision server

- Type: CAX11 (ARM, 2 vCPU, 4 GB RAM) — sufficient for a personal app
- Image: Ubuntu 24.04
- Location: choose a region close to your users
- SSH key: add your existing public key during provisioning

### 2. Firewall (UFW)

Lock down the server before exposing it to the internet. Port 3000 (Node) must never be publicly reachable — only nginx.

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw enable
ufw status
```

### 3. Node.js via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
nvm alias default 24
```

### 4. PM2

```bash
npm install -g pm2
pm2 startup
# Run the command it outputs to enable auto-start on reboot
```

### 5. Clone repo and build

```bash
git clone <repo-url> ~/travel-app
cd ~/travel-app
npm install
npm run build
```

### 6. Create persistent directories

These directories are not tracked by git and must exist on the server.

```bash
mkdir -p ~/travel-app/public/trip-photos
# SQLite DB (local.db) is created automatically on first run
```

> **Cover photos** are stored in `public/trip-photos/` and persist across deploys. `git pull` will not delete them because this directory is in `.gitignore`. They are only lost if you wipe the server — back up with the DB (see Backups section).

### 7. Environment variables

Create `~/travel-app/.env.local`:

```
ANTHROPIC_API_KEY=
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_APP_URL=https://your-domain.com
PORT=3000
```

See `README.md` for how to obtain each value.

### 8. Cloudflare Origin Certificate

This must be done **before** configuring nginx, as nginx references these files.

1. Cloudflare dashboard → your domain → **SSL/TLS** → **Origin Server** → **Create Certificate**
2. Key type: RSA, validity: 15 years, hostnames: `your-domain.com`
3. Copy the certificate and private key to the server:

```bash
# On your local machine:
ssh your-user@YOUR_VPS_IP "sudo tee /etc/ssl/cloudflare-travel.pem" < cloudflare-travel.pem
ssh your-user@YOUR_VPS_IP "sudo tee /etc/ssl/cloudflare-travel.key" < cloudflare-travel.key
```

Or paste the content directly via SSH into those two files on the server.

### 9. nginx config

Install nginx and create the site config:

```bash
apt install -y nginx
```

Create `/etc/nginx/sites-available/travel`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/cloudflare-travel.pem;
    ssl_certificate_key /etc/ssl/cloudflare-travel.key;

    # Only accept connections from Cloudflare (optional but recommended)
    # See https://www.cloudflare.com/ips/ for current ranges
    # allow 103.21.244.0/22;
    # ... (add all Cloudflare IP ranges)
    # deny all;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/travel /etc/nginx/sites-enabled/
nginx -t && systemctl enable nginx && systemctl start nginx
```

### 10. Cloudflare Zero Trust (Access)

This gates the entire site behind Google SSO — no in-app login needed.

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. App name: Travel App, App domain: `your-domain.com`
3. Create a policy: **Allow**, rule type: **Emails**, value: `your-email@example.com`
4. Save

The app reads the `cf-access-authenticated-user-email` header to identify users. Each email gets its own isolated set of trips.

In Cloudflare DNS, set your domain's A record to `YOUR_VPS_IP` with proxy status **Proxied** (orange cloud).

### 11. Google OAuth redirect URI

Add the production redirect URI to your OAuth client:

1. Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth 2.0 client
2. Under **Authorized redirect URIs**, add: `https://your-domain.com/api/gmail/callback`
3. Update `NEXT_PUBLIC_APP_URL` in `.env.local` on the VPS if not already set

### 12. Start the app

```bash
cd ~/travel-app
pm2 start .next/standalone/server.js --name travel-app
pm2 save
```

### 13. Verify

- Open `https://your-domain.com` — you should be redirected to Cloudflare Access login
- Sign in with your allowed email — you should land on the trips page
- Create a trip, add a cover photo — confirm the photo appears
- Open a trip, open Trip Assistant → verify AI responses work
- Open Trip Assistant → Extract from Email → confirm Gmail connect flow works
- Open the print page for a trip with flights/hotels — confirm all bookings appear

---

## Deployment (after initial setup)

Add to your PowerShell `$PROFILE` on your local machine:

```powershell
function Deploy-Travel {
    $vps = "your-user@YOUR_VPS_IP"
    ssh $vps "export PATH=~/.nvm/versions/node/v24.16.0/bin:`$PATH && cd ~/travel-app && git pull && npm install && npm run build && pm2 restart travel-app"
}
```

Then deploy with:

```powershell
Deploy-Travel
```

This pulls the latest code, reinstalls dependencies if changed, rebuilds, and restarts the process. Cover photos and the SQLite DB are unaffected.

---

## Rollback

If a deploy breaks something:

```bash
# On the VPS:
cd ~/travel-app
git log --oneline -10          # Find the last good commit hash
git checkout <commit-hash>     # Detach to that commit
npm run build
pm2 restart travel-app

# To return to normal tracking:
git checkout main
```

---

## Backups

Cover photos and the SQLite DB live outside git. Back them up together.

### rclone setup (first time)

```bash
# On the VPS — configure rclone with your backup destination (OneDrive, S3, etc.)
rclone config
# Follow prompts to set up a remote named "backup-remote"
```

### Daily cron

```bash
crontab -e
# Add these two lines:
0 2 * * * rclone copy ~/travel-app/local.db backup-remote:/travel-app/db/ --log-file=/var/log/rclone-travel.log
5 2 * * * rclone sync ~/travel-app/public/trip-photos/ backup-remote:/travel-app/trip-photos/ --log-file=/var/log/rclone-travel.log
```

### Hetzner snapshots

Hetzner Console → Server → **Backups** → Enable automatic daily snapshots. This covers everything as a full-disk fallback.

---

## Useful commands

```bash
pm2 status                     # Check app status
pm2 logs travel-app            # Stream logs
pm2 logs travel-app --lines 50 # Last 50 log lines
pm2 restart travel-app         # Restart app
pm2 reload travel-app          # Zero-downtime reload

nginx -t                       # Test nginx config
systemctl reload nginx         # Apply nginx changes without downtime

df -h                          # Check disk space
du -sh ~/travel-app/public/trip-photos/  # Check photo storage size
sqlite3 ~/travel-app/local.db ".tables"  # Verify DB is intact
```

---

## Notes

### DB location

SQLite DB is at `~/travel-app/local.db`. The `next.config.ts` `standalone` output places `server.js` at `.next/standalone/server.js` (two levels inside the project). PM2 is started from `~/travel-app`, so `process.cwd()` resolves to the project root — the DB and `public/trip-photos/` paths are correct. Do not change the PM2 start directory.

### Photo storage

Cover photos are written to `public/trip-photos/{tripId}.jpg` at runtime. This directory is in `.gitignore` so deploys never touch it. If you migrate servers, copy this directory (and `local.db`) before decommissioning.

### Authentication in dev vs production

In local development (`NODE_ENV !== 'production'`), `src/lib/auth.ts` falls back to `user_id = 'local'` with no login required. In production behind Cloudflare Access, the `cf-access-authenticated-user-email` header is set on every request and used as the user ID. Never expose the app directly to the internet without Cloudflare Access in front of it.
