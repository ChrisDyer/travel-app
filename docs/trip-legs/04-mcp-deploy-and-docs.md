# Phase 4 — MCP, deploy and docs

**Repos:** both. Start in travel-app. **Read `00-overview.md` first**, then `PROGRESS.md`.

Registers legs as a writable kind in the MCP server so Claude can set them from a chat,
deploys both apps, verifies against production, and brings the operational docs back in line
with reality.

This phase performs a **real production deploy** and runs a migration against live data.
**Confirm with Chris before running `Deploy-Travel`.**

---

## 1. mcp-server — the `leg` kind

`mcp-server/travel-write.js`. Legs are ordinary CRUD items; they need **no dedicated tools**.
Adding them to `TRAVEL_KINDS` makes them work with the existing `travel_add_items`,
`travel_update_item` and `travel_delete_item` for free.

This is the contract `travel-app/CLAUDE.md` calls the *downstream MCP write registry*: the
registry mirrors travel-app's writable field lists, and a column that exists in one but not
the other is rejected as unknown.

```js
leg: {
  label: 'trip leg',
  path: 'legs',
  listKey: null,
  creatable: true,
  deletable: true,
  requiredOnCreate: ['place', 'startDate', 'endDate'],
  fields: ['place', 'startDate', 'endDate', 'sortOrder'],
  enums: {},
},
```

**`latitude`, `longitude` and `resolvedName` are deliberately absent from `fields`.** They are
derived state owned by travel-app's weather route, which fills them from `place` and clears
them when `place` changes. A model writing coordinates directly would produce a leg whose
label and forecast disagree — the exact failure rule 1 exists to prevent. Give that exclusion
a comment saying so, the way `TRIP_FIELDS.note` documents the brief exclusion.

Add a `note` to the kind in the same spirit:

> `'Coordinates are resolved automatically from `place` and are not writable. Overlapping legs are allowed; on a date covered by two legs the later-starting one wins.'`

Check whether `describeKind`/`travelDescribeFields` surfaces `note` for item kinds the way it
does for `trip` — if it does not, either extend it or leave the note off and say so in the
report. Do not add a field that nothing reads.

### `get_trip_details`

`server.js:72`. Add legs to the `Promise.allSettled` batch and to the returned object, in the
same `status === 'fulfilled'` style as its neighbours:

```js
internalFetch(`${BASES.travel}/api/trips/${tripId}/legs`),
...
legs: legs.status === 'fulfilled' ? legs.value : null,
```

Also extend the `get_trip_details` **description** to mention places/legs — it currently
enumerates "itinerary events, flights, hotels, rental cars, transit, parking, and packing
list", and that list is what tells the model the tool is worth calling.

### Constraints

- Scope for this part is mcp-server only. Zod here is **v3**.
- `travel_update_trip` must still reject `place` — legs are rows, not trip fields. Confirm
  `TRIP_FIELDS.fields` is untouched.
- **The `genealogy` scope must still list exactly 7 tools.** That scope is a family member's
  access and a regression there is the worst outcome of this program. Verify it explicitly,
  locally and in production.
- No new tools are registered by this phase. If you find yourself writing `server.tool(`,
  stop — the design decision in `00-overview.md` was that legs need no dedicated tools.

## 2. Deploy

**Order matters: `Deploy-Travel` first, then `Deploy-Mcp`.** The reverse leaves a window in
which the MCP server advertises legs writes against a travel-app that 404s them. Phase 4 of
the trip-brief program got this backwards; do not repeat it.

Both aliases live in PowerShell `$PROFILE`. Before deploying:

1. Commit and push travel-app.
2. **Back up the production database.** Take a fresh copy — do not rely on the nightly cron,
   which may be 24 hours old. Get the real `DB_PATH` from `travel-app/RUNBOOK.md` rather than
   assuming; the Next.js standalone build's `process.chdir` makes `DB_PATH` mandatory and it
   is not the repo-root `local.db`.
3. `Deploy-Travel`, then verify on production: `schema_migrations` contains `007_trip_legs`,
   `PRAGMA table_info(trip_legs)` shows eleven columns, the trip page returns 200, and
   `GET /api/trips/{id}/legs` returns `[]` rather than 404.
4. Commit, push and `Deploy-Mcp`.
5. `ssh chris@91.99.230.234 'pm2 status'` — both processes `online`.

## 3. Production verification

1. On a real upcoming trip, add two legs **through the site**. The weather strip splits.
2. `travel_add_items` over the production MCP connector creates a leg; it appears on the site
   after a refresh, and the weather strip picks it up.
3. `get_trip_details` carries the `legs` key.
4. `travel_update_item` with `kind: 'leg'` changing `place` → the site shows the new place
   **and a new forecast**. This is rule 1 surviving the round trip through MCP.
5. `travel_add_items` with a `latitude` field → rejected as an unknown field.
6. `travel_delete_item` with `kind: 'leg'` → the leg goes, weather regroups.
7. Production `tools/list`: the `full` scope tool count is unchanged from before this phase
   (no new tools), and `genealogy` is **exactly 7**.
8. Remove the scratch legs afterwards and confirm the trip is as Chris left it.

## 4. Docs

Not optional, and they happen in this session — the operational-docs contract in the root
`CLAUDE.md` requires it.

**`travel-app/CLAUDE.md`** — a new `## Trip legs` section covering: what a leg is and that
`trips.destination` is unchanged and still the fallback; the resolver in `src/lib/legs.ts` as
the single answer to "where am I on date X", including the later-start-wins tiebreak and the
gap-falls-back rule; **rule 1** (changing `place` clears the cached geocode) and where it is
enforced; **rule 3** (legs never bump `trips.updated_at`) and the `legsVersion` +
`router.refresh()` wiring that exists because of it; and that overlaps and gaps are
deliberately allowed. Match the voice of the existing `## Trip brief` section — it explains
*why* each constraint exists, which is what stops a later agent removing it.

**`travel-app/CLAUDE.md`, "Downstream MCP write registry"** — that section already states the
rule. Confirm it still reads correctly with legs in the picture; extend only if legs make it
inaccurate.

**`mcp-server/CLAUDE.md`** — update the travel tool inventory and kind list to include `leg`.
Check the tool counts in the headings against reality while you are in there; they have
drifted before.

**`travel-app/TESTING.md`** — a `## Trip Legs` checklist block after `## Trip Brief`, in the
file's existing unchecked-box voice. Cover at least: no legs → single-destination forecast
unchanged; two legs → two captioned groups; overlap day resolves to the later leg; gap falls
back to the destination; editing a place changes the forecast, not just the caption; weather
updates without a reload and the itinerary does not remount; suggest-from-hotels proposes but
does not write; read-only sees the list and no controls; panel is Overview-tab-only and never
prints.

**Root `README.md`** — this adds no port, process, vhost or cron job, so it most likely needs
no change. **Confirm rather than assume.**

Then, from `C:\Users\chris\OneDrive\Apps\zo-bot.com`:

```
node tools/ops-check.mjs
node tools/project-status.mjs
```

---

## Done when

Both apps deployed and `online` in PM2; `007_trip_legs` applied to production; the production
verification list above passes, including the `genealogy` scope at exactly 7 tools; all four
doc updates made; both tools run clean; scratch legs removed; `PROGRESS.md` finished with a
Status blockquote reflecting a completed program.
