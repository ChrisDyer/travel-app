# Agent prompts — Trip Legs

Copy-paste prompts for the implementation agents, one per phase.

**Run them in order, in separate sessions.** Each phase assumes the previous phase's code
exists. Do not run two in parallel.

Phases 1–3 are travel-app only. Phase 4 spans travel-app and mcp-server, which are
**separate git repos**, not a monorepo.

---

## Before you start

- **Back up the local database before every phase.** Each one writes to Chris's real
  `travel-app/local.db`: `cp local.db local.db.bak`
- **Ports.** Local travel-app dev is **3000**; the `3001` in mcp-server's `.env.example` is
  the VPS port. travel-app's base path is `/travel`, required even on localhost.
- **Use a trip whose dates fall inside the next 15 days** for any weather verification.
  Open-Meteo's horizon is ~16 days, so a trip further out short-circuits before the code you
  are testing runs, and you will verify nothing. Create a scratch trip if needed.
- **Phases 1–3 stay on this machine.** Phase 4 is the first that touches the VPS, runs a
  migration against live data, and needs `ssh chris@91.99.230.234` — do that one when Chris
  can watch it.
- The default shell here is **PowerShell**. Bash-style `VAR=x npm start` is a parse error.
- There is no `npm test` script. Verification is `node --test` for the one pure module,
  `npm run build`, `npm run lint`, curl, and the browser. `npm run lint` has 11 pre-existing
  warnings — that is the clean baseline, not a regression.

---

## Phase 1 — Schema and API

```
Implement Phase 1 of the Trip Legs program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-legs/00-overview.md         (problem, decisions, data contract, conventions)
  docs/trip-legs/01-schema-and-api.md   (your spec)

Phase 1 adds the trip_legs table, the TripLeg type, the date resolver in src/lib/legs.ts
with a real unit test, the CRUD routes, and duplicate-trip support. No UI and no change to
the weather route — the app must look identical in a browser when you are done.

Hard constraints:
- Do NOT touch src/app/api/trips/[tripId]/weather/route.ts or TripWeather.tsx. Phase 2 owns
  them. Do not touch any component; there is no UI in this phase.
- RULE 1: any PATCH that changes `place` must set latitude, longitude and resolved_name to
  NULL in the SAME UPDATE. Otherwise editing Seattle to Port Angeles keeps showing Seattle's
  forecast under a Port Angeles label, and it looks like it worked. A PATCH resending the
  same place must NOT clear them. Comment the code and prove both with a re-GET, not by
  reading the code back.
- RULE 3: no leg write may touch trips.updated_at. src/app/trips/[tripId]/page.tsx:51 passes
  key={trip.updatedAt} to ItineraryDocument, so bumping it remounts the whole client tree.
  Comment it — "the parent should reflect child changes" is exactly the reasonable-sounding
  change that would break the page.
- Overlaps, gaps and dates outside the trip range are all ALLOWED. Only endDate < startDate
  is a 400. Refusing to save a half-finished list would be worse than warning about it.
- The resolver's overlap tiebreak (greatest startDate wins, then sortOrder, then id) is the
  point of the unit test. It is the rule most likely to get "simplified" later and the one
  whose breakage is least visible.
- src/lib/legs.ts must have NO runtime imports and use only erasable TypeScript, so that
  src/lib/legs.test.mjs can import it under `node --test` on Node 24's type stripping.
  `import type` is fine; a value import of a @/-aliased module will not resolve.
- trip_legs has no user_id. Enforce ownership by looking up the parent trip with
  AND user_id = ? first, exactly as src/app/api/trips/[tripId]/hotels/route.ts does.
- The migration creates a table, so CREATE TABLE IF NOT EXISTS is already idempotent — do
  NOT add a runCustomMigration branch. That helper exists only because ALTER TABLE ADD
  COLUMN has no IF NOT EXISTS form. Check the migrations array for anything newer than 006
  before picking a number.
- This is not the Next.js in your training data — see AGENTS.md and check
  node_modules/next/dist/docs/ before using an API you half-remember.

Back up the database first: cp local.db local.db.bak

Work the full verification section. Steps 11, 12 and 16 are the ones that matter most; each
asserts state AFTER the operation, so re-GET rather than trusting a status code. Step 18
checks the ON DELETE CASCADE actually fires — if PRAGMA foreign_keys is off in this
database, handle it in the route and say so in the report rather than assuming.

Done when: node --test src/lib/legs.test.mjs passes; every verification step passes; the
migration is idempotent across restarts; npm run build and npm run lint are clean; the trip
page is visually unchanged.

Finally, append a Phase 1 report to docs/trip-legs/PROGRESS.md following the template at the
bottom of that file, and update its top Status blockquote. Then run
`node tools/project-status.mjs` from C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 2 — Weather by leg

```
Implement Phase 2 of the Trip Legs program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-legs/00-overview.md       (decisions, data contract, conventions)
  docs/trip-legs/02-weather-by-leg.md (your spec)
  docs/trip-legs/PROGRESS.md          (what Phase 1 actually delivered)

Phase 2 rewrites the weather route to return one forecast segment per leg with cached
geocodes, and rewrites TripWeather.tsx to render captioned groups.

Hard constraints:
- THE REGRESSION TO WATCH: a trip with no legs must come out of this phase pixel-identical
  to how it looks now. Same heading, same caption, same tiles. Check it against a second tab
  on the pre-change build, not from memory.
- Do NOT re-derive the date-to-leg grouping in the route. Call segmentDates() from Phase 1's
  src/lib/legs.ts. That resolver is the single source of truth for the rule, and a second
  implementation will drift from the editor's warnings in Phase 3.
- The geocode write-back is a write inside a GET. That is intended. But it must NOT touch
  trip_legs.updated_at — that column feeds legsVersion, and bumping it puts TripWeather in a
  refetch loop. Verify with 60 seconds on the network tab (verification step 8). If you see
  a loop, fix the statement; do not paper over it with a ref guard.
- Partial availability is the normal case. One leg failing to geocode must still render the
  other, with available: true. Per-segment reasons, not one global failure.
- Cap outbound work at 8 distinct locations per request. A 30-leg trip must not fan out into
  30 HTTP calls on page load.
- Weather is decoration. Any failure must degrade to a missing strip, never a 500 or a
  broken trip page. Keep the existing try/catch envelope and the 5s AbortSignal.timeout.
- Do NOT assume Open-Meteo supports comma-separated multi-location coordinates. The phase
  doc gives you a curl — run it, then pick one request or Promise.all based on what it
  actually returned, and report which you used and what you saw.
- Use datesBetween() from src/lib/dates.ts. Never new Date(str) + toISOString() on a
  date-only string — read that file's header comment for why.
- `place` is user input and appears in the caption. Escaped React text only; never
  dangerouslySetInnerHTML.
- Do not touch src/lib/legs.ts, the legs CRUD routes, or any editor UI. If the resolver is
  wrong, fix it in Phase 1's file AND add the failing case to legs.test.mjs — do not work
  around it in the route.

Back up first: cp local.db local.db.bak
Create legs with curl against Phase 1's API; there is still no UI. Use a trip inside the
next 15 days or the forecast window short-circuits and you verify nothing.

Done when: every verification step passes — especially 1 (no-legs regression), 6 (the
handover day appears once, in the later leg's group) and 8 (no refetch loop); npm run build
and npm run lint are clean.

Finally, append a Phase 2 report to docs/trip-legs/PROGRESS.md, noting which Open-Meteo call
shape you used and what the curl showed, and update the Status blockquote. Then run
`node tools/project-status.mjs` from C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 3 — Legs editor UI

```
Implement Phase 3 of the Trip Legs program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-legs/00-overview.md        (decisions, conventions)
  docs/trip-legs/03-legs-editor-ui.md  (your spec)
  docs/trip-legs/PROGRESS.md           (what phases 1-2 delivered)

Phase 3 builds src/components/itinerary/TripLegs.tsx — the "Where you'll be" panel — wires
it into the overview column, and adds the suggest-from-hotels action. After this phase the
feature is usable end to end.

Hard constraints:
- Render it inside the EXISTING overview wrapper div at ItineraryDocument.tsx:289, as the
  FIRST child, above CancellationDeadlines. That div already carries the mobile-tab and
  print classes, so the panel lands under the Overview tab for free. Do not add a fourth
  mobile tab and do not touch the tab bar at lines 241-261.
- After EVERY successful write, call router.refresh(). That is the entire mechanism by which
  the weather strip updates — it is a sibling component rendered by page.tsx and cannot be
  reached by props. If router.refresh() does not re-run the server component in this Next
  version, check node_modules/next/dist/docs/ and report what you found; do not invent a
  workaround silently.
- Explicit Save/Cancel per row, NOT save-on-blur. A blur save on a three-field row saves
  half-entered state.
- Warnings from legWarnings() never block a save. They are information. Overlaps and gaps
  are legal by design. The only local rejection is endDate < startDate.
  The overlap warning must NAME THE WINNING PLACE — that is the resolver's rule made
  visible, and otherwise the user has to guess which city they'll get.
- Read-only users must still SEE the list. Hide only Add place / Use my hotels / edit /
  delete, using the TripAssistant.tsx:226 / AddPlanMenu.tsx:32 convention. Do NOT follow
  DaySection, which leaves inline editors visible for read-only users and lets the write
  403 — that is a known gap, not a pattern to copy.
- "Use my hotels" PROPOSES rows for confirmation; it never writes implicitly. Do not build
  an address parser — take a simple city-ish slice and let Chris edit the row.
- Optimistic updates must roll back on failure. Follow reorderEvent at
  ItineraryDocument.tsx:80.
- Every fetch goes through apiUrl() from src/lib/api.ts. A bare /api/... URL breaks in
  production because of NEXT_PUBLIC_BASE_PATH.
- Match the sibling overview panels exactly — stone-* palette, not slate-*. The panel should
  be visually indistinguishable in style from CancellationDeadlines.
- Do not touch the weather route, TripWeather.tsx, src/lib/legs.ts, or TripEditForm.tsx.
  Legs deliberately do not live in the trip dialog.

Back up first: cp local.db local.db.bak
Use a trip inside the next 15 days so the weather strip is live and you can watch it react.

Verification steps 2, 3, 4 and 18 are the ones that matter:
  2 — weather updates with no page reload
  3 — the itinerary below does NOT remount (expand a day first, then add a leg)
  4 — editing a place changes the FORECAST NUMBERS, not just the caption. If the numbers
      stay put, rule 1's cache invalidation is broken in Phase 1's PATCH route — fix it
      there.
 18 — the read-only path for real (NODE_ENV=production, ALLOW_NO_ACCESS_HEADER=1,
      ADMIN_EMAILS set to an address that isn't yours, with a
      cf-access-authenticated-user-email header), not by reading the code.

Also confirm you haven't disturbed the rest of the trip page: add an event, open a booking
sheet, switch mobile tabs, reorder an event. ItineraryDocument holds a lot of state.

Then run the acceptance test in 00-overview.md end to end.

Done when: every verification step passes; npm run build and npm run lint are clean.

Finally, append a Phase 3 report to docs/trip-legs/PROGRESS.md and update the Status
blockquote. Then run `node tools/project-status.mjs` from
C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 4 — MCP, deploy and docs

```
Implement Phase 4 of the Trip Legs program. This phase spans both repos; start in
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-legs/00-overview.md           (context, decisions)
  docs/trip-legs/04-mcp-deploy-and-docs.md (your spec)
  docs/trip-legs/PROGRESS.md              (what phases 1-3 delivered)

Phase 4 registers legs as a writable kind in mcp-server, deploys both apps, verifies against
production, and updates the operational docs.

This phase performs a real production deploy AND runs a database migration against live
data. Confirm with Chris before running Deploy-Travel.

Hard constraints:
- Add a `leg` entry to TRAVEL_KINDS in mcp-server/travel-write.js. Do NOT register any new
  tools — legs work through the existing travel_add_items / travel_update_item /
  travel_delete_item. If you find yourself typing `server.tool(`, stop and re-read the
  design decision in 00-overview.md.
- latitude, longitude and resolvedName must NOT appear in the kind's `fields`. They are
  derived from `place` by travel-app and cleared when `place` changes; a model writing them
  directly produces a leg whose label and forecast disagree. Comment the exclusion the way
  TRIP_FIELDS.note documents the brief exclusion.
- Zod in mcp-server is v3, not v4. travel-app uses v4 — do not carry idioms across.
- Verify the genealogy scope still lists EXACTLY 7 tools, locally and in production. That
  scope is a family member's access and a regression there is the worst outcome of this
  program.
- DEPLOY ORDER: Deploy-Travel FIRST, verify the migration applied and legs return [] rather
  than 404, THEN Deploy-Mcp. The reverse leaves a window where the MCP server advertises
  legs writes against a travel-app that 404s them. Phase 4 of the trip-brief program got
  this backwards; do not repeat it.
- Back up the production database first — a fresh copy, not the nightly cron backup which
  may be 24 hours old. Get the real DB_PATH from travel-app/RUNBOOK.md rather than assuming;
  the standalone build's process.chdir makes DB_PATH mandatory and it is not the repo-root
  local.db.

Production verification step 4 is the important one: change a leg's `place` over MCP and
confirm the site shows both the new place AND a new forecast. That is rule 1 surviving the
round trip. Step 5 confirms a latitude field is rejected as unknown.

Doc updates are not optional and happen in this session, per the operational-docs contract
in the root CLAUDE.md. Four files: travel-app/CLAUDE.md (a new "Trip legs" section — match
the "Trip brief" section's voice, which explains WHY each constraint exists, since that is
what stops a later agent removing it), mcp-server/CLAUDE.md (tool/kind inventory; check the
counts in the headings against reality while you're there), and travel-app/TESTING.md (a
"## Trip Legs" checklist after "## Trip Brief", in the file's existing unchecked-box voice).
The root README.md most likely needs no change since this adds no port, process, vhost or
cron job — confirm rather than assume.

Then run, from C:\Users\chris\OneDrive\Apps\zo-bot.com:
  node tools/ops-check.mjs
  node tools/project-status.mjs

Done when: both apps deployed and online in pm2; 007_trip_legs applied to production; every
production verification step passes including genealogy at exactly 7 tools; all doc updates
made; both tools run clean; scratch legs removed; PROGRESS.md finished with a Status
blockquote reflecting a completed program.
```

---

## Optional — review pass

Worth running after Phase 3, before Phase 4.

```
Review the uncommitted changes in C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app against
docs/trip-legs/00-overview.md and the phase docs.

Focus on the three rules the design hangs on:
- RULE 1 — is there ANY path that changes trip_legs.place without clearing latitude,
  longitude and resolved_name in the same statement? Check the PATCH route, the duplicate
  route, and anything the weather route writes.
- RULE 3 — does any leg write, including the weather route's geocode write-back, touch
  trips.updated_at or trip_legs.updated_at? The first remounts the trip page; the second
  causes a weather refetch loop.
- RULE 2 — is the date-to-leg resolution implemented anywhere other than src/lib/legs.ts?
  A second copy in the route or the component will drift from the warnings the editor shows.

Also:
- Does a trip with no legs still produce byte-identical weather behaviour to before?
- Can the legs POST/PATCH accept latitude/longitude from a request body?
- Does the read-only gate cover the legs routes server-side, not just in the UI?
- Is `place` ever rendered unescaped, in the panel or the weather caption?
- Is the outbound-request cap actually enforced, and is the response cache bounded?

Report findings; do not fix them without asking.
```

---

## If a phase goes wrong

- **Local data damaged in Phases 1-3** — restore from `travel-app/local.db.bak`. Stop the dev
  server first; SQLite is in WAL mode, so also remove `local.db-wal` and `local.db-shm`.
- **Weather strip broken after Phase 2** — `DELETE FROM trip_legs` restores the old
  single-destination behaviour without a code change, since a trip with no legs takes the
  fallback path. That is the fast mitigation; fix forward after.
- **travel-app migration failed in production** — `trip_legs` is a new table, so a failed
  create is not destructive and `CREATE TABLE IF NOT EXISTS` makes a re-run safe. Check
  `pm2 logs`, fix forward.
- **mcp-server misbehaving after Phase 4** — remove `TRAVEL_WRITE` from `~/mcp-server/.env`
  and `pm2 restart mcp-server`. All travel writes stop immediately, reads survive, no
  rollback deploy needed. If the deploy itself is broken, `git revert` and re-run `Deploy-Mcp`.
- **Production travel data damaged** — restore from the pre-deploy backup, or from
  `~/travel-app/backups/` (cron 02:10) or OneDrive (rclone 03:10). Full procedure in
  `travel-app/RUNBOOK.md`.
