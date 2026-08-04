# Phase 4 — Deploy, Cloudflare Access, docs

**Read `00-overview.md` first**, then `PROGRESS.md` for what Phases 1-3 delivered.

Phase 4 deploys to the VPS, runs the two migrations against live data, creates the Cloudflare
Access bypass that lets Google reach the feed at all, subscribes both Google accounts, and
updates the operational docs.

**This phase performs a real production deploy and runs migrations against live data. Confirm
with Chris before running `Deploy-Travel`.** It also changes a Cloudflare Access configuration
that gates the whole apex domain — the one step here that can lock people out if done wrong.

---

## 1. Back up production first

Not the nightly cron backup — that may be 24 hours old. Take a fresh one.

**Never `cp` this database.** SQLite runs in WAL mode; recent commits live in `local.db-wal`
until a checkpoint and a plain `cp` silently omits them (measured 2026-08-01: three weeks of data
missing from such a copy). Use:

```bash
ssh chris@91.99.230.234 'sqlite3 ~/travel-app/local.db ".backup '\''~/travel-app/local.db.pre-calendar-feed'\''"'
```

Get the real `DB_PATH` from `RUNBOOK.md` rather than assuming — the standalone build's
`process.chdir` makes `DB_PATH` mandatory and it is not the repo-root `local.db`.

## 2. Deploy

Commit, push, then `Deploy-Travel` from PowerShell. Afterwards confirm on the VPS:

```bash
ssh chris@91.99.230.234 'pm2 status; sqlite3 ~/travel-app/local.db "SELECT name FROM schema_migrations ORDER BY name" | tail -3'
```

`009_calendar_feed` and `010_hide_from_calendar` must both be listed exactly once, and
`travel-app` must be `online`.

**nginx needs no change.** `location /travel { proxy_pass http://localhost:3001; }` in
`/etc/nginx/sites-available/homepage` is a prefix match that already covers
`/travel/api/calendar/feed/...`. Confirm once, rather than assume, that no regex `location ~`
(which outranks prefix matches) would intercept it:

```bash
ssh chris@91.99.230.234 'grep -n "location" /etc/nginx/sites-available/homepage'
```

---

## 3. Cloudflare Access bypass — the step nothing works without

Google's calendar fetcher sends no cookies, no Access JWT, and no header we control. Without a
bypass it receives a 302 to `<team>.cloudflareaccess.com` and reports only "Could not fetch the
URL".

### First: find out which application actually gates the app

The docs disagree. Root `README.md:65` says there is a wildcard `*.zo-bot.com` application
**plus a dedicated `zo-bot.com` apex application**; `RUNBOOK.md:229-230` claims the app is
covered by "the existing wildcard `*.zo-bot.com` Access policy set up for the apex". A wildcard
does not match the apex in Access, so the README is right and the RUNBOOK wording is wrong —
**fix it as part of this phase**.

Confirm empirically before touching anything, from a machine or private window with **no Access
session**:

```bash
curl -sSI https://zo-bot.com/travel/settings
```

The `location:` header names the `*.cloudflareaccess.com` host and application id doing the
intercepting. That is the application your new bypass must sit in front of.

### Then: create the bypass application

1. `one.dash.cloudflare.com` → your account → **Access** → **Applications** → **Add an
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

Access resolves the **most specific** hostname + path match first, so this application wins for
that one prefix and the apex application continues to gate everything else.

### Verify from an un-authenticated machine — never from your own browser

```bash
curl -sSI https://zo-bot.com/travel/api/calendar/feed/<token>.ics
#   expect: HTTP/2 200, content-type: text/calendar; charset=utf-8
#   NOT:    302 to https://<team>.cloudflareaccess.com/...

curl -sSI https://zo-bot.com/travel/settings
#   expect: still 302 to Access   <-- proves the bypass is scoped, not blanket

curl -sSI https://zo-bot.com/travel/api/calendar/feed/deadbeefdeadbeefdeadbeefdeadbeef
#   expect: HTTP/2 404
```

The middle one matters as much as the first. If `/travel/settings` stops requiring Access, the
path pattern is too broad — fix it immediately.

### If curl works but Google still says "Could not fetch the URL"

Google's importer identifies as `Mozilla/5.0 (compatible; Google-Calendar-Importer)` and is
**not** on Cloudflare's verified-bot list. If Bot Fight Mode / Super Bot Fight Mode or Browser
Integrity Check is enabled for `zo-bot.com`, it will be challenged. Add a WAF custom rule:

- Expression: `http.request.uri.path starts_with "/travel/api/calendar/feed/"`
- Action: **Skip** — remaining custom rules, rate limiting, Super Bot Fight Mode, Browser
  Integrity Check.

If you see staleness rather than failure, add a Cloudflare **Cache Rule** → *Bypass cache* on the
same path prefix. Cloudflare's default cached-extension list does not include `.ics`, so this is
belt-and-braces, but a stale copy would persist for up to a day and be indistinguishable from
Google being slow.

---

## 4. Subscribe both accounts

1. Copy the URL from `https://zo-bot.com/travel/settings`.
2. In Google Calendar → **Other calendars** → **From URL** → paste → Add.
3. Repeat from the second Google account.
4. Both calendars show the trips. The first fetch is usually immediate.
5. After a few hours:
   `ssh chris@91.99.230.234 'sqlite3 ~/travel-app/local.db "SELECT last_fetched_at, last_fetched_user_agent FROM calendar_feeds"'`
   shows `Google-Calendar-Importer`. That is the proof Google is really polling, as opposed to
   having cached the one manual fetch.

Then run the **acceptance test in `00-overview.md`** end to end. Its step 7 — an unchecked filter
actually removing events from both calendars — cannot be verified inside Google's poll window, so
record it as pending in the phase report and confirm the next day rather than declaring victory
early.

---

## 5. Documentation

Required by the operational-docs contract in the root `CLAUDE.md`. All in this session.

**`travel-app/RUNBOOK.md`**
- New section after §12 (Cloudflare Zero Trust): the bypass application and its exact path
  pattern, the three verification curls, the WAF-skip note, and "nginx needs no change —
  `location /travel` already covers it".
- **Fix §12's wording**: the app is gated by the dedicated `zo-bot.com` **apex** application, not
  by the `*.zo-bot.com` wildcard. Do not leave a doc describing a setup that does not exist.
- Add a feed check to §14 Verify.

**`travel-app/CLAUDE.md`** — a new "## Calendar feed" section, matching the voice of the "Trip
brief" and "Trip legs" sections, which explain *why* each constraint exists (that is what stops a
later agent removing it):
- One shared feed, multiple subscribers, one view. `calendar_feeds` is row-per-feed but the UI
  offers one.
- The token in the path is the whole credential; `/api/calendar/feed/` is allowlisted in
  `src/proxy.ts` and bypassed at Cloudflare. Rotation is the only revocation and it breaks
  **every** subscription.
- `hide_from_calendar` is **global**, on seven tables, not per-feed. The trip-level column
  cascades.
- `src/lib/calendar/filters.ts` owns the only predicate and the only filter validator
  (`parseFeedFilters`). Do not re-test these columns inline.
- `ics.ts` / `filters.ts` / `token.ts` must stay free of runtime imports so `node --test` can
  load them.
- Narrowing a filter **deletes** events from every subscribed calendar — the body is the state.
- Hikes carry `bookingStatus: null` into the feed on purpose.
- Extend the existing "Downstream MCP write registry" note to mention `hideFromCalendar`.

**`mcp-server/travel-write.js`** — if Phase 1 did not already do it, add `'hideFromCalendar'` to
`TRIP_FIELDS.fields` and to the `fields` of `event`, `flight`, `hotel`, `rental_car`, `parking`,
`transit`. Separate git repo; Zod v3 there, not v4. Do not expose `calendar_feeds`.

**Root `README.md`** — the Auth gate row and the new-app checklist Access-exceptions bullet
(line 167) both currently list `mcp.zo-bot.com` as the only exception. Add
`zo-bot.com/travel/api/calendar/feed/*` (token-authenticated ICS feed).

**`travel-app/TESTING.md`** — a new "## Calendar Feed" checklist in the file's existing
unchecked-box voice. Include: good/bad/rotated token; `.ics` suffix optional; non-GET methods
405; feed served with no Access header while `/travel/settings` still 403s; read-only user sees
no URL in view-source; unchecking a category removes those events from a subscribed calendar
within 24h; UIDs identical across two fetches; body byte-identical across two fetches with no
edits; hidden items absent from both the feed and the per-trip download; floating times render
at the same wall-clock in a calendar set to a different timezone.

**`docs/calendar-sync/PROGRESS.md`** — status blockquote to superseded, dated, naming
`docs/calendar-feed/` as the replacement. Do not delete the folder.

**`projects.config.json`** (apps root) — `travel-calendar-sync` → `"archived": true`; add
`travel-calendar-feed` if not already present.

**`travel-app/DEPLOY.md`** (gitignored) — add the Access bypass to the first-time setup checklist
if you keep it current.

Then, from `C:\Users\chris\OneDrive\Apps\zo-bot.com`:

```
node tools/ops-check.mjs
node tools/project-status.mjs
```

`ops-check.mjs` checks the README apps table against the folders on disk, port uniqueness,
`Deploy-*` functions in `$PROFILE`, and per-app doc conventions. None of those move in this
program, so expect it to pass unchanged — **do not edit the tool**. It **cannot see the
Cloudflare Access change**; say so in the phase report so a green run is not mistaken for
verification of the bypass.

---

## Verification

1. `pm2 status` shows `travel-app` online; both migrations applied exactly once in production.
2. The three curls in §3 give 200 / 302 / 404 from an un-authenticated machine.
3. `https://zo-bot.com/travel/settings` still requires Access sign-in in a fresh private window.
4. Both Google accounts subscribe successfully and show the trips.
5. `last_fetched_user_agent` shows `Google-Calendar-Importer` (may take hours).
6. Read-only enforcement survives production: signed in as the non-admin address, the Settings
   page shows the card but no URL in view-source.
7. The per-trip `.ics` download links on the Settings page still work in production.
8. `node tools/ops-check.mjs` and `node tools/project-status.mjs` both exit 0.
9. All doc updates made, including the RUNBOOK §12 correction.
10. Any scratch feeds/trips created for testing are removed.

**Done when:** all 10 pass, with acceptance-test step 7 either confirmed or explicitly recorded
as pending Google's next poll.

Append a Phase 4 report to `PROGRESS.md` and set the top Status blockquote to reflect a completed
program.
