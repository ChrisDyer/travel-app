@AGENTS.md

## Operational docs

- `RUNBOOK.md` — production operations on the Hetzner VPS (PM2 `start.sh` wrapper,
  nginx, backups, rollback, Next.js standalone quirks like `DB_PATH` and the
  static-asset copy steps).
- `DEPLOY.md` (gitignored) — first-time VPS setup checklist.
- `TESTING.md` — test strategy and commands.
- Deploys: commit + push, then run `Deploy-Travel` from PowerShell (`$PROFILE`).

## Per-user read-only role

`ADMIN_EMAILS` (comma-separated, case-insensitive) gates writes: any authenticated
Cloudflare Access email not in the list gets 403 `{"error":"read_only"}` on unsafe
`/api` methods (checked in `src/proxy.ts`, sharing `parseAdminEmails()` from
`src/lib/admin-emails.ts`) and has write controls hidden client-side. Unset/empty =>
everyone is admin (fail-open). `getAccessInfo()` in `src/lib/auth.ts` reads the role
server-side for the root layout, which wraps the app in `ReadOnlyProvider`
(`src/lib/read-only.tsx`); components call `useReadOnly()`. No `/api/me` endpoint is
needed — this app has no client-side auth fetch, everything comes from server
components reading `headers()`. See `docs/plans/2026-07-per-user-read-only/04-travel.md`
(Phase 4 of the cross-app program) for the full design.

## Trip brief

A free-text planning memory per trip: the traveller's stated goals, must-dos, constraints,
open questions and rejected ideas — the intent behind an itinerary, which the itinerary
itself does not record. Four columns on `trips` (migration `006_trip_brief`):
`planning_notes` (the brief; `NULL` when unset, never `''`), `planning_notes_previous`
(the value displaced by the most recent write), `planning_notes_updated_at`,
`planning_notes_updated_by` (`'you'` or `'assistant'`).

- **One write path.** `planningNotes` is deliberately **absent** from the `colMap` in
  `src/app/api/trips/[tripId]/route.ts`, and from `TRIP_FIELDS` in
  `mcp-server/travel-write.js`. The brief is writable only through
  `PUT /api/trips/{tripId}/brief`. A second write path would bypass the snapshot and the
  attribution, and the Undo button would then lie. Both exclusions carry comments saying so.
- **Authorship is server-derived**, never from the request body: a request whose
  `x-internal-token` matches `INTERNAL_API_TOKEN` is `'assistant'`, everything else is
  `'you'`. A client cannot claim to be Claude.
- **Undo is a self-inverting swap**, one level deep. Every write snapshots the outgoing
  content into `planning_notes_previous` in the same `UPDATE`; undo swaps the two columns,
  so undoing twice returns you to where you started and a mis-clicked undo costs nothing.
  Do not "improve" this by clearing `previous`.
- The panel never bumps `trips.updated_at` — `src/app/trips/[tripId]/page.tsx` passes it as
  `key` to `<ItineraryDocument>`, so bumping it would remount the whole client tree.
- Claude reaches it over MCP through `travel_get_trip_brief` / `travel_update_trip_brief`.

Full design in `docs/trip-brief/`.

## Plan folders

New multi-phase plans go under `docs/<slug>/` (see `docs/redesign`, `docs/fixes`,
`docs/calendar-sync`) with a `PROGRESS.md` per the convention in the root `CLAUDE.md`.
Register the folder in the root `projects.config.json` (path + `totalPhases`) and run
`node tools/project-status.mjs` from the repo root.

## Downstream MCP write registry

`mcp-server/travel-write.js` mirrors the writable `colMap` field lists in
`src/app/api/trips/**`. When a migration or route change adds a writable column, update
that registry too, or Claude's travel write tools will reject the new field as unknown.
