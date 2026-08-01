# Phase 1 — Schema and API

**Repo:** travel-app. **Read `00-overview.md` first.**

Builds the `trip_legs` table, the `TripLeg` type, the date resolver and its unit test, the
CRUD routes, and duplicate-trip support. **No UI. No change to the weather route** — that is
Phase 2. At the end of this phase the app looks identical in a browser; everything is
verified by `node --test` and curl.

---

## 1. Migration

`src/db/migrations.ts`. The newest migration at the time of writing is `006_trip_brief`, so
this is `007_trip_legs` — **check the array before picking the number**, another program may
have landed one in between.

Unlike `004`–`006`, this migration creates a table rather than adding columns, so
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` are already idempotent.
**Do not add a `runCustomMigration` branch.** That helper exists only because
`ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` form in SQLite. Adding a branch here would
be cargo-culting.

```js
{
  name: '007_trip_legs',
  sql: `
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

    CREATE INDEX IF NOT EXISTS idx_trip_legs_trip ON trip_legs (trip_id, start_date);
  `,
},
```

The `ON DELETE CASCADE` matters: deleting a trip must take its legs with it. Verify that it
actually fires — check whether this database has `PRAGMA foreign_keys` on. If it does not,
say so in the report and delete legs explicitly in the trip DELETE route rather than
assuming the cascade.

## 2. Type

`src/types/travel.ts`, after `TripDay`:

```ts
export interface TripLeg {
  id: string;
  tripId: string;
  /** What the traveller typed — the geocoder input. */
  place: string;
  startDate: string;          // inclusive YYYY-MM-DD
  endDate: string;            // inclusive YYYY-MM-DD
  /** Cached geocode. NULL until first resolved, or after `place` changes. */
  latitude: number | null;
  longitude: number | null;
  /** The geocoder's display name, e.g. 'Port Angeles, United States'. */
  resolvedName: string | null;
  /** Tiebreaker for overlapping legs only — legs display in date order. */
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}
```

## 3. The resolver — `src/lib/legs.ts`

The single answer to "where am I on date X". Rule 2 in `00-overview.md` is the spec; this is
the implementation contract.

**Constraints on this file** (they are what make it unit-testable under `node --test`):

- **No runtime imports.** `import type { TripLeg } from '@/types/travel'` is fine — type-only
  imports are erased by Node's type stripping. A value import of anything, especially a
  `@/`-aliased module, will fail to resolve when Node runs the test.
- **Erasable syntax only.** No `enum`, no constructor parameter properties.
- Pure functions. No `Date.now()`, no I/O.

Export at least:

```ts
/** The leg covering `date`, or null if none does. See docs/trip-legs/00-overview.md rule 2. */
export function legForDate(legs: TripLeg[], date: string): TripLeg | null;

/** Display place for `date`: the covering leg's resolvedName ?? place, else `fallback`. */
export function placeForDate(legs: TripLeg[], date: string, fallback: string): string;

/** Contiguous runs of dates sharing one leg, in date order. Phase 2 renders these. */
export function segmentDates(
  legs: TripLeg[],
  dates: string[],
  fallback: string,
): { leg: TripLeg | null; place: string; dates: string[] }[];

/** Non-blocking problems to surface in the editor. Never used to reject a write. */
export function legWarnings(
  legs: TripLeg[],
  tripStartDate: string,
  tripEndDate: string,
): { legId: string | null; kind: 'overlap' | 'gap' | 'outside-trip' | 'reversed'; message: string }[];
```

`segmentDates` is what makes Phase 2 simple: hand it the forecast's date list and it returns
the groups to render. A run breaks when the resolved leg changes, **including** when it
changes from a leg to the fallback and back — two separate Seattle stays with a Port Angeles
stay between them are three segments, not two.

### The unit test — `src/lib/legs.test.mjs`

`node --test src/lib/legs.test.mjs`. Follow the `node:test` + `node:assert/strict` style of
`src/appShell/destinations.test.mjs`, but import the module for real rather than regexing its
source. Cover at minimum:

| Case | Expected |
|---|---|
| No legs | `placeForDate` returns the fallback for every date |
| One leg covering the date | that leg |
| Date before the first leg / after the last | fallback |
| Gap between two legs | fallback for the gap dates |
| **Two legs both covering a date** | the one with the greater `startDate` |
| Two legs, same `startDate`, both covering | the greater `sortOrder` |
| Same `startDate` and same `sortOrder` | the greater `id` — deterministic, never arbitrary |
| One-day leg (`startDate === endDate`) | covers exactly that date |
| Leg with `endDate < startDate` | covers nothing; `legWarnings` reports `reversed` |
| `segmentDates` across a leg boundary | two groups, correct split point |
| `segmentDates` for Seattle → Port Angeles → Seattle | **three** groups |
| Legs passed in scrambled order | same result as sorted input |

The overlap tiebreak cases are the point of this test. They are the rule most likely to be
"simplified" by a later change, and the one whose breakage is least visible.

## 4. Routes

Mirror `src/app/api/trips/[tripId]/hotels/route.ts` and
`src/app/api/trips/[tripId]/hotels/[hotelId]/route.ts` exactly — same ownership check, same
`withErrorHandling` wrapper, same `camelize`/`camelizeAll` on the way out, same status codes.

### `GET /api/trips/{tripId}/legs`

`200` with `TripLeg[]` ordered by `start_date ASC, sort_order ASC`. `404` if the trip is not
the caller's.

### `POST /api/trips/{tripId}/legs`

Body: `{ place, startDate, endDate, sortOrder? }`. `requireFields(body, ['place', 'startDate', 'endDate'])`.

- `place` is trimmed; reject empty-after-trim with a 400.
- `startDate` and `endDate` must match `/^\d{4}-\d{2}-\d{2}$/` — 400 otherwise.
- `endDate < startDate` → **400**. This one *is* rejected; it is a typo, not a judgement call.
  Overlaps, gaps and dates outside the trip range are all **accepted** (see rule 2).
- `latitude`, `longitude`, `resolvedName` are **not accepted from the body**. They are
  derived state owned by the weather route. Ignore them silently if present.
- `sortOrder` defaults to `0`.
- `201` with the created row.

### `PATCH /api/trips/{tripId}/legs/{legId}`

Accepts any of `place`, `startDate`, `endDate`, `sortOrder`. Same validation as POST for any
field present. `404` if the leg does not belong to a trip owned by the caller — join through
`trips`, do not trust `legId` alone.

**Rule 1 lives here.** If `place` is present in the body and differs from the stored value
(after trimming), the same `UPDATE` must also set `latitude = NULL, longitude = NULL,
resolved_name = NULL`. Put a comment on it:

```ts
// Changing the place invalidates the cached geocode. Clearing these in the same UPDATE is
// what stops the weather strip showing the old city's forecast under the new city's label.
// See docs/trip-legs/00-overview.md, rule 1.
```

Read the existing row first so you can compare — a PATCH that resends the *same* place must
**not** clear the cache, or every save costs a fresh geocode.

### `DELETE /api/trips/{tripId}/legs/{legId}`

`204`. Same ownership join.

### All four routes

Set `updated_at` on the leg. **Do not touch `trips.updated_at`** — rule 3. Add a short
comment saying why, because "the parent's timestamp should reflect child changes" is exactly
the reasonable-sounding change that would break the trip page.

## 5. Duplicate a trip

`src/app/api/trips/[tripId]/duplicate/route.ts` copies every child table inside one
transaction. Add legs, following the shape of the hotels block:

- New `id`, new `trip_id`, `created_at`/`updated_at` set to `now`.
- Copy `place`, `start_date`, `end_date`, `sort_order`.
- **Copy `latitude`, `longitude`, `resolved_name` too.** They are a cache of a pure function
  of `place`; it is the same place, so the cache is still valid. (This differs from the
  brief, where `planning_notes_previous` is deliberately *not* copied — that is undo history,
  which is per-trip. A geocode is not history.)

## 6. What this phase must NOT touch

- `src/app/api/trips/[tripId]/weather/route.ts` — Phase 2.
- `src/components/itinerary/TripWeather.tsx` — Phase 2.
- Any component. There is no UI in this phase.
- The `colMap` in `src/app/api/trips/[tripId]/route.ts`. Legs are rows, not trip fields.
- `mcp-server/` — Phase 4. You may read it.

---

## Verification

Back up first: `cp local.db local.db.bak`. This runs against Chris's real local database.

Run the dev server (`npm run dev`, port **3000**, base path `/travel`) and use a real trip id
from `local.db`.

1. `node --test src/lib/legs.test.mjs` — all cases pass.
2. Restart the dev server twice; `SELECT name FROM schema_migrations` shows exactly one
   `007_trip_legs` row and `PRAGMA table_info(trip_legs)` shows all eleven columns. The
   migration is idempotent.
3. `GET .../legs` on a trip with no legs → `200 []`.
4. `POST` a valid leg → `201`, `latitude`/`longitude`/`resolvedName` all `null`.
5. `POST` with `endDate` before `startDate` → `400`, nothing inserted.
6. `POST` with `place: "   "` → `400`.
7. `POST` with `startDate: "8 Aug 2026"` → `400`.
8. `POST` including `latitude: 47.6` → `201` and the stored latitude is still `NULL`.
9. `POST` a second leg that overlaps the first → `201`. Overlaps are legal.
10. `GET` → both legs, ordered by `start_date`.
11. Set coordinates by hand
    (`UPDATE trip_legs SET latitude=47.6, longitude=-122.3, resolved_name='Seattle' WHERE id=…`),
    then `PATCH` the leg's `place` to something else → re-`GET` shows all three back to `null`.
    **This is rule 1; prove it with a re-GET, not by reading the code.**
12. Set the coordinates again, then `PATCH` sending the **same** `place` → coordinates
    survive.
13. Set the coordinates again, then `PATCH` only `endDate` → coordinates survive.
14. `PATCH` a leg id belonging to a different trip → `404`, and the leg is unchanged.
15. `DELETE` → `204`; a second `DELETE` of the same id → `404` or `204`, but never a 500.
16. Note the trip's `updated_at`, run a POST + PATCH + DELETE, re-read it → **unchanged**
    (rule 3).
17. Duplicate a trip with two legs → the copy has two legs with new ids, the same places and
    dates, and the cached coordinates carried over.
18. Delete a trip that has legs → `SELECT COUNT(*) FROM trip_legs WHERE trip_id = …` is `0`.
    If it is not, foreign keys are off; handle it in the route and report it.
19. `npm run build` and `npm run lint` are clean (11 pre-existing lint warnings are expected).
20. Remove every leg and trip you created for testing; leave `local.db` as you found it.

**Done when:** every step above passes, and a browser hitting the trip page looks exactly as
it did before this phase.

Then append a Phase 1 report to `PROGRESS.md`, update its Status blockquote, and run
`node tools/project-status.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com`.
