# Travel App — Deployment Runbook

## Stack
- **Hosting**: Hetzner Cloud VPS (CAX11, Ubuntu 24.04)
- **Runtime**: Node.js v24 via nvm
- **Process manager**: PM2
- **Reverse proxy**: nginx (SSL termination)
- **Auth**: Cloudflare Access (Zero Trust, email whitelist)
- **DNS**: Cloudflare
- **DB**: SQLite (`local.db` at project root), backed up daily to OneDrive via rclone

---

## Initial VPS Setup

### 1. Provision Hetzner server
- Type: CAX11 (ARM, 2 vCPU, 4GB RAM)
- Image: Ubuntu 24.04
- Location: same region as finance-app (for consistency)
- SSH key: add your existing key

### 2. Node.js via nvm
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
nvm alias default 24
```

### 3. PM2
```bash
npm install -g pm2
pm2 startup
# Follow the command it outputs to enable auto-start
```

### 4. Clone repo and install
```bash
git clone <repo-url> ~/travel-app
cd ~/travel-app
npm install
npm run build
```

### 5. Create trip-photos directory
```bash
mkdir -p ~/travel-app/public/trip-photos
# SQLite DB (local.db) is created automatically at first run
```

### 6. Environment variables
Create `~/travel-app/.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GMAIL_CLIENT_ID=...
GOOGLE_GMAIL_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
RESEND_API_KEY=...
NEXT_PUBLIC_APP_URL=https://travel.zo-bot.com
PORT=3000
```

### 7. Start with PM2
```bash
cd ~/travel-app
pm2 start .next/standalone/server.js --name travel-app
pm2 save
```

### 8. nginx config
Create `/etc/nginx/sites-available/travel`:
```nginx
server {
    listen 443 ssl;
    server_name travel.zo-bot.com;

    ssl_certificate     /etc/ssl/cloudflare-travel.pem;
    ssl_certificate_key /etc/ssl/cloudflare-travel.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/travel /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 9. Cloudflare Origin Certificate
- Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate
- Save as `/etc/ssl/cloudflare-travel.pem` and `/etc/ssl/cloudflare-travel.key`

### 10. Cloudflare Zero Trust (Access)
- Zero Trust → Access → Applications → Add application → Self-hosted
- App domain: `travel.zo-bot.com`
- Policy: email → `chrissdyer@gmail.com`
- This gates the entire site — no in-app login needed

---

## Deployment (after setup)

Add to PowerShell `$PROFILE`:
```powershell
function Deploy-Travel {
    $vps = "chris@<vps-ip>"
    ssh $vps "export PATH=~/.nvm/versions/node/v24.16.0/bin:`$PATH && cd ~/travel-app && git pull && npm install && npm run build && pm2 restart travel-app"
}
```

Then just run:
```powershell
Deploy-Travel
```

---

## Backups

### rclone setup (first time)
```bash
# On VPS — configure rclone with OneDrive (same config as finance-app)
rclone config
# Follow prompts to set up OneDrive remote named "onedrive"
```

### Daily cron
```bash
crontab -e
# Add:
0 2 * * * rclone copy ~/travel-app/local.db onedrive:/Backups/travel-app/ --log-file=/var/log/rclone-travel.log
```

### Hetzner snapshots
- Hetzner Console → Server → Backups → Enable automatic daily snapshots

---

## Google OAuth redirect URI update
In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client:
- Add authorized redirect URI: `https://travel.zo-bot.com/api/gmail/callback`
- Update `NEXT_PUBLIC_APP_URL` in `.env.local` on VPS

---

## Useful commands
```bash
pm2 status              # Check app status
pm2 logs travel-app     # Stream logs
pm2 restart travel-app  # Restart
nginx -t                # Test nginx config
systemctl reload nginx  # Apply nginx changes
```

---

## DB location note
SQLite DB is at `~/travel-app/local.db`. The `next.config.ts` `standalone` output copies the server to `.next/standalone/` but the DB path uses `process.cwd()` which resolves to the project root when PM2 is started from `~/travel-app`, so the DB stays at `~/travel-app/local.db`. Make sure PM2 is started from the project directory or configure `cwd` in the PM2 ecosystem file.
