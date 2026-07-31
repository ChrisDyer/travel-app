# Trip Brief — Progress

> **Status: Deployed to production and verified end-to-end over MCP. Phase 4 stays open until the claude.ai acceptance test is run.**
> Append one report per completed phase (format below). Never rewrite an earlier
> phase report; later corrections are new dated entries.

Plan docs: `00-overview.md` (read first), then `01-schema-and-api.md`,
`02-trip-page-ui.md`, `03-mcp-tools.md`, `04-deploy-and-docs.md`.
Agent prompts: `prompts.md`.

Report format (copy the skeleton):

```markdown
## Phase N — <title> — YYYY-MM-DD

**Status:** complete | complete-with-deviations | blocked
**What was built/done:** …
**Deviations from spec (and why):** …
**Known gaps / follow-ups:** …
**Verification evidence:** …
```
## Phase 1 - Schema and API - 2026-07-31

**Status:** complete
**What was built/done:** Added migration `006_trip_brief` with idempotent custom migration handling for the four `planning_notes*` columns. Added Trip type fields, documented why the generic trip PATCH omits `planningNotes`, copied `planning_notes` during trip duplication without copying undo/bookkeeping columns, and added dedicated `GET`/`PUT /api/trips/{tripId}/brief` plus `POST /api/trips/{tripId}/brief/undo` routes with shared response shaping, snapshot writes, optimistic concurrency, content-length guard, append mode, self-inverting undo, ownership checks, and server-derived attribution.
**Deviations from spec (and why):** None.
**Known gaps / follow-ups:** Phase 2 still needs the trip-page UI panel. The existing dev server on port 3000 did not have `INTERNAL_API_TOKEN`, so positive assistant attribution was verified with a temporary token-enabled `next start` instance on port 3011, then stopped.
**Verification evidence:** `npm run build` passed and listed both new brief routes. `npm run lint` passed with 0 errors and 11 pre-existing warnings. SQLite verification showed all four planning columns and one `006_trip_brief` row in `schema_migrations`. Local API verification against `http://127.0.0.1:3000/travel` covered initial GET, replace, replace with previous snapshot, append, undo twice, clear-to-null, stale `expectedUpdatedAt` 409 with unchanged content, too-long 400 with unchanged content, bad mode 400, missing content 400, malformed JSON 400 `Invalid JSON body`, missing-trip GET/PUT 404, wrong internal token attribution as `you`, duplicate copying only `planningNotes`, generic trip PATCH ignoring `planningNotes`, and normal title PATCH still working. A temporary `INTERNAL_API_TOKEN=testtoken` server on port 3011 verified matching `x-internal-token` writes return `updatedBy: "assistant"`. The tested trip's brief fields were reset to their original null state afterward.

## Phase 2 - Trip page UI - 2026-07-31

**Status:** complete
**What was built/done:** Added the `TripBrief` client panel, wired it into the existing overview column between cancellation deadlines and cost summary, and added `formatRelativeTime()` in `src/lib/dates.ts` for brief attribution timestamps. The panel supports empty, read, edit, save, cancel, Escape cancel, collapse/expand, undo, read-only control hiding, base-path-safe API calls, and no-print rendering.
**Deviations from spec (and why):** None.
**Known gaps / follow-ups:** Full visual/browser interaction coverage and the read-only Cloudflare Access simulation were not run locally: the in-app browser connector reported no available browser, and this project does not have Playwright installed. The server-side read-only gate was covered in Phase 1, and the Phase 2 UI hides write controls from `useReadOnly()` while keeping text visible.
**Verification evidence:** `npm run lint` passed with 0 errors and 11 pre-existing warnings. `npm run build` passed and listed both brief routes plus the trip and print pages. Local HTTP smoke checks against the running app returned 200 for `/travel/trips` and `/travel/trips/b35f9f7f-bb8f-4087-9d49-2c0f52d97dc5`; `GET /travel/api/trips/b35f9f7f-bb8f-4087-9d49-2c0f52d97dc5/brief` returned the expected empty payload. Static code verification confirmed `TripBrief` renders inside the existing Overview wrapper between `CancellationDeadlines` and `TripCostSummary`, uses `apiUrl()` for both write calls, wraps the panel in `no-print`, and gates Edit/Add/Undo behind `useReadOnly()` while leaving text visible.

## Phase 3 - MCP tools - 2026-07-31

**Status:** complete
**What was built/done:** `travelGetTripBrief` / `travelUpdateTripBrief` in `mcp-server/travel-write.js`, the `note` on `TRIP_FIELDS` redirecting `planningNotes` to the brief tools, `travel_get_trip_brief` (ungated) and `travel_update_trip_brief` (behind `TRAVEL_WRITE`) registered in the `full` scope, the server `instructions` string passed to the `McpServer` constructor, a top-level `brief` key on `get_trip_details`, and four tests. Implementation was done in an earlier session but never committed or reported; this session audited it against `03-mcp-tools.md`, verified it, and recorded it here.
**Deviations from spec (and why):** Server `version` stays `1.3.0`. The spec said to bump to `1.3.0` while in the constructor, but the write-tools program had already claimed that number, so the brief tools ship under the same version as the write tools. Section comments are ASCII rather than box-drawing, matching the Phase 1 decision in the write-tools program.
**Known gaps / follow-ups:** Live MCP verification (steps 2-13 of the phase doc) was not re-run — there is still no `mcp-server/.env` on this machine. The claude.ai acceptance test remains Phase 4 and is the only thing that proves the descriptions actually make Claude read and maintain the brief.
**Verification evidence:** `npm test` passed (20/20, including the four brief cases and two new packing cases). Static verification confirmed `travel_get_trip_brief` registers inside `if (scope === 'full')` but outside `if (TRAVEL_WRITE)`, `travel_update_trip_brief` registers inside `if (TRAVEL_WRITE)`, and the seven `genealogy_*` tools remain outside the `full` block — so the genealogy scope is untouched. `travelUrl` encoding, the default `mode: 'replace'`, `expectedUpdatedAt` pass-through, and the localhost guard on the brief PUT are each covered by a test. travel-app's `GET /api/trips/{id}` uses `SELECT *` + `camelize`, so the `planningNotes*` fields the `brief` key reads are genuinely present in the response.

## Phase 2 - correction: Undo stayed reachable after clearing - 2026-07-31

**Status:** complete
**What was built/done:** The attribution line and its **Undo** button were nested inside the `hasContent` branch of `TripBrief.tsx`, so clearing a brief and saving dropped straight to the empty state with no way back — despite the server still holding the previous content and `hasUndo: true`. Clearing is the most destructive action the panel offers, so that was exactly the case with no safety net. The attribution/Undo block now renders outside the content/empty split, whenever `updatedAt` is set, with a comment saying why.
**Deviations from spec (and why):** None. Phase 2's step 10 only asserted "back to the empty state", which is why the original passed its checks.
**Known gaps / follow-ups:** None.
**Verification evidence:** `npx tsc --noEmit` clean; `npm run lint` 0 errors / 11 pre-existing warnings. Live against the dev server: `PUT {"content":"Audit scratch brief"}` then `PUT {"content":""}` returned `content: null, hasUndo: true`, and the server-rendered trip page then contained both `No brief yet.` and the Undo control's `Restore the previous trip brief version` title. `POST /brief/undo` returned the text. The test trip's four `planning_notes*` columns were reset to `NULL` afterwards.


## Phase 4 - Deploy and docs - 2026-07-31

**Status:** in progress - deployed and verified in production; the claude.ai acceptance test is outstanding and only Chris can run it
**What was built/done:** Chris ran the pre-deploy backup (`~/travel-app/local.db` ->
`~/travel-app/backups/pre-trip-brief-2026-07-31.db`), then `Deploy-Mcp` and `Deploy-Travel`.
Docs brought in line with the deployed reality: a "Trip brief" section in
`travel-app/CLAUDE.md` (columns, the single write path and both deliberate exclusions,
server-derived authorship, the self-inverting undo, the `trips.updated_at` trap), a rewritten
travel tool inventory in `mcp-server/CLAUDE.md` (14/22 full-scope counts, the ungated read
tool, the `instructions` string, the `travel_update_packing` confirm contract), and a
`## Trip Brief` checklist in `travel-app/TESTING.md`.
**Deviations from spec (and why):** Deploy order was inverted - `Deploy-Mcp` ran first, so for
about three minutes production advertised both brief tools while travel-app still 404'd them.
Confirmed harmless in hindsight (reads and the seven write tools were unaffected, and no brief
call was made in the window), but it is the exact failure `04-deploy-and-docs.md` warns about.
The doc's pre-deploy backup path was wrong (`~/travel-app/data/travel.db`); corrected to
`~/travel-app/local.db` per `RUNBOOK.md:98` in commit `88fc7cf`.
**Known gaps / follow-ups:** **The acceptance test has not been run.** State constraints to
Claude in a fresh claude.ai conversation, confirm `travel_update_trip_brief` fires unprompted,
then open a brand new conversation and check the constraints are honoured without being
repeated. That, plus the site-side Undo check and the read-only check, is what remains before
this phase can be marked complete. Browser-based UI verification (steps 5, 8, 11, 12) is also
still outstanding for the same reason it was in Phases 2 and 3 - no browser session available.
**Verification evidence:** VPS `travel-app` at `88fc7cf`, `mcp-server` at `2657d44`, both
`online` in PM2. Migration applied: `schema_migrations` contains `006_trip_brief` and
`PRAGMA table_info(trips)` shows all four `planning_notes*` columns. `GET
/api/trips/{id}/brief` on production returned `{"content":null,...,"hasUndo":false}` (it 404'd
before the travel-app deploy, which is how the ordering window was confirmed); the trip page
returned 200. Production `tools/list`: full scope 22 tools including both brief tools,
genealogy scope exactly 7 with zero non-`genealogy_*` tools. Health 200, unauthenticated
`/mcp` 401. `initialize` carried the `instructions` string. End-to-end write over production
MCP on trip `dad00455` (Atlanta, July 2026): `travel_update_trip_brief` returned
`updatedBy: "assistant"`, travel-app then served that content over its own API, and
`get_trip_details` carried the matching top-level `brief` key. The trip's four `planning_notes*`
columns were reset to `NULL` afterwards and re-read as `(None, None, None, None)`.
