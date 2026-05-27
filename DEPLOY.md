# Deploying to travel.zo-bot.com

One-time checklist for deploying alongside `finance-app` on the existing Hetzner VPS.

---

## Before you start

Have these ready:

- [ ] Anthropic API key (`sk-ant-...`)
- [ ] Google Maps API key (can reuse dev key — add `travel.zo-bot.com` to allowed HTTP referrers if it's restricted)
- [ ] Gmail OAuth Client ID + Secret (can reuse dev credentials — you'll add a new redirect URI below)
- [ ] SSH access to VPS confirmed: `ssh your-user@YOUR_VPS_IP`
- [ ] `travel.zo-bot.com` DNS not yet configured (or pointing nowhere)

---

## Step 1 — Clone, build, and start

SSH into the VPS, then:

```bash
# Clone
git clone <repo-url> ~/travel-app
cd ~/travel-app

# Build — must use nvm's node, not system node
export PATH=~/.nvm/versions/node/v24.16.0/bin:$PATH
npm install
npm run build

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
```

> **PORT=3001** — finance-app occupies 3000, so travel-app must use 3001.

Start with PM2:

```bash
cd ~/travel-app
pm2 start .next/standalone/server.js --name travel-app
pm2 save
```

Confirm it's running:

```bash
pm2 status
# travel-app should show: online
```

---

## Step 2 — Cloudflare Origin Certificate

Do this **before** the nginx step — nginx references the certificate files.

1. [Cloudflare dashboard](https://dash.cloudflare.com) → zo-bot.com → **SSL/TLS** → **Origin Server** → **Create Certificate**
2. Hostname: `travel.zo-bot.com`, validity: 15 years, key type: RSA
3. Click Create. Copy the two values:

```bash
# On the VPS, paste the certificate text:
sudo nano /etc/ssl/cloudflare-travel.pem

# Paste the private key text:
sudo nano /etc/ssl/cloudflare-travel.key
```

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

    ssl_certificate     /etc/ssl/cloudflare-travel.pem;
    ssl_certificate_key /etc/ssl/cloudflare-travel.key;

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
ln -s /etc/nginx/sites-available/travel /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## Step 4 — Cloudflare DNS

1. Cloudflare dashboard → zo-bot.com → **DNS** → **Add record**
2. Type: **A**, Name: `travel`, IPv4: `YOUR_VPS_IP`, Proxy status: **Proxied** (orange cloud)

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

## Step 7 — Add deploy alias

Add to your PowerShell `$PROFILE` on your local machine:

```powershell
function Deploy-Travel {
    $vps = "your-user@YOUR_VPS_IP"
    ssh $vps "export PATH=~/.nvm/versions/node/v24.16.0/bin:`$PATH && cd ~/travel-app && git pull && npm install && npm run build && pm2 restart travel-app"
}
```

Future deploys: just run `Deploy-Travel`.

> If this ever fails with a native module error, run `nvm which node` on the server to confirm the path is still `v24.16.0`.

---

## Step 8 — Backups

On the VPS, add to crontab (`crontab -e`):

```bash
# SQLite DB — daily at 2:00 AM
0 2 * * * rclone copy ~/travel-app/local.db onedrive:/travel-app-backups/ --log-file=/var/log/rclone-travel.log

# Cover photos — daily at 2:05 AM
5 2 * * * rclone sync ~/travel-app/public/trip-photos/ onedrive:/travel-app-photos/ --log-file=/var/log/rclone-travel.log
```

---

## Step 9 — Verify

- [ ] `https://travel.zo-bot.com` → Cloudflare Access login prompt appears
- [ ] Sign in with `chrissdyer@gmail.com` → trips list loads
- [ ] Create a trip, add a cover photo → photo appears and persists on reload
- [ ] Open a trip → day timeline, key bookings sidebar all render
- [ ] Open Trip Assistant → AI responds to a brainstorm prompt
- [ ] Open Trip Assistant → Extract from Email → Gmail connect flow appears
- [ ] Open the print page for a trip with flights/hotels → all bookings appear in the timeline
- [ ] `pm2 status` → both `finance-app` and `travel-app` show `online`
