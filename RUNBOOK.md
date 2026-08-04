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
ADMIN_EMAILS=chris.s.dyer@gmail.com
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

The app is served from the apex (`zo-bot.com/travel`), so it is gated by the **dedicated
`zo-bot.com` apex Access application**, not by the `*.zo-bot.com` wildcard — a wildcard
does not match the apex in Access. See the Auth gate row in root `README.md`. No separate
"Travel App" application is needed. The `travel` DNS A record (Proxied) can stay; it only
carries the redirect-only vhost now.

> Corrected 2026-08-03. This section previously said the app was covered by "the existing
> wildcard `*.zo-bot.com` Access policy set up for the apex". That described a setup that
> does not exist, and it matters here: the calendar-feed bypass below has to sit in front
> of whichever application actually intercepts, and getting that wrong either fails to
> work or opens more than intended.

To confirm which application intercepts, from a machine or private window with **no Access
session**:

```bash
curl -sSI https://zo-bot.com/travel/settings
```

The `location:` header names the `*.cloudflareaccess.com` host and application id doing
the intercepting.

### 12a. Cloudflare Access bypass — the calendar feed

The subscribe-able ICS feed at `/travel/api/calendar/feed/<token>.ics` must be reachable
with no Access session at all. Google's calendar fetcher sends no cookies, no Access JWT
and no header we control; without a bypass it receives a 302 to
`<team>.cloudflareaccess.com` and reports only "Could not fetch the URL". The random token
in the path is the entire credential.

Create a second Access application that wins for that one prefix:

1. `one.dash.cloudflare.com` → account → **Access** → **Applications** → **Add an
   application** → **Self-hosted**.
2. **Name:** `Travel calendar feed (public)`. Session duration is irrelevant for a Bypass app.
3. **Public hostname:** subdomain **empty** (this is the apex), domain `zo-bot.com`, path
   `travel/api/calendar/feed`. Cloudflare's Path field takes **no leading slash** and matches
   that segment plus everything below it. If the UI's match preview does not show sub-paths
   matching, use `travel/api/calendar/feed/*`.
4. Skip identity providers, App Launcher and appearance — none apply to a Bypass app.
5. **Policies** → **Add a policy**: name `Public bypass`, **Action: Bypass**, Include:
   **Everyone**. A Bypass policy cannot be combined with Allow/Block rules in the same
   application; this app has exactly one policy.
6. Save.

Access resolves the **most specific** hostname + path match first, so this application wins
for that prefix and the apex application keeps gating everything else.

**Verify from an un-authenticated machine — never from your own browser:**

```bash
curl -sSI https://zo-bot.com/travel/api/calendar/feed/<token>.ics
#   expect: HTTP/2 200, content-type: text/calendar; charset=utf-8
#   NOT:    302 to https://<team>.cloudflareaccess.com/...

curl -sSI https://zo-bot.com/travel/settings
#   expect: still 302 to Access   <-- proves the bypass is scoped, not blanket

curl -sSI https://zo-bot.com/travel/api/calendar/feed/deadbeefdeadbeefdeadbeefdeadbeef
#   expect: HTTP/2 404
```

The middle one matters as much as the first. If `/travel/settings` stops requiring Access,
the path pattern is too broad — fix it immediately.

**nginx needs no change.** `location /travel { proxy_pass http://localhost:3001; }` in
`/etc/nginx/sites-available/homepage` is a prefix match that already covers
`/travel/api/calendar/feed/...`. Confirm once that no regex `location ~` (which outranks
prefix matches) would intercept it:

```bash
ssh chris@91.99.230.234 'grep -n "location" /etc/nginx/sites-available/homepage'
```

**If curl works but Google still says "Could not fetch the URL":** Google's importer
identifies as the bare string `Google-Calendar-Importer` — **not**
`Mozilla/5.0 (compatible; Google-Calendar-Importer)`, which is what this runbook claimed
until 2026-08-04 and what a plausible-looking guess produces. Observed on the wire that day
(see §12c). Match on a `contains` of `Google-Calendar-Importer` rather than an exact string,
so either form is caught. It is **not** on
Cloudflare's verified-bot list, so Bot Fight Mode / Super Bot Fight Mode or Browser
Integrity Check will challenge it. Add a WAF custom rule — expression
`http.request.uri.path starts_with "/travel/api/calendar/feed/"`, action **Skip**
(remaining custom rules, rate limiting, Super Bot Fight Mode, Browser Integrity Check).

If you see staleness rather than failure, add a Cloudflare **Cache Rule** → *Bypass cache*
on the same prefix. Cloudflare's default cached-extension list does not include `.ics`, so
this is belt-and-braces, but a stale copy would persist for up to a day and be
indistinguishable from Google being slow.

> **The token is written to the nginx access log.** It travels in the URL path, and the
> default `combined` log format records the full path for every request — so each Google
> poll appends the live credential to a file that rotates into archives and may reach
> backups. The Node server itself does not log request paths in production. If that
> retention is unwanted, either exclude this location from `access_log` or give it a log
> format that omits the path.

### 12b. Calendar timezones — backfill after deploying migration 011

The feed publishes absolute UTC instants, so every timed item needs its location's IANA zone.
Trips and legs get one from the geocoder, cached in `resolved_timezone`. That cache is filled
lazily by `/api/map` and the weather route, so existing rows have none until something touches
them — and a trip with no zone publishes its timed items as **all-day**.

Run the backfill **after migrating and before the timezone-aware build goes live**, or both
subscribers will watch events flip to all-day and back hours later:

```bash
ssh chris@91.99.230.234 'cd ~/travel-app && DB_PATH=/home/chris/travel-app/local.db   ~/.nvm/versions/node/v24.16.0/bin/node tools/backfill-timezones.mjs'
```

Idempotent and re-runnable; only touches rows whose `resolved_timezone` is NULL and never bumps
`updated_at`. `--dry-run` reports without writing. Confirm afterwards:

```bash
ssh chris@91.99.230.234 'sqlite3 ~/travel-app/local.db   "SELECT COUNT(*) FROM trips WHERE COALESCE(timezone, resolved_timezone) IS NULL"'   # want 0
```

> **An ambiguous destination geocodes to the wrong place.** "Washington" resolves to Washington
> DC (`America/New_York`), not Seattle — so a Seattle trip's hotel check-in would be stamped three
> hours out. The geocoder is confidently wrong here, not silent, so nothing flags it. The fix is
> the per-trip **Timezone** override on the trip edit form, which survives destination edits.
> Flights are unaffected: they resolve from their IATA airport codes, which are unambiguous.

### 12c. A subscriber's calendar shows stale times after a rendering-only fix

**Symptom (observed 2026-08-04).** The Phase 5 fix that publishes absolute UTC instants was
live and correct — the feed served `DTSTART:20260809T201000Z` for a 13:10 Seattle event — yet a
subscriber's Google Calendar still showed the pre-fix time (`13:10` read as UTC, so 8:10am CT
instead of 3:10pm CT). Re-subscribing fixed it. Waiting did not, over ~18 hours.

**Diagnosis order.** Work outside-in; each step is cheap and rules out a whole class:

1. **Is the feed itself right?** Fetch the public URL and decode the instant, don't eyeball it:
   ```bash
   curl -s "https://zo-bot.com/travel/api/calendar/feed/<token>.ics"      | grep -B4 '<event title>'
   ```
   A correct body here means the bug is on Google's side, not in `items.ts` / `ics.ts`.
2. **Does the subscriber's URL still resolve?** Compare the URL in Google Calendar →
   *Settings → the calendar → Integrate calendar* against the live token. **Rotation is the only
   revocation and it is silent**: the old URL 404s, and Google does not delete a calendar that
   stops resolving, so it freezes at its last successful fetch forever. Check
   `token_rotated_at` — if it is newer than the subscription, this is the cause.
3. **Is Google actually polling?** See `last_fetched_at` / `last_fetched_user_agent`. **Do not
   send a spoofed `Google-Calendar-Importer` user agent while testing** — the column is
   single-valued and one such request destroys the only evidence of who last fetched. Use a
   default curl UA, which is unmistakably yours.
4. **If Google is polling and the body is right, the events still may not update.** See below.

> **The open one: a rendering-only change carries no version signal.**
> `DTSTAMP`/`LAST-MODIFIED` come from each row's `updated_at` (deliberately — it is what makes
> two unchanged fetches byte-identical), and the feed emits **no `SEQUENCE` property at all**.
> A fix that changes how a row renders without touching the row therefore reaches Google as a
> VEVENT whose only difference is `DTSTART`, with every change-detection field identical to the
> cached copy. Whether Google's importer diffs the whole body or short-circuits on
> UID + `LAST-MODIFIED`/`SEQUENCE` is undocumented, and `CLAUDE.md`'s claim that "the feed body
> *is* the state; Google replaces the whole calendar on each poll" is a design assertion that
> has **not** been verified against this case. Until it is, assume a rendering-only fix does not
> reach existing subscribers, and tell them to delete and re-add.
>
> If this recurs, the fix shape is a global feed-format revision added to a per-row counter,
> emitted as `SEQUENCE` — that forces a client re-read on format changes without touching any
> row's `updated_at` and losing byte-stability.

**Re-subscribing is the reliable remedy** and covers every cause above: a fresh calendar imports
every event from scratch. It costs each subscriber two minutes, and everyone must do it.

> **TEMPORARY — added 2026-08-04, remove when the interval is known.** A probe samples
> `last_fetched_at` every 15 minutes into `~/travel-app/calendar-fetch-probe.log`, because that
> column is single-valued: a one-off check shows the most recent fetch, never the count, and the
> count is what distinguishes the two causes above. Read it deduped:
>
> ```bash
> ssh chris@91.99.230.234 'sort -u -t"|" -k2,3 ~/travel-app/calendar-fetch-probe.log | tail -40'
> ```
>
> Two genuine Google fetches were observed 65 minutes apart on the day it was installed
> (`14:29:10Z`, `15:34:16Z`), which points at cause 2 — but a new subscription may be polled
> harder at first, so weight the later gaps. To remove: drop the `*/15` line from `crontab -e`
> and delete `~/travel-app/tools/calendar-fetch-probe.sh` and the log.

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
- Settings → Calendar feed card shows a URL and an "N of M items included" count
- `curl -sSI https://zo-bot.com/travel/api/calendar/feed/<token>.ics` from an
  un-authenticated machine → `200`, `text/calendar`; the same curl against
  `/travel/settings` still → `302` to Access

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
10 2 * * * mkdir -p ~/travel-app/backups && sqlite3 /home/chris/travel-app/local.db ".backup '/home/chris/travel-app/backups/local-$(date +\%Y-\%m-\%d).db'" >> ~/backup.log 2>&1
10 3 * * * rclone sync ~/travel-app/backups/ onedrive:travel-backups >> ~/backup.log 2>&1
10 4 * * * find ~/travel-app/backups -name "local-*.db" -mtime +30 -delete
```

**Never change that first line back to `cp`.** See the history note below.

> Cover images now live inside `local.db` as blobs (`trip_cover_images` table), so the DB
> backup covers them automatically. A legacy 2:15 AM `trip-photos` sync line remains in
> the crontab — harmless, removable once confirmed empty.

> ### History — the `cp` backup bug (found and fixed 2026-08-01)
>
> Until 2026-08-01 the 2:10 AM line used `cp ~/travel-app/local.db …`. **That is not a valid
> backup of a WAL-mode database.** Committed transactions sit in `local.db-wal` until a
> checkpoint folds them into `local.db`, so `cp` captures only whatever was last
> checkpointed; it can also catch a torn page mid-write.
>
> It was losing real data, not theoretically. Measured that morning:
>
> | | trips | events | hotels | latest migration | size |
> |---|---|---|---|---|---|
> | `local-2026-08-01.db` (that night's backup) | 5 | 9 | 5 | `001_initial_schema` | 106 KB |
> | live `local.db` | 7 | 51 | 10 | `008_trip_geocode` | 590 KB |
>
> Four consecutive nightly backups were byte-identical at 106 KB, and rclone had been
> mirroring that incomplete file to OneDrive as the disaster-recovery copy. A restore would
> have lost 42 events, 2 trips, 5 hotels and seven migrations of schema.
>
> Verified after the fix: the cron line was run in a cron-like environment
> (`env -i PATH=/usr/bin:/bin /bin/sh -c …`) and produced a 606 KB file with 7 trips,
> 51 events, migration `008_trip_geocode`, and `PRAGMA integrity_check` = `ok`. A complete
> copy was synced to OneDrive the same day.
>
> **`sqlite3` (3.46.1) is installed at `/usr/bin/sqlite3`** — on cron's minimal PATH, so no
> PATH export is needed on that line.

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
