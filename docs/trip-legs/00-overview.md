# Trip Legs — Overview

**Every phase agent reads this file first.** It carries the problem, the settled design
decisions, the data contract, and the conventions each phase must honour. The per-phase docs
assume you have read it and do not repeat it.

---

## The problem

A trip has exactly one location: `trips.destination`, a free-text string. The weather strip
on the trip page geocodes that one string and shows one forecast for the whole trip
(`src/app/api/trips/[tripId]/weather/route.ts`).

Real trips move. "Two days in Seattle, then four in Port Angeles" is one trip with two
places, 80 miles and often 10°F apart. Today it gets one forecast — for whichever city
Chris happened to type into `destination`, which for a multi-city trip is frequently a list
("Rome, Florence, Venice") that geocodes to something arbitrary or nothing at all.

Nothing in the schema records **where you are on a given day**.

## The feature

**Trip legs**: an ordered list of stays per trip, each a place plus an inclusive date range.
From those, the weather strip shows the right forecast for each stretch of the trip —
Seattle for the first two days, Port Angeles for the rest — under a caption that says which
is which.

Legs are optional. A trip with no legs behaves exactly as it does today.

---

## Settled design decisions

These were decided with Chris during planning. **Do not revisit them.** If a phase doc seems
to contradict one, the phase doc is wrong — flag it rather than silently changing course.

| Decision | Choice | Why |
|---|---|---|
| Storage | New `trip_legs` table | A date-ranged list. Not a column on `trip_days`: that would re-type the city on every day row and leave nowhere to cache the geocode |
| `trips.destination` | **Unchanged**, stays the trip headline | It is the page subtitle, the assistant prompt, the packing prompt, and the fallback when a trip has no legs. Legs supplement it; they do not replace it |
| Geocode | Cached on the leg row, filled lazily on first weather fetch | Otherwise N legs means N geocoding calls on every page load |
| Overlap and gap rule | One documented resolver, unit-tested (see below) | Travel days legitimately belong to two legs. Guessing per-call-site would give the weather strip and the UI different answers |
| Editor placement | Its own panel in the itinerary overview column, above Cancellation Deadlines | Legs need their own POST/PATCH/DELETE calls; folding them into `TripEditForm`'s single PATCH submit would mix save semantics in one form |
| Weather response | Rewritten to `segments[]` | The endpoint has exactly one consumer, `TripWeather.tsx`. There is no back-compat to preserve, and carrying both a flat `days[]` and a grouped shape would be two representations of one thing |
| MCP surface | A `leg` kind in the existing `TRAVEL_KINDS` registry | Legs are ordinary CRUD items like hotels. They need no dedicated tools — unlike the trip brief, nothing about them needs coaxing behaviour out of the model |

### Explicitly out of scope

Real follow-ups, deliberately not in this program. Do not build them; do not let them creep in.

- **Per-leg map centring** in `TripMap.tsx`. Legs make it possible; it is a separate change.
- **Per-day weather** in `DaySection` headers. This program changes only the weather strip.
- **Leg-aware packing suggestions** (`packing/suggest/route.ts`) and **leg-aware assistant
  prompts** (`assistant/suggest/route.ts`). Both still see only `trips.destination`.
- **Event timezones.** Legs carry no timezone and no event is reinterpreted because of them.
- **Auto-creating legs** on trip creation or from flights. Phase 3 adds a one-click
  *suggest from hotels* action that Chris confirms; nothing is ever written implicitly.

---

## Repo layout

One repo for Phases 1–3, two for Phase 4.

| Repo | Path | Phases |
|---|---|---|
| travel-app | `C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app` | 1, 2, 3, and its half of 4 |
| mcp-server | `C:\Users\chris\OneDrive\Apps\zo-bot.com\mcp-server` | its half of 4 |

These are **separate git repos**, not a monorepo. mcp-server reaches travel-app over
localhost HTTP, never the database directly; `BASES.travel` defaults to
`http://localhost:3001/travel`.

> **Port trap.** `3001` is the **VPS** port. Local travel-app dev runs on **3000**, so local
> MCP testing needs `TRAVEL_URL=http://localhost:3000/travel`. The `/travel` suffix is
> mandatory — travel-app runs with Next's `basePath: '/travel'`, so its router requires the
> prefix even on localhost.

---

## The data contract

One new table. Every phase depends on these names.

```sql
CREATE TABLE IF NOT EXISTS trip_legs (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  place TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  resolved_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

| Column | Meaning |
|---|---|
| `place` | What Chris typed — the geocoder input. `"Port Angeles, WA"` |
| `start_date` / `end_date` | Inclusive `YYYY-MM-DD`. A one-night stay has `start_date = end_date` |
| `latitude` / `longitude` | Cached geocode. `NULL` means "not yet resolved, or the last attempt failed" |
| `resolved_name` | The geocoder's display name, e.g. `"Port Angeles, United States"`. What the weather strip captions with. `NULL` until first resolved |
| `sort_order` | Tiebreaker only (see the resolver). Not a display order — legs display by date |

Camel-cased by `camelize()` into `tripId`, `place`, `startDate`, `endDate`, `latitude`,
`longitude`, `resolvedName`, `sortOrder`.

### Rule 1 — changing `place` invalidates the geocode

**Any write that changes `place` must set `latitude`, `longitude` and `resolved_name` back
to `NULL` in the same `UPDATE`.** Otherwise editing "Seattle" to "Port Angeles" silently
keeps showing Seattle's weather under a Port Angeles label, and it looks like it worked.

This is the single most likely bug in this program. It gets a comment in the code and an
explicit verification step in Phases 1 and 3.

### Rule 2 — the resolver is the only place that answers "where am I on date X"

Lives in `src/lib/legs.ts`, pure, no runtime imports:

```
placeForDate(legs, date, fallback):
  covering = legs where startDate <= date <= endDate
  if covering is empty        -> fallback          (the trip's destination)
  if covering has one         -> that leg
  otherwise                   -> the leg with the greatest startDate;
                                 ties broken by greater sortOrder, then greater id
```

**Why "greatest `startDate` wins":** on the day you drive Seattle → Port Angeles both legs
cover the date, and the useful forecast is the place you are heading, not the one you left
at 9am.

**Gaps fall back to `trips.destination`** rather than forward-filling from the leg that just
ended. That keeps `end_date` meaningful and makes an accidental gap visible instead of
silently papered over.

Overlaps and gaps are both **allowed**. The UI warns; nothing rejects them. A travel day
that belongs to two legs is normal, and refusing to save a half-finished list would be worse
than showing a warning.

### Rule 3 — legs never bump `trips.updated_at`

`src/app/trips/[tripId]/page.tsx:51` passes `key={trip.updatedAt}` to `<ItineraryDocument>`.
Bumping `trips.updated_at` remounts the entire client tree and throws away open forms,
selections, and the mobile tab. The same trap already applies to the trip brief.

The weather strip still has to notice a legs change. It does so through a `legsVersion`
prop, not through `trips.updated_at` — see below.

### How the weather strip learns that legs changed

`TripWeather` is rendered by `page.tsx` as a **sibling** of `ItineraryDocument`, so it
cannot be notified through props from the legs editor. The wiring is:

1. `page.tsx` computes `legsVersion` — `MAX(updated_at)` over the trip's legs, `''` if none —
   and passes it to `<TripWeather tripId={tripId} legsVersion={legsVersion} />`.
2. `TripWeather`'s fetch effect lists `legsVersion` in its dependency array.
3. After any successful legs write, the editor calls `router.refresh()`.

`router.refresh()` re-runs the server component, `legsVersion` changes, the effect refetches.
`trip.updatedAt` is untouched, so `ItineraryDocument` does not remount. Phase 2 adds the prop;
Phase 3 adds the `router.refresh()` call.

---

## Conventions each phase must honour

**travel-app** (Phases 1–3)

- Data access is raw `better-sqlite3` — no ORM. `db.prepare(...)` inline in routes and server
  components. `camelize<T>` / `camelizeAll<T>` from `@/db` convert snake_case rows.
- Route handlers wrap in `withErrorHandling` from `src/lib/api-helpers.ts`, which turns
  `SyntaxError` into a 400 and anything else into a 500. `requireFields` for required-field
  validation.
- `trip_legs` has **no `user_id`**. Ownership is enforced the way `trip_hotels` does it: look
  the parent trip up with `AND user_id = ?` first and 404 if it is missing, then operate on
  the child rows. Every single leg route does this — see
  `src/app/api/trips/[tripId]/hotels/route.ts` for the exact shape.
- **Client fetches must go through `apiUrl()`** from `src/lib/api.ts` — it applies
  `NEXT_PUBLIC_BASE_PATH`. A bare `/api/...` fetch breaks in production.
- Write controls are hidden from read-only users via `useReadOnly()` from
  `src/lib/read-only.tsx`. The server-side 403 is automatic: `src/proxy.ts:30` gates every
  unsafe method under `/api`, so the legs routes are covered without new code. Verify it;
  do not re-implement it.
- Tailwind v4, CSS-first (no `tailwind.config.js`). `cn()` from `src/lib/utils.ts`.
- The itinerary document body uses the `stone-*` palette; the shell chrome uses `slate-*`.
  New itinerary panels are `stone-*`.
- Zod here is **v4**. mcp-server is on v3 — do not carry idioms across.
- This is **not** the Next.js in your training data (see `AGENTS.md`). Check
  `node_modules/next/dist/docs/` before reaching for an API you half-remember.

**Testing.** There is no test runner and no `npm test` script. Verification is
`npm run build`, `npm run lint`, curl against a local dev server, and the manual checklist in
`TESTING.md`. The one exception this program adds: `src/lib/legs.ts` is pure and gets a real
unit test at `src/lib/legs.test.mjs`, run with `node --test src/lib/legs.test.mjs`. Node 24 is
installed and strips types natively, so an `.mjs` test **can** `import { placeForDate } from
'./legs.ts'` — provided `legs.ts` uses only erasable syntax (no `enum`, no constructor
parameter properties) and has **no runtime imports** (`import type` is fine; it is erased).
Path aliases like `@/types/travel` do not resolve under `node --test`, so use `import type`
for them or inline the shape.

**mcp-server** (Phase 4 only)

- Single-file Express + MCP SDK server. `server.tool(name, description, zodRawShape, handler)`
  — the **4-arg** form, third argument a **raw zod shape object**, not `z.object(...)`.
- Zod is **v3** here.
- Two scopes: `full` (Chris) and `genealogy` (a family member, 7 tools). **Nothing in this
  program may change what the `genealogy` scope sees.** Verify it explicitly.

---

## Phase map

| Phase | Doc | Repo | Summary |
|---|---|---|---|
| 1 | `01-schema-and-api.md` | travel-app | `trip_legs` table, `TripLeg` type, the resolver + its unit test, CRUD routes, duplicate-trip support. No UI, no weather change |
| 2 | `02-weather-by-leg.md` | travel-app | Weather route resolves per leg with cached geocodes; `TripWeather` renders grouped segments |
| 3 | `03-legs-editor-ui.md` | travel-app | The "Where you'll be" panel, suggest-from-hotels, read-only gating |
| 4 | `04-mcp-deploy-and-docs.md` | both | `leg` kind in the MCP registry, deploy both apps, operational docs |

Run them in order, in separate sessions. Append a report to `PROGRESS.md` at the end of each.

---

## What success looks like

The acceptance test for the whole program, run in Phase 3 and again against production in
Phase 4:

> Open a trip that spans two cities. Add two legs — Seattle for the first two days, Port
> Angeles for the rest. The weather strip immediately shows two captioned groups with
> genuinely different forecasts, without a page reload and without the itinerary below it
> remounting. Change the second leg's place to a third city; the forecast changes to match.

If that works, the feature works. Everything else is plumbing.
