# Deploying to travel.zo-bot.com

Step-by-step checklist for deploying alongside `finance-app` on the existing Hetzner VPS.

---

## Before you start

Have these ready:

- [ ] Anthropic API key (`sk-ant-...`)
- [ ] Google Maps API key (add `travel.zo-bot.com` to allowed HTTP referrers if restricted)
- [ ] Gmail OAuth Client ID + Secret (add a new redirect URI in Step 6)
- [ ] SSH access confirmed: `ssh chris@91.99.230.234`
- [ ] `travel.zo-bot.com` DNS not yet configured (or pointing nowhere)

---

## Step 1 — Clone, build, and start

SSH into the VPS, then:

```bash
# Clone
git clone https://github.com/ChrisDyer/travel-app.git ~/travel-app
cd ~/travel-app

# Build — must use nvm's node, not system node
export PATH=~/.nvm/versions/node/v24.16.0/bin:$PATH
npm install

# Delete any stale package-lock.json in the home directory — if one exists,
# Next.js treats it as a workspace root and nests standalone output under a
# subdirectory, breaking the PM2 start path.
rm -f ~/package-lock.json

npm run build

# Copy static assets into the standalone output (required after every build)
cp -r .next/static .next/standalone/.next/static
cp -r public/. .next/standalone/public/

# Create the cover photo directory (persists across deploys)
mkdir -p ~/travel-app/public/trip-photos
```

Create `~/travel-app/.env.local`:

```
PORT=3001
ANTHROPIC_API_KEY=
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_APP_URL=https://travel.zo-bot.com
DB_PATH=/home/chris/travel-app/local.db
```

> **PORT=3001** — finance-app occupies 3000.
> **DB_PATH** — keeps the database outside `.next/` so it survives builds.

Create the PM2 start script at `~/travel-app/start.sh`:

```bash
#!/bin/bash
set -a
source ~/travel-app/.env.local
set +a
exec node ~/travel-app/.next/standalone/server.js
```

```bash
chmod +x ~/travel-app/start.sh
```

> **Why a wrapper script?** Next.js standalone does not read `.env.local` at runtime.
> The script sources it first so `PORT`, `ANTHROPIC_API_KEY`, `DB_PATH`, etc. are
> all available when the server starts.

Start with PM2:

```bash
pm2 start ~/travel-app/start.sh --name travel-app --cwd ~/travel-app --interpreter bash
pm2 save
```

Confirm it's running:

```bash
pm2 status
# travel-app should show: online
```

---

## Step 2 — Cloudflare Origin Certificate

The existing wildcard certificate (`*.zo-bot.com`) at `/etc/ssl/cloudflare.pem` and
`/etc/ssl/cloudflare.key` already covers `travel.zo-bot.com` — no new certificate needed.

---

## Step 3 — nginx vhost

Create `/etc/nginx/sites-available/travel`:

```nginx
server {
    listen 80;
    server_name travel.zo-bot.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name travel.zo-bot.com;

    ssl_certificate     /etc/ssl/cloudflare.pem;
    ssl_certificate_key /etc/ssl/cloudflare.key;

    location / {
        proxy_pass http://localhost:3001;
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

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/travel /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 4 — Cloudflare DNS

1. Cloudflare dashboard → zo-bot.com → **DNS** → **Add record**
2. Type: **A**, Name: `travel`, IPv4: `91.99.230.234`, Proxy status: **Proxied** (orange cloud)

---

## Step 5 — Cloudflare Access

1. [Zero Trust dashboard](https://one.dash.cloudflare.com) → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. App name: Travel App
3. App domain: `travel.zo-bot.com`
4. Create a policy: **Allow**, rule type: **Emails**, value: `chrissdyer@gmail.com`
5. Save

---

## Step 6 — Update Google credentials

**Gmail OAuth — add production redirect URI:**

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials** → your OAuth 2.0 client
2. Under **Authorized redirect URIs**, add: `https://travel.zo-bot.com/api/gmail/callback`
3. Save

**Maps API key — add production domain (only if key is HTTP-referrer restricted):**

1. Credentials → your Maps API key → **Application restrictions** → **HTTP referrers**
2. Add: `https://travel.zo-bot.com/*`
3. Save

---

## Step 7 — Deploy alias

The `Deploy-Travel` function is already in `$PROFILE` on the local machine:

```powershell
function Deploy-Travel {
    ssh chris@91.99.230.234 "export PATH=~/.nvm/versions/node/v24.16.0/bin:`$PATH && cd ~/travel-app && git pull && npm install && sudo rm -rf .next && npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public/. .next/standalone/public/ && pm2 restart travel-app"
}
```

> **`sudo rm -rf .next` before every build** — files copied into `.next/standalone/public/`
> during a previous deploy can end up owned by root, causing the next build to fail with
> `EACCES: permission denied`. Removing `.next/` first avoids this.
>
> **`cp -r public/.`** — copies the *contents* of `public/` into the destination. Using
> `cp -r public` instead (without the trailing `/.`) creates a nested `public/public/`
> directory on subsequent runs.

Future deploys: just run `Deploy-Travel` from PowerShell.

---

## Step 8 — Migrating existing data

If you have a local SQLite database to import:

```powershell
# Copy all three files — the WAL contains uncommitted transactions
scp C:\Users\chris\OneDrive\Apps\travel-app\local.db chris@91.99.230.234:~/travel-app/local.db
scp C:\Users\chris\OneDrive\Apps\travel-app\local.db-wal chris@91.99.230.234:~/travel-app/local.db-wal
scp C:\Users\chris\OneDrive\Apps\travel-app\local.db-shm chris@91.99.230.234:~/travel-app/local.db-shm
```

Then on the VPS, checkpoint the WAL to merge it into the main file and fix user IDs:

```bash
sqlite3 ~/travel-app/local.db "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 ~/travel-app/local.db "UPDATE trips SET user_id = 'local';"
export PATH=~/.nvm/versions/node/v24.16.0/bin:$PATH && pm2 restart travel-app
```

> The app uses `user_id = 'local'` for all data (single-user mode). Local dev data
> was originally stored under `'local'` which may have been updated to an email address
> at some point — the UPDATE above normalises everything back.

---

## Step 9 — Backups

On the VPS, add to crontab (`crontab -e`):

```bash
# SQLite DB — daily at 2:00 AM
0 2 * * * rclone copy ~/travel-app/local.db onedrive:/travel-app-backups/ --log-file=/var/log/rclone-travel.log

# Cover photos — daily at 2:05 AM
5 2 * * * rclone sync ~/travel-app/public/trip-photos/ onedrive:/travel-app-photos/ --log-file=/var/log/rclone-travel.log
```

---

## Step 10 — Verify

- [ ] `https://travel.zo-bot.com` → Cloudflare Access login prompt appears
- [ ] Sign in with `chrissdyer@gmail.com` → trips list loads with data
- [ ] Create a trip, add a cover photo → photo appears and persists on reload
- [ ] Open a trip → day timeline, key bookings sidebar all render
- [ ] Open Trip Assistant → AI responds to a brainstorm prompt
- [ ] Open Trip Assistant → Extract from Email → Gmail connect flow appears
- [ ] Open the print page for a trip with flights/hotels → all bookings appear
- [ ] `pm2 status` → both `finance-app` and `travel-app` show `online`
