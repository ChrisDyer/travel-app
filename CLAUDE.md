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

## Plans that need no booking

Not every plan is bookable: a restaurant may not take reservations, an activity may be a
walk-up (a stroll, a self-guided walking tour). Both share one column —
`trip_events.takes_reservations` (`1` = needs booking, the default; migration
`005_restaurant_event_fields`). The name predates the activity case; read it as
**"does this need booking?"**. Helpers live in `src/lib/bookings.ts` — `bookingIsOptional()`
for the categories that offer the toggle (restaurant, activity), `skipsBooking()` for
"this plan needs nothing booked", `noBookingLabel()` for the wording ("No reservations"
vs "No booking needed"). Use them rather than re-testing the column inline.

When the flag is off the event carries no booking status: the form hides those fields and
nulls them on save, the card and detail sheet show a grey badge instead of the red "Needs
Booking" one, and `CancellationDeadlines` leaves it out of the "Needs Booking" list.
Hikes are separate — they never have a booking status at all.

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

## Trip legs

A trip leg is one stay within a trip: `trip_legs.place` plus an inclusive `start_date` / `end_date`. `trips.destination` is unchanged and remains the trip headline plus the fallback location when no leg covers a date.

- **One resolver.** `src/lib/legs.ts` is the single answer to "where am I on date X?". Gaps fall back to `trips.destination`. Overlaps are allowed; the leg with the later `startDate` wins, with `sortOrder` and then `id` as deterministic tiebreakers. Weather and UI warnings must call this helper instead of reimplementing the rule.
- **Place changes invalidate geocodes.** Any path that changes `trip_legs.place` must clear `latitude`, `longitude`, and `resolved_name` in the same write. The PATCH route enforces this; the weather route is the only code that fills those derived cache columns.
- **Leg writes never bump `trips.updated_at`.** The trip page keys `<ItineraryDocument>` by `trip.updatedAt`; changing it remounts the client tree and drops open panels/forms. Weather refreshes through `legsVersion` (`MAX(trip_legs.updated_at)` in `src/app/trips/[tripId]/page.tsx`) plus `router.refresh()` after successful leg edits.
- Overlaps, gaps, and legs outside the trip range are deliberately legal. The editor warns about them but does not block saving. Only reversed ranges (`endDate < startDate`) are rejected.
## Plan folders

New multi-phase plans go under `docs/<slug>/` (see `docs/redesign`, `docs/fixes`,
`docs/calendar-sync`) with a `PROGRESS.md` per the convention in the root `CLAUDE.md`.
Register the folder in the root `projects.config.json` (path + `totalPhases`) and run
`node tools/project-status.mjs` from the repo root.

## Downstream MCP write registry

`mcp-server/travel-write.js` mirrors the writable `colMap` field lists in
`src/app/api/trips/**`. When a migration or route change adds a writable column, update
that registry too, or Claude's travel write tools will reject the new field as unknown.
