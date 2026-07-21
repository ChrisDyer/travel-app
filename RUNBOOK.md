# Travel App — Deployment Runbook

> This runbook describes a Hetzner VPS + Cloudflare Zero Trust deployment.

## Stack

| Component | Choice |
|-----------|--------|
| Hosting | Hetzner Cloud VPS (CAX11, ARM, 2 vCPU / 4 GB RAM) |
| OS | Ubuntu 24.04 |
| Runtime | Node.js v24 via nvm |
| Process manager | PM2 (via `start.sh` wrapper) |
| Reverse proxy | nginx (SSL termination) |
| Auth | Cloudflare Access (Zero Trust, email allowlist) |
| DNS | Cloudflare |
| Database | SQLite (`~/travel-app/local.db`) |
| Backups | Daily rclone to OneDrive |

---

## Initial VPS Setup

### 1. Provision server

- Type: CAX11 (ARM, 2 vCPU, 4 GB RAM)
- Image: Ubuntu 24.04
- SSH key: add your existing public key during provisioning

### 2. Firewall (UFW)

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw enable
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
# Remove any stale package-lock.json in the home directory first.
# If one exists, Next.js treats ~ as a workspace root and nests the
# standalone output under .next/standalone/<appname>/ instead of
# .next/standalone/ — breaking the PM2 start path.
rm -f ~/package-lock.json

git clone https://github.com/ChrisDyer/travel-app.git ~/travel-app
cd ~/travel-app
export PATH=~/.nvm/versions/node/v24.16.0/bin:$PATH
npm install
npm run build

# Copy static assets into standalone output (required after every build)
cp -r .next/static .next/standalone/.next/static
cp -r public/. .next/standalone/public/
```

> **Why `public/.` and not `public`?** When the destination directory already exists,
> `cp -r public dest` copies `public` *into* `dest`, creating `dest/public/`. Using
> `public/.` copies the *contents* instead, avoiding a nested `public/public/` on
> subsequent deploys.

### 6. Create persistent directories

```bash
# SQLite DB (local.db) is created automatically on first run at DB_PATH
```

### 7. Environment variables

Create `~/travel-app/.env.local`:

```
PORT=3001
ANTHROPIC_API_KEY=
GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_APP_URL=https://travel.zo-bot.com
DB_PATH=/home/chris/travel-app/local.db
INTERNAL_API_TOKEN=
ADMIN_EMAILS=chrissdyer@gmail.com
```

> **`ADMIN_EMAILS`** — per-user read-only role (see `CLAUDE.md`). Comma-separated
> allowlist; any other authenticated email is read-only (403 on writes + hidden
> controls). Unset/empty => everyone has full access (fail-open) — the app deploys
> safely before this line is added.

> **`ALLOW_NO_ACCESS_HEADER=1`** is set in production's `.env.local` today — the
> `cf-access-authenticated-user-email` header defense-in-depth check in `src/proxy.ts`
> is bypassed when it's missing. `ADMIN_EMAILS` still works correctly whenever the
> header *is* present; when it's absent, the request is treated as admin (same
> fail-open rule as an unset `ADMIN_EMAILS`), so this flag doesn't silently disable
> the role feature — but it does mean the Access header isn't guaranteed to be
> forwarded to this app in production, and read-only enforcement for a real user
> depends on it being there.

See `README.md` for how to obtain each value.

> **`NEXT_PUBLIC_APP_URL` stays the legacy `travel.zo-bot.com` origin** — do not change
> this to `zo-bot.com`. The app is served at `zo-bot.com/travel` (see the nginx section
> below), but this value is only used to build the Gmail OAuth `redirect_uri` (which
> must keep matching what's registered in Google Cloud Console) and the post-auth
> redirect. The `travel.zo-bot.com` vhost is now redirect-only, so that post-auth
> redirect bounces once through it — which is exactly what re-adds the `/travel`
> prefix. `next.config.ts`'s `basePath: '/travel'` cannot reliably reconstruct
> `zo-bot.com` from the request itself (confirmed: behind nginx, Next's `request.url`
> resolves to the internal bind address, not the `Host` header), so don't "simplify"
> this by pointing `NEXT_PUBLIC_APP_URL` at the new origin.

> **`DB_PATH`** — Next.js standalone calls `process.chdir(__dirname)` at startup,
> changing the working directory to `.next/standalone/`. Without `DB_PATH`, the app
> creates `local.db` inside `.next/standalone/`, which is wiped on every build.
> Setting an absolute path keeps the database outside the build output.

### 8. PM2 start script

Next.js standalone does **not** read `.env.local` at runtime — environment variables
must already be in the process environment. A wrapper script handles this:

Create `~/travel-app/start.sh`:

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

### 9. Cloudflare Origin Certificate

The wildcard cert (`*.zo-bot.com`) is already on the server at:
- `/etc/ssl/cloudflare.pem`
- `/etc/ssl/cloudflare.key`

It covers all subdomains including `travel.zo-bot.com` — no new certificate needed.

If setting up on a fresh server, create one via Cloudflare dashboard → your domain →
**SSL/TLS** → **Origin Server** → **Create Certificate** (RSA, 15 years, wildcard hostname).

### 10. nginx config

The app is served at `zo-bot.com/travel`, not its own subdomain. Two vhost files are
involved:

| File | Role |
|---|---|
| `/etc/nginx/sites-available/homepage` | Apex vhost (`zo-bot.com`). Owns `location /travel` — a prefix-**kept** proxy to `localhost:3001` (travel-app's own `next.config.ts` has `basePath: '/travel'`, so it expects to see the prefix itself, unlike finance's prefix-stripping proxy). |
| `/etc/nginx/sites-available/travel` | Old `travel.zo-bot.com` vhost. Now **redirect-only**: `return 301 https://zo-bot.com/travel$request_uri;`. Kept (not deleted) so rollback is a one-line edit back to a proxy, and because the Gmail OAuth flow's post-auth redirect deliberately bounces through it (see the env-var note above). |

```bash
apt install -y nginx
```

`location /travel` in `/etc/nginx/sites-available/homepage`:

```nginx
location /travel {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

`/etc/nginx/sites-available/travel` (redirect-only):

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

    return 301 https://zo-bot.com/travel$request_uri;
}
```

```bash
ln -s /etc/nginx/sites-available/travel /etc/nginx/sites-enabled/
nginx -t && systemctl enable nginx && systemctl start nginx
```

### 11. Start the app

```bash
pm2 start ~/travel-app/start.sh --name travel-app --cwd ~/travel-app --interpreter bash
pm2 save
```

### 12. Cloudflare Zero Trust (Access)

The app is now covered by the existing wildcard `*.zo-bot.com` Access policy set up for
the apex (see root `README.md`) — no separate "Travel App" Access application is needed.
The `travel` DNS A record (Proxied) can stay; it only carries the redirect-only vhost now.

### 13. Google OAuth redirect URI

Unchanged from the original subdomain setup — do not add a new one:

1. Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth 2.0 client
2. **Authorized redirect URIs** should already contain: `https://travel.zo-bot.com/api/gmail/callback`

### 14. Verify

- Open `https://zo-bot.com/travel` — Cloudflare Access login appears
- Open `https://travel.zo-bot.com` — 301s to `https://zo-bot.com/travel` (deep links preserved)
- Sign in → trips page loads
- Create a trip, add a cover photo — photo appears
- Open Trip Assistant → AI responds
- Open Trip Assistant → Extract from Email → Gmail connect flow works
- Print page for a trip with flights/hotels — all bookings appear

---

## Deployment (after initial setup)

`Deploy-Travel` is defined in PowerShell `$PROFILE` on the local machine:

```powershell
function Deploy-Travel {
    ssh chris@91.99.230.234 "export PATH=~/.nvm/versions/node/v24.16.0/bin:`$PATH && cd ~/travel-app && git pull && npm install && rm -rf .next && npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public/. .next/standalone/public/ && pm2 restart travel-app"
}
```

Run `Deploy-Travel` from any PowerShell prompt.

> **`rm -rf .next` before every build** — stale files in `.next/standalone/public/` from
> a previous deploy can break the next build. If a build fails with
> `EACCES: permission denied`, root-owned leftovers from earlier sudo-run deploys are the
> cause — fix once with `sudo rm -rf ~/travel-app/.next`.

---

## Migrating data from local development

```powershell
# Copy all three SQLite files — the WAL holds uncommitted transactions
scp C:\Users\chris\OneDrive\Apps\travel-app\local.db chris@91.99.230.234:~/travel-app/local.db
scp C:\Users\chris\OneDrive\Apps\travel-app\local.db-wal chris@91.99.230.234:~/travel-app/local.db-wal
scp C:\Users\chris\OneDrive\Apps\travel-app\local.db-shm chris@91.99.230.234:~/travel-app/local.db-shm
```

On the VPS, checkpoint and normalise user IDs:

```bash
sqlite3 ~/travel-app/local.db "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 ~/travel-app/local.db "UPDATE trips SET user_id = 'local';"
export PATH=~/.nvm/versions/node/v24.16.0/bin:$PATH && pm2 restart travel-app
```

> The app runs in single-user mode — all data is stored under `user_id = 'local'`.
> Local dev data may have a different user_id depending on how auth was configured;
> the UPDATE above normalises it.

---

## Rollback

```bash
# On the VPS:
cd ~/travel-app
git log --oneline -10          # Find the last good commit hash
git checkout <commit-hash>
export PATH=~/.nvm/versions/node/v24.16.0/bin:$PATH
rm -rf .next && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public/. .next/standalone/public/
pm2 restart travel-app

# To return to normal tracking:
git checkout main
```

---

## Backups

The actual crontab (verify with `crontab -l`) keeps dated local copies with 30-day
retention, mirroring the finance-app scheme:

```bash
10 2 * * * mkdir -p ~/travel-app/backups && cp ~/travel-app/local.db ~/travel-app/backups/local-$(date +\%Y-\%m-\%d).db
10 3 * * * rclone sync ~/travel-app/backups/ onedrive:travel-backups >> ~/backup.log 2>&1
10 4 * * * find ~/travel-app/backups -name "local-*.db" -mtime +30 -delete
```

> Cover images now live inside `local.db` as blobs (`trip_cover_images` table), so the DB
> backup covers them automatically. A legacy 2:15 AM `trip-photos` sync line remains in
> the crontab — harmless, removable once confirmed empty.

Enable Hetzner automatic snapshots as a full-disk fallback:
Hetzner Console → Server → **Backups** → Enable.

---

## Release note — one-time cover image import (this release only)

This release moves cover images from `public/trip-photos/` on disk into the
`trip_cover_images` table in SQLite. If the VPS has existing uploaded cover photos,
import them once after this release is deployed:

```bash
ssh chris@91.99.230.234
cd ~/travel-app
node scripts/import-cover-images.mjs   # add DB_PATH=... if production uses a custom path (check pm2 env / ecosystem file)
pm2 restart travel-app                  # not strictly required, but clears any negative 404 cache
```

Check first how production sets `DB_PATH` (see `pm2 env travel-app`) and pass the same
value. Run this only once, after migration `003_cover_images` has applied (it applies
automatically at boot).

---

## Useful commands

```bash
pm2 status                     # Check app status
pm2 logs travel-app            # Stream logs
pm2 logs travel-app --lines 50 # Last 50 log lines
pm2 restart travel-app         # Restart app

nginx -t                       # Test nginx config
systemctl reload nginx         # Apply nginx changes

df -h                          # Check disk space
sqlite3 ~/travel-app/local.db ".tables"  # Verify DB is intact
sqlite3 ~/travel-app/local.db "SELECT count(*) FROM trips;"
```

---

## Architecture notes

### DB location

SQLite DB lives at `~/travel-app/local.db` (set via `DB_PATH` in `.env.local`).
This is outside `.next/` and survives builds. Do not change this path without
updating `.env.local`.

### Why `process.chdir` matters

`server.js` calls `process.chdir(__dirname)` at startup, changing the working
directory to `.next/standalone/`. Any path resolved with `process.cwd()` points
there — including the DB path if `DB_PATH` is not set. Always set `DB_PATH`.

### Static assets

After every build, two manual copy steps are needed:

```bash
cp -r .next/static .next/standalone/.next/static  # JS/CSS chunks
cp -r public/. .next/standalone/public/            # Public assets
```

Next.js does not do this automatically. The `Deploy-Travel` alias includes both steps.

### Single-user mode

The app stores all data under `user_id = 'local'`. `src/lib/auth.ts` always returns
`'local'` — no login or session management is needed. Access control is handled
entirely by Cloudflare Zero Trust at the network layer.

`getServerUserId()` still calls `await headers()` even though it ignores the value —
this is intentional. Calling a Next.js dynamic function opts all pages that use it
out of static pre-rendering, ensuring the DB is queried fresh on every request.

### Photo storage

Cover photos are stored as JPEG blobs in the `trip_cover_images` table and served from
`GET /api/trips/{tripId}/cover-image`. Deploys cannot affect them, and they're covered
by the existing `local.db` backup — no separate directory to migrate.

### Authentication in dev vs production

In development (`npm run dev`), no Cloudflare header is present and auth returns
`'local'` via the fallback. In production, the same `'local'` value is returned
unconditionally. There is no behavioural difference — this is intentional for a
single-user app.

### basePath (`/travel`)

`next.config.ts` sets `basePath: '/travel'` and also exposes it as
`NEXT_PUBLIC_BASE_PATH` (via `env:`) so client code can prefix things Next doesn't
auto-prefix. Next only auto-prefixes `next/link`, `next/navigation`'s router, and
`next/image` (this app doesn't use `next/image`) — raw `fetch()` calls, hand-written
`<a>`/`<img>` hrefs, and public-folder asset references all need manual prefixing via
`apiUrl()` in `src/lib/api.ts`. `src/proxy.ts`'s matcher config does **not** need the
`/travel` prefix — it's matched against the basePath-stripped path automatically
(confirmed empirically; the bundled Next 16 docs don't state this explicitly for
Proxy specifically, only for `rewrites`/`redirects`). This applies even to
same-VPS localhost calls: `homepage` and `mcp-server` both call this app directly
over `http://localhost:3001`, and both now include `/travel` in that base URL,
because Next's own router — not just nginx — requires the prefix.
