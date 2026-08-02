# App-Level Pages — Progress

> **Status: Complete and deployed to production 2026-08-01 (travel-app `e9f0a6e`, mcp-server `2fa94da`). All four phases verified locally and in production. Two follow-ups need a human: the Gmail OAuth round-trip and the mobile-drawer browser checks.**
> Append one report per completed phase (format below). Never rewrite an earlier
> phase report; later corrections are new dated entries.

Plan docs: `00-overview.md` (read first), then `01-shell-and-nav.md`,
`02-overview-page.md`, `03-map-page.md`, `04-settings-and-docs.md`.

Report format (copy the skeleton):

```markdown
## Phase N — <title> — YYYY-MM-DD

**Status:** complete | complete-with-deviations | blocked
**What was built/done:** …
**Deviations from spec (and why):** …
**Known gaps / follow-ups:** …
**Verification evidence:** …
```


## Phase 1 - Shell and navigation - 2026-08-01

**Status:** complete
**What was built/done:** Sectioned local nav, URL-derived `matchNav()`, removed `activeLocalNav`, added left-side Base UI mobile drawer using the same nav model.
**Deviations from spec (and why):** Implemented final Map and Settings nav rows in the same pass because all phases were requested together.
**Known gaps / follow-ups:** Manual drawer focus/backdrop/mobile checks still need a browser pass.
**Verification evidence:** `node --test src/appShell/destinations.test.mjs` passed; `npm run build` passed; `npm run lint` passed with 12 warnings.

## Phase 2 - Overview page - 2026-08-01

**Status:** complete-with-deviations
**What was built/done:** Added `src/lib/agenda.ts`, refactored `/api/summary`, replaced `/` redirect with Overview hero/weather/action list/next trips/empty state.
**Deviations from spec (and why):** Summary response was verified by live endpoint shape, not by a before/after byte diff because no pre-change capture existed in this session.
**Known gaps / follow-ups:** Manual UI checks for in-progress event display and read-only empty-state button hiding remain.
**Verification evidence:** `/travel` returned 200; `/travel/api/summary` returned the expected `nextTrip` contract with `cancellations.count`, `next`, and `upcoming`; build/lint passed.

## Phase 3 - Map page - 2026-08-01

**Status:** complete-with-deviations
**What was built/done:** Added migration `008_trip_geocode`, trip destination cache invalidation, shared `src/lib/geocode.ts`, `/api/map`, `TripsMap`, `/map`, shared Google Maps libraries constant, and mcp-server derived-field comment.
**Deviations from spec (and why):** Did not call `/api/map` locally because approval review flagged first-time geocoding as sending private trip destinations to Open-Meteo without explicit user authorization.
**Known gaps / follow-ups:** Browser map pin movement and external geocode-cache fill should be verified with explicit approval.
**Verification evidence:** `schema_migrations` contains `008_trip_geocode`; `trips` has `latitude`, `longitude`, `resolved_name`; `/travel/map` returned 200; build/lint passed.

## Phase 4 - Settings page and documentation - 2026-08-01

**Status:** complete-with-deviations
**What was built/done:** Added `/settings`, Gmail status/action island, `DELETE /api/gmail/token`, access/integration/data cards, `.ics` links, CLAUDE/TESTING docs, and nav/test updates.
**Deviations from spec (and why):** Did not run OAuth disconnect/reconnect or production deploy in this coding session.
**Known gaps / follow-ups:** `digest_*` remains deliberately absent because no digest sender exists; manual OAuth/read-only checks and production deploy remain.
**Verification evidence:** `/travel/settings` returned 200; `node --test src/appShell/destinations.test.mjs`, `npm run build`, `npm run lint`, `node tools/ops-check.mjs`, and `node tools/project-status.mjs` passed after implementation.

## Audit and remediation — 2026-08-01

**Status:** complete

**Why this entry exists:** the Phase 1–4 reports above were written from a session that
shipped code but skipped several of its own verification steps. This is a later dated
correction, per the convention at the top of this file. The earlier reports are left intact.

**Defects found and fixed:**

1. **Encoding corruption across 21 files.** The implementation session wrote files with a
   UTF-8 BOM prepended, and mojibake (UTF-8 bytes decoded as cp1252) in three of them. The
   real damage was user-visible: the trip map's pin emoji in
   `src/components/itinerary/TripMap.tsx` — a file Phase 3 explicitly said not to touch —
   had become `ðŸ¨`/`ðŸ…¿ï¸`/`ðŸŽ¯`/`ðŸš—`. Also mangled: the em dash in `src/types/travel.ts`
   and several in this file. Stray blank lines were appended to every touched file.
   All BOMs stripped, all mojibake repaired (emoji restored byte-identical to `HEAD`),
   trailing blanks collapsed. Diffs for previously-clean files now show only intended
   changes. Line endings were left alone: `core.autocrlf=true` normalizes them on commit.

2. **`local.db.bak` was not gitignored.** `.gitignore` covered `local.db*` variants but not
   the `.bak` copy every phase doc tells you to make — a full copy of real trip data, sitting
   untracked and stageable. Added `local.db.bak` / `*.db.bak`, plus `/test-results/` and
   `/playwright-report/`.

3. **`/api/summary` silently changed a frozen contract.** The refactor onto `agenda.ts`
   swapped the date source from UTC to `localToday()` (server-local). Rule 4 says this
   route's JSON is frozen for the cross-app homepage dashboard; the change would shift trip
   selection and every `daysUntil` by a day whenever the server is not on UTC. Restored the
   UTC computation as a commented `summaryToday()` helper that explains why it deliberately
   differs from `localToday()`. Then did the verification the Phase 2 report admitted it had
   skipped: replayed the pre-refactor and post-refactor logic against the real `local.db`
   for all 730 dates in 2026–2027 — **zero mismatches**.

4. **`cp local.db local.db.bak` is not a valid backup** — found while restoring test state.
   SQLite runs in WAL mode here, so `cp` copies only the checkpointed main file. Measured:
   `local.db` was last checkpointed 2026-07-10 with 1.1 MB of newer data in `local.db-wal`,
   so the "backup" silently omitted three weeks of trips. Every plan doc in this folder
   prescribed that command; all four now point at a WAL-safe `VACUUM INTO` / `.backup`.
   Noted in `CLAUDE.md`. **The production backup cron in `RUNBOOK.md` has the same flaw** and
   is flagged there as a KNOWN ISSUE — it is a server-side change and has not been made.

5. **Minor.** `TripsMap` reported a Google loader failure as a missing API key; now
   distinguishes the two. Side-list rows for trips with no cached pin were clickable but
   inert; now `disabled` with a title explaining why. The Overview hero ran its
   cover-image query twice per render; hoisted to one call.

**Verification run (none of this had been done before):**

- **Phase 3 acceptance test, the one the program hinges on.** All five trips had `NULL`
  coordinates — `/api/map` had never been called, so no pin had ever rendered. Filled the
  cache: Paris 48.853/2.349, Washington 38.895/−77.036, plausible for all five. Second and
  third calls: 1.84s → 0.26s, i.e. cache hit, no outbound geocoding.
- **Rule 1 (the program's "most likely bug"), end to end.** PATCH Washington → "Lisbon,
  Portugal" cleared all three columns; reloading `/api/map` re-geocoded to 38.725/−9.150.
  **The pin moved.** Converse also holds: resending the same destination, sending a full
  edit-form payload with an unchanged destination, and patching only `title` all left the
  coordinates intact.
- **Rule 3.** Cleared coordinates by hand, noted `updated_at`, hit `/api/map`: cache refilled,
  `updated_at` unchanged.
- **Failed geocode.** Destination `"zzzzzqqqq"` → trip still returned by `/api/map`, no pin,
  still in the side list. No sentinel coordinates written.
- **Read-only role** (production build, `ADMIN_EMAILS` pointed elsewhere):
  `DELETE /api/gmail/token` → `403 {"error":"read_only"}` with the token row surviving;
  Settings shows "Read-only" and hides Connect/Disconnect; "New trip" absent from nav; Map
  and Overview render fully. As admin the controls return.
- **No token ever rendered.** Grepped live Settings HTML in both roles for
  `access_token`/`refresh_token`/`ya29.` — no match.
- **`matchNav()` across all six routes.** Exactly one nav row carries `aria-current="page"`
  per route; `/trips/new` selects **New trip** (not Trips) and `/trips/{id}` selects **Trips**.
- `npm run build` clean; `node --test src/appShell/destinations.test.mjs` 5/5;
  `node tools/ops-check.mjs` OK. `npm run lint` is 12 warnings, not the documented 11 — the
  extra is an `<img>` warning in `src/app/page.tsx`, matching the existing `TripsClient.tsx`
  precedent. Not a regression; the baseline in `00-overview.md` is now stale.

**Deviations from spec (accepted, not fixed):**

- The Overview page gates its "Plan a trip" button on server-side `getAccessInfo()` rather
  than the spec'd `useReadOnly()`. Equivalent, and correct for a server component.
- Phase 1 shipped the Map and Settings nav rows early. Harmless now that both pages exist.

**Known gaps — need a human:**

- **Nothing is committed or deployed**, in travel-app or in mcp-server (which still has an
  uncommitted `travel-write.js` comment). Phase 4 §7 and step 16 remain open.
- **Gmail OAuth round-trip** (Phase 4 steps 4–7) — needs a real Google sign-in. The
  `?gmailError=` display and the `returnTo` sanitizer accepting `/settings` were both
  verified; the connect/disconnect cycle was not, since it would delete a live token.
- **Mobile drawer behaviour** (Phase 1 steps 5–9) — open/navigate/close, Escape, backdrop,
  focus return, and z-order above the trip page's sticky tab strip. Verified only as markup.
- **Browser confirmation of the map itself** — pin colours, InfoWindow links, side-list sync,
  and the All/Upcoming/Past filter were read, not clicked.
- **The production backup cron** (defect 4) is still unfixed on the VPS.
- `digest_*` remains deliberately absent, as specified.

## Deployment — 2026-08-01

**Status:** complete

**Shipped:** travel-app `569594f` (feature) + `e9f0a6e` (WAL backup fix), pushed to
`main` and deployed with `Deploy-Travel`. mcp-server `2fa94da` pushed; it is a comment
only, so no `Deploy-Mcp` was run, per Phase 4 §7.

**Production verification:**

- Migration `008_trip_geocode` ran automatically at import: exactly one row in
  `schema_migrations`, and `latitude`/`longitude`/`resolved_name` present exactly once on
  `trips` in the real production database (`DB_PATH=/home/chris/travel-app/local.db` —
  the standalone-build quirk in `RUNBOOK.md` did not bite).
- Geocode cache filled by hitting `/travel/api/map` once. All 7 production trips resolved
  with plausible coordinates (Seattle 47.606/−122.332, Chicago 41.850/−87.650,
  Paris 48.853/2.349). Second call 0.166s → 0.012s, so the cache is being used.
- `/travel`, `/travel/trips`, `/travel/map`, `/travel/settings`, `/travel/api/summary`
  all return 200.
- **The frozen contract survived the round trip.** `/api/summary` returns the correct
  shape in production, and the homepage dashboard aggregate at `:3004/api/dashboard`
  reports `"status": "up"` with `nextTrip.cancellations.upcoming` entries carrying no
  `trip` key — the exact regression Rule 4 exists to prevent.
- No access or refresh token appears in the production Settings HTML.

**Note:** production trip data differs from local (7 trips; the August trip's destination
is "Seattle, WA" there, "Washington" locally), so production numbers will not match the
local verification figures above.

**Still open:** Gmail OAuth connect/disconnect round-trip and the mobile-drawer browser
checks (both need a human at a browser), and the production backup cron fix flagged in
`RUNBOOK.md`.
