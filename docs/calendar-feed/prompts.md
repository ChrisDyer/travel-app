# Agent prompts — Calendar Feed

Copy-paste prompts for the implementation agents, one per phase.

**Run them in order, in separate sessions.** Each phase assumes the previous phase's code exists.
Do not run two in parallel.

Phases 1–3 are travel-app only, except for one `mcp-server` edit in Phase 1. Phase 4 touches the
VPS, Cloudflare, and the apps-root docs. travel-app and mcp-server are **separate git repos**,
not a monorepo.

---

## Before you start

- **Back up the local database before every phase.** Each one runs against Chris's real
  `travel-app/local.db`. **Never `cp` it** — SQLite is in WAL mode and a plain copy silently
  omits everything still in `local.db-wal`. Use:
  `sqlite3 local.db ".backup 'local.db.bak'"`
- **Ports.** Local travel-app dev is **3000**; `3001` is the VPS port. The base path is
  `/travel`, required even on localhost — `http://localhost:3000/travel/api/...`.
- The default shell here is **PowerShell**. Bash-style `VAR=x npm start` is a parse error; use
  `$env:VAR='x'; npm start`.
- There is no `npm test` script. Verification is `node --test` for the pure modules,
  `npm run build`, `npm run lint`, curl, and the browser. **`npm run lint` has 11 pre-existing
  warnings — that is the clean baseline, not a regression.**
- **Phases 1–3 stay on this machine.** Phase 4 is the first that touches the VPS, runs migrations
  against live data, and changes a Cloudflare Access configuration that gates the whole apex
  domain. Do that one when Chris can watch it.
- Use a trip that has a **round-trip flight, a hotel, a hike, and at least one unbooked
  restaurant**. Several verification steps depend on all four existing. Create a scratch trip if
  needed, and remove it afterwards.

---

## Phase 1 — Schema and shared normalizer

```
Implement Phase 1 of the Calendar Feed program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/calendar-feed/00-overview.md              (problem, decisions, data contract, conventions)
  docs/calendar-feed/01-schema-and-normalizer.md (your spec)

Phase 1 adds migrations 009 and 010, the four src/lib/calendar/ modules with real unit tests,
and refactors the existing per-trip .ics export route to consume them. No feed route, no UI, no
proxy change — those are Phases 2 and 3. The app must look identical in a browser when you are
done.

Hard constraints:
- TWO migrations, not one. runCustomMigration() returning true SKIPS migration.sql entirely
  (src/db/migrations.ts:323), and every existing custom branch is ALTER-only. 009 is CREATE-only
  with NO custom branch (the 003/007 idiom); 010 is ALTERs WITH a custom branch (the 004/005/008
  idiom). Combining them would force the branch to re-emit the CREATE TABLE and duplicate the
  DDL. Check the array for anything newer than 008 before picking numbers.
- ics.ts, filters.ts and token.ts must have ZERO runtime imports except node builtins. `node
  --test` resolves neither @/ aliases nor extensionless relative imports, and
  allowImportingTsExtensions is not in tsconfig.json. `import type` is fine — it is erased. This
  is why you must COPY nextDay's three-line body from src/lib/dates.ts rather than import it.
- DTSTAMP must come from each item's own updated_at, NOT from a shared "now". A polled feed that
  returns a byte-different body on every fetch makes ETag/304 impossible, makes "did my edit
  land?" undiagnosable, and makes Apple/Outlook rewrite every event on every poll. Emit
  LAST-MODIFIED with the same value. Do NOT emit SEQUENCE — see the overview for why a
  timestamp-derived one is worse than omitting it.
- Hikes must emit bookingStatus: null. The DB column is NOT NULL DEFAULT 'unbooked', but the app
  never shows a status for a hike. Without this, a feed set to "only confirmed" silently drops
  every hike. This is the single most important line in the normalizer and it has a dedicated
  unit test.
- The six existing UID prefixes (event-, flight-, hotel-, car-, parking-, transit-) must not
  change. Anyone who already imported the .ics keeps matching UIDs instead of a duplicate set.
- hide_from_calendar goes on SEVEN tables — the six item tables plus `trips`. The trip-level one
  cascades to everything beneath it.
- Preserve an empty array in parseFeedFilters. `{"eventCategories":[]}` means "no day events" and
  is a legitimate choice; substituting the default there would make it impossible to turn a class
  off entirely.
- buildCalendar with zero VEVENTs must emit one placeholder VEVENT, not an empty calendar. Google
  has been observed to reject an empty body as "Could not fetch the URL".
- Do NOT emit X-WR-TIMEZONE. Times are floating and must stay floating; declaring a zone shifts
  every timed event on a trip abroad. Comment the omission so it is not "fixed" later.
- Update mcp-server/travel-write.js in the same session — a new writable column that is not
  registered there makes Claude's travel write tools reject it as unknown. That is a SEPARATE git
  repo and uses Zod v3, not v4.
- This is not the Next.js in your training data — see AGENTS.md and check
  node_modules/next/dist/docs/ before using an API you half-remember.

Back up the database first: sqlite3 local.db ".backup 'local.db.bak'"
BEFORE changing anything, capture the current export for a trip with a round-trip flight, a
hotel, a hike and an unbooked restaurant:
  curl -s "http://localhost:3000/travel/api/trips/<id>/export" > before.ics

Work the full verification section. Step 8 is the one that matters most — diff after.ics against
before.ics and confirm the ONLY differences are DTSTAMP lines, new LAST-MODIFIED lines, one new
UID:trip-… VEVENT and one UID:flight-return-… VEVENT. Every pre-existing UID must still be
present and unchanged; if one moved or vanished, stop and fix it. Steps 9-11 assert state after
the operation — re-GET rather than trusting a status code.

Done when: node --test passes for all new modules AND the three existing ones still pass (13
tests); every verification step passes; both migrations are idempotent across two restarts; npm
run build and npm run lint are clean; the app is visually unchanged.

Finally, append a Phase 1 report to docs/calendar-feed/PROGRESS.md following the template at the
bottom of that file — naming explicitly the three deliberate behaviour changes to the .ics
download — and update its top Status blockquote. Then run `node tools/project-status.mjs` from
C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 2 — Feed route, proxy, management API

```
Implement Phase 2 of the Calendar Feed program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/calendar-feed/00-overview.md             (decisions, data contract, conventions)
  docs/calendar-feed/02-feed-route-and-access.md (your spec)
  docs/calendar-feed/PROGRESS.md                (what Phase 1 delivered)

Phase 2 adds src/lib/calendar/feeds.ts, the public feed route, the one-line allowlist in
src/proxy.ts, and the three management endpoints. No UI — everything here is verified with curl.

THIS PHASE CHANGES THE AUTH MIDDLEWARE. Treat it accordingly.

Hard constraints:
- The route lives at src/app/api/calendar/feed/[token]/route.ts and exports ONLY GET. Next then
  answers 405 to every other method, and that is precisely what makes the proxy bypass safe —
  verify it (verification step 5) rather than assuming it.
- The proxy change is exactly two things: hoist `const { pathname } = request.nextUrl` out of the
  production block (it currently sits inside it at line 29), and add `&& !isPublic`. Do NOT
  restructure the ADMIN_EMAILS write gate, do not move it, do not "clean it up" — its current
  shape and its comment are deliberate. config.matcher needs no change and no /travel prefix.
- Management routes go at /api/calendar/config, deliberately OUTSIDE the allowlisted prefix, so
  they stay behind Cloudflare Access and behind the read-only gate. If you find yourself putting
  anything writable under /api/calendar/feed/, stop.
- parseFeedFilters IS the validator. Do not add a Zod schema alongside it — two validators for
  one shape will drift. A malformed filters body must yield defaults and a 200, never a 500, and
  the feed must keep serving.
- 404 for every failure: malformed token, unknown token, no such feed — identical bare text/plain
  bodies. Never 403 (that confirms a resource exists), never distinguish the cases.
- No constant-time compare. The unique index makes this a B-tree probe on a 256-bit secret;
  timingSafeEqual would require SELECT * over every feed, removing the index for no gain. The
  isValidTokenShape regex is the useful guard — it keeps junk out of SQL and the logs.
- No Content-Disposition on the feed (attachment makes some clients download instead of
  subscribe). The per-trip export route keeps its own.
- No `export const dynamic`. Route Handlers are already uncached by default in this version and
  the route segment config is being removed under Cache Components. Leave a comment saying why
  it is absent.
- Truncate the stored user agent (~200 chars). It is attacker-controlled text going into the
  database and later onto the Settings page.
- ensureFeed must be safe under concurrent first-page-loads: INSERT ... ON CONFLICT(user_id,
  slug) DO NOTHING, then SELECT.
- This is not the Next.js in your training data — check node_modules/next/dist/docs/ for
  RouteContext and route handler conventions before writing the handler.

Back up first: sqlite3 local.db ".backup 'local.db.bak'"

Verification steps 5, 9 and 10 are the ones that matter — they prove the auth change is scoped
and did not open a hole. Step 9 must be run against a real production build with
ALLOW_NO_ACCESS_HEADER UNSET and no cf-access header, not by reading the code. In PowerShell
that is `$env:NODE_ENV='production'; npm run build; npm start`.

Done when: all 15 verification steps pass; npm run build and npm run lint are clean.

Finally, append a Phase 2 report to docs/calendar-feed/PROGRESS.md stating explicitly what the
proxy change allows and why it cannot be used to write, and update the Status blockquote. Then
run `node tools/project-status.mjs` from C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 3 — Settings UI

```
Implement Phase 3 of the Calendar Feed program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/calendar-feed/00-overview.md   (decisions, conventions)
  docs/calendar-feed/03-settings-ui.md (your spec)
  docs/calendar-feed/PROGRESS.md      (what Phases 1-2 delivered)

Phase 3 adds the "Calendar feed" card to the Settings page, the CalendarFeedActions client
component, and the "Hide from all calendar feeds" checkbox in BookingDetailSheet. After this
phase the feature works end to end locally.

Hard constraints:
- THE SECURITY POINT: the feed URL is a bearer credential and must be gated SERVER-side on
  access.readOnly — pass it only inside the !access.readOnly branch. GmailActions returning null
  when read-only only hides controls; the props are still in the HTML. Verify by grepping raw
  view-source for the token string (verification step 9), not by looking at the rendered page.
- Build the URL from the x-forwarded-proto / host headers nginx sets. Do NOT use
  NEXT_PUBLIC_APP_URL — it is pinned to the legacy travel.zo-bot.com, which 301s cross-hostname
  into a DIFFERENT Cloudflare Access application, adding a redirect hop and a second bypass to
  maintain.
- Save is an explicit button, never save-on-change. Each save is destructive to every subscribed
  calendar and deserves a deliberate gesture.
- Three pieces of copy are required, not optional: the "treat it like a password" warning; the
  "turning something off removes those events from every subscribed calendar" warning next to
  Save; and the note that Google refreshes on its own schedule (often 8-24h), independently per
  subscriber, with no way to force it. Each documents a real behaviour that will otherwise be
  reported as a bug in week one.
- Label the item control "Hide from all calendar feeds", not "Hide from calendar". It is global —
  it hides the item from Chris too. Someone will otherwise read it as "hide this from Kate".
- Rotate uses an INLINE confirm (the repo's pattern), not window.confirm. Its copy must say every
  subscription breaks and everyone must delete and re-add the calendar.
- The repo has no Checkbox primitive. Use the raw markup from TripEditForm.tsx:192-201, but swap
  stone-* for slate-* to match the Settings page palette.
- Every fetch goes through apiUrl() from src/lib/api.ts. A bare /api/... URL breaks in production
  because of NEXT_PUBLIC_BASE_PATH.
- For the read-only convention follow TripAssistant.tsx:226 / AddPlanMenu.tsx:32. Do NOT follow
  DaySection, which leaves inline editors visible for read-only users and lets the write 403 —
  that is a known gap, not a pattern to copy.
- Do not touch src/lib/calendar/filters.ts, the feed route, or src/proxy.ts. If the predicate is
  wrong, fix it in Phase 1's file AND add the failing case to filters.test.mjs — do not work
  around it in the component.

Back up first: sqlite3 local.db ".backup 'local.db.bak'"

Verification step 9 is the one that matters: run it against a real production build with
NODE_ENV=production, ALLOW_NO_ACCESS_HEADER=1, ADMIN_EMAILS set to an address that is not yours,
and a cf-access-authenticated-user-email header for that address. Confirm the token appears
nowhere in view-source. Also confirm you have not regressed the rest of the Settings page —
Gmail connect/disconnect, the Access card, and the per-trip .ics export links.

Done when: all 14 verification steps pass; npm run build and npm run lint are clean; 375px
layout is clean.

Finally, append a Phase 3 report to docs/calendar-feed/PROGRESS.md, noting explicitly that a
read-only user cannot self-serve the feed URL from Settings and that this is intended, and update
the Status blockquote. Then run `node tools/project-status.mjs` from
C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 4 — Deploy, Cloudflare, docs

```
Implement Phase 4 of the Calendar Feed program. This phase spans the travel-app repo, the
mcp-server repo, the apps root, the VPS and the Cloudflare dashboard. Start in
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/calendar-feed/00-overview.md                 (context, decisions, acceptance test)
  docs/calendar-feed/04-deploy-cloudflare-and-docs.md (your spec)
  docs/calendar-feed/PROGRESS.md                    (what Phases 1-3 delivered)

Phase 4 deploys to the VPS, creates the Cloudflare Access bypass, subscribes both Google
accounts, and updates the operational docs.

THIS PHASE RUNS MIGRATIONS AGAINST LIVE DATA AND CHANGES A CLOUDFLARE ACCESS CONFIGURATION THAT
GATES THE WHOLE APEX DOMAIN. Confirm with Chris before running Deploy-Travel, and before saving
anything in the Cloudflare dashboard.

Hard constraints:
- Back up production FIRST, with a fresh backup, not the nightly cron copy which may be 24 hours
  old. NEVER cp the database — WAL mode means a plain copy silently omits recent commits
  (measured 2026-08-01: three weeks of data missing from such a copy). Use sqlite3 .backup. Get
  the real DB_PATH from RUNBOOK.md rather than assuming; the standalone build's process.chdir
  makes it mandatory and it is not the repo-root local.db.
- The docs disagree about which Access application gates this app. Root README.md:65 says there
  is a *.zo-bot.com wildcard app PLUS a dedicated zo-bot.com apex app; RUNBOOK.md:229-230 claims
  the wildcard covers the apex. A wildcard does not match the apex in Access, so the README is
  right. CONFIRM EMPIRICALLY with `curl -sSI https://zo-bot.com/travel/settings` from a machine
  with no Access session and read the location: header, THEN create the bypass against the app
  that actually intercepts. Fix the RUNBOOK wording as part of this phase — never leave a doc
  describing a setup that does not exist.
- The Cloudflare path field takes NO leading slash: `travel/api/calendar/feed`. One policy,
  Action: Bypass, Include: Everyone. A Bypass policy cannot be combined with Allow/Block rules in
  the same application.
- Verify from a machine or private window with NO Access session, never from your own browser.
  The SECOND curl matters as much as the first: `https://zo-bot.com/travel/settings` must STILL
  302 to Access. If it does not, the path pattern is too broad — fix it immediately.
- If curl works but Google says "Could not fetch the URL", the cause is almost certainly Bot
  Fight Mode / Browser Integrity Check — Google's importer is not a Cloudflare verified bot. Add
  a WAF Skip rule on the same path prefix. Do not start debugging the route.
- nginx needs no change, but confirm it rather than assuming: grep the homepage vhost for any
  regex `location ~`, which would outrank the `location /travel` prefix match.
- Acceptance-test step 7 (an unchecked filter actually removing events from both calendars)
  cannot be verified inside Google's poll window. Record it as PENDING in the phase report and
  confirm the next day. Do not declare it passed early.
- ops-check.mjs CANNOT see the Cloudflare Access change. Run it, expect it to pass unchanged, and
  do not edit it — but say in the phase report that a green run is not verification of the
  bypass.

Doc updates are not optional and happen in this session, per the operational-docs contract in the
root CLAUDE.md. Six places: travel-app/RUNBOOK.md (new section + the §12 correction),
travel-app/CLAUDE.md (a new "## Calendar feed" section — match the "Trip brief" and "Trip legs"
sections' voice, which explain WHY each constraint exists, since that is what stops a later agent
removing it), mcp-server/travel-write.js (if Phase 1 did not already do it), the root README.md
Access-exceptions entries, travel-app/TESTING.md, and docs/calendar-sync/PROGRESS.md.

Then run, from C:\Users\chris\OneDrive\Apps\zo-bot.com:
  node tools/ops-check.mjs
  node tools/project-status.mjs

Done when: both migrations applied in production; travel-app online in pm2; the three curls give
200/302/404 from an un-authenticated machine; both Google accounts subscribed and showing trips;
all doc updates made; both tools exit 0; scratch data removed.

Finally, append a Phase 4 report to docs/calendar-feed/PROGRESS.md and set the top Status
blockquote to reflect a completed program.
```

---

## Optional — review pass

Worth running after Phase 3, before Phase 4.

```
Review the uncommitted changes in C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app against
docs/calendar-feed/00-overview.md and the phase docs.

Focus on the three things the design hangs on:
- THE AUTH CHANGE. Is the src/proxy.ts allowlist scoped to exactly /api/calendar/feed/? Can any
  non-GET method reach anything under that prefix? Is the ADMIN_EMAILS write gate byte-for-byte
  intact in behaviour? Is anything writable reachable without a Cloudflare Access header?
- THE CREDENTIAL. Does the feed token appear anywhere it should not — in the HTML served to a
  read-only user, in a log line, in an error body, in a Referer-generating context? Is it built
  from NEXT_PUBLIC_APP_URL anywhere?
- THE PREDICATE. Is includeItem() the only place these columns are tested? Does a hike survive a
  "confirmed only" filter? Does an item with noBookingNeeded ignore bookingStatuses? Does an
  empty array survive parseFeedFilters?

Also:
- Are ics.ts, filters.ts and token.ts still free of runtime imports? (Run node --test to prove
  it, don't eyeball it.)
- Is DTSTAMP per-item everywhere, so two fetches with no edits are byte-identical? Verify by
  fetching twice and diffing.
- Do all six original UID prefixes still produce the same UIDs as before this program?
- Does hide_from_calendar on a trip actually cascade to its items?
- Can the feed route 500 on any malformed stored filters value?
- Does buildCalendar ever emit a zero-VEVENT calendar?

Report findings; do not fix them without asking.
```

---

## If a phase goes wrong

- **Local data damaged in Phases 1-3** — restore from `travel-app/local.db.bak`. Stop the dev
  server first; SQLite is in WAL mode, so also remove `local.db-wal` and `local.db-shm`.
- **The .ics download broke after Phase 1** — it and the feed share one code path, so this is a
  real regression, not cosmetic. Diff against the `before.ics` you captured; the only legitimate
  differences are DTSTAMP/LAST-MODIFIED lines and the two new VEVENT kinds.
- **The feed 500s after Phase 2** — almost always a stored `filters` value the parser did not
  expect. `UPDATE calendar_feeds SET filters = '{}'` restores defaults without a code change;
  that is the fast mitigation, then fix `parseFeedFilters` and add the case to
  `filters.test.mjs`.
- **Locked out of the site after the Phase 4 Access change** — delete the new
  `Travel calendar feed (public)` application in the Cloudflare dashboard. Access reverts to the
  apex application immediately; nothing else was touched. The feed stops working, the site comes
  back.
- **The feed leaked / the URL went somewhere it should not** — rotate the token from Settings, or
  `UPDATE calendar_feeds SET token = <new>` directly. The old URL 404s at once. Both subscribers
  then re-add the calendar.
- **travel-app migration failed in production** — `009` creates a new table and `010` is
  `addColumnIfMissing`, so neither is destructive and both are safe to re-run. Check `pm2 logs`,
  fix forward.
- **Production travel data damaged** — restore from the pre-deploy `.backup` you took, or from
  `~/travel-app/backups/` (cron 02:10) or OneDrive (rclone 03:10). Full procedure in
  `travel-app/RUNBOOK.md`.
