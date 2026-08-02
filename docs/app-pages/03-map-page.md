# Phase 3 — Map page

**Repo:** travel-app, plus one comment in mcp-server.
**Read `00-overview.md` first — this phase is where rules 1, 2 and 3 live.**

Puts every trip on one map. Adds a geocode cache to `trips` mirroring the one on `trip_legs`,
extracts the geocoder both now share, and adds `/map` plus its nav row.

This is the phase most likely to ship a silent bug. The bug is always the same one: a stale
cached coordinate under a new place name.

---

## 1. Migration `008_trip_geocode`

`src/db/migrations.ts`. The newest migration at the time of writing is `007_trip_legs` — **check
the array before picking the number**, another program may have landed one in between.

```js
{
  name: '008_trip_geocode',
  sql: `
    ALTER TABLE trips ADD COLUMN latitude REAL;
    ALTER TABLE trips ADD COLUMN longitude REAL;
    ALTER TABLE trips ADD COLUMN resolved_name TEXT;
  `,
},
```

Unlike `007`, this is `ALTER TABLE ADD COLUMN`, which has **no `IF NOT EXISTS` form in
SQLite**. So it also needs the idempotent hand-written branch in `runCustomMigration()` using
`addColumnIfMissing()` — the convention `004`, `005` and `006` follow, and the reason
`007` correctly did *not*. Read those three before writing this one; matching the wrong
precedent is the easy mistake here.

Add the three fields to `Trip` in `src/types/travel.ts`, with a comment saying they are a
derived cache of `destination`, filled only by `/api/map`:

```ts
/** Cached geocode of `destination`. NULL until first resolved, or after `destination` changes. */
latitude: number | null;
longitude: number | null;
/** Geocoder display name, e.g. 'Paris, France'. Written only by GET /api/map. */
resolvedName: string | null;
```

## 2. Rule 1 — invalidation in the trip PATCH

`src/app/api/trips/[tripId]/route.ts`. This is the change that makes the whole cache safe.

The `before` SELECT at line 21 currently reads only `start_date, end_date`. **Add
`destination`.** Then, after the `colMap` loop, if `destination` is present in the body and
differs from the stored value, append `latitude = NULL, longitude = NULL, resolved_name = NULL`
to the same `setClauses`.

Comment it, following `src/app/api/trips/[tripId]/legs/[legId]/route.ts:41-46`:

```ts
// Changing the destination invalidates the cached geocode. Clearing these in the same UPDATE
// is what stops the map pin sitting on the old city under the new city's label.
// See docs/app-pages/00-overview.md, rule 1.
```

Two halves, both required:

- A PATCH that **changes** `destination` clears all three.
- A PATCH that resends the **same** `destination` (which the trip edit form does on every
  save) must **not** clear them, or every trip edit costs a fresh geocoding call.

Do **not** add the three columns to `colMap`. They are derived state and are never accepted
from a request body.

## 3. `src/lib/geocode.ts` — one geocoder, two callers

`src/app/api/trips/[tripId]/weather/route.ts:38-46` has a private `geocode()`: Open-Meteo's
free `geocoding-api.open-meteo.com/v1/search?name=…&count=1`, no API key, a 5-second
`AbortSignal.timeout`, and a `displayName()` helper that appends the country.

Move both into `src/lib/geocode.ts` unchanged:

```ts
export interface GeocodeResult { latitude: number; longitude: number; name: string; }
export async function geocodePlace(placeName: string): Promise<GeocodeResult | null>;
```

Then have the weather route import it and delete its local copy. **The weather route's
behaviour must not change** — same URL, same timeout, same `null` on failure, same display
name format. This is a pure extraction; if you find yourself improving it, stop.

Unlike `src/lib/legs.ts`, this module does I/O and gets no `node --test` unit test.

## 4. `GET /api/map`

New route, `src/app/api/map/route.ts`. Rule 2 in `00-overview.md`: **this is the only code that
writes `trips.latitude`/`longitude`/`resolved_name`.**

Returns every trip owned by the caller:

```json
{
  "trips": [{
    "id": "…", "title": "…", "destination": "…",
    "startDate": "2026-08-08", "endDate": "2026-08-15", "status": "planning",
    "latitude": 38.89, "longitude": -77.03, "resolvedName": "Washington, United States",
    "legs": [{ "id": "…", "place": "…", "latitude": …, "longitude": …, "resolvedName": "…" }]
  }]
}
```

- Trips with no coordinates yet are geocoded lazily via `geocodePlace(trip.destination)` and
  the result written back.
- **Cap geocodes per request at 10**, mirroring `MAX_LOCATIONS = 8` in the weather route.
  Trips past the cap are returned with `latitude: null`; the next load fills more. This keeps
  a first visit with 40 trips from making 40 serial calls to a free API.
- A failed geocode leaves the columns `NULL` and returns the trip anyway — the side list still
  shows it, it just has no pin. Do not write sentinel coordinates.
- **Legs are read-only here.** Include legs that already have coordinates (so a multi-city trip
  shows its stops), but never geocode a leg from this route — that stays the weather route's
  job. Rule 2 cuts both ways.
- Rule 3: the cache `UPDATE` **must not touch `trips.updated_at`**. Comment it, referencing
  the same reasoning as `weather/route.ts:141`. Bumping it remounts `<ItineraryDocument>` on
  the trip page.
- Wrap in `withErrorHandling`. Scope by `getUserId(request)`.
- `GET` only. No `POST`, no manual "re-geocode" endpoint — invalidation is automatic via §2.

## 5. `src/components/map/TripsMap.tsx`

A **new** client component. Do not modify `src/components/itinerary/TripMap.tsx`: it is
trip-scoped, geocodes client-side through the Google `Geocoder` in a one-shot effect guarded by
`geocodedRef`, and hardcodes `height: '500px'`. Feeding it server-supplied pins would fight
that effect.

Reuse its *shape*, which is proven to work in this app:

- `useJsApiLoader({ googleMapsApiKey, libraries })` where `libraries` is the **same
  `['places']` const**. `@react-google-maps/api` throws a loader conflict if two components
  mount with different `libraries` arrays, and `PlacesInput.tsx` also uses `['places']`.
  Export the constant from one place if that is cleaner than repeating it.
- `GoogleMap` + `Marker` + `InfoWindow`, `fitBounds(bounds, 60)` for multiple pins,
  `setZoom(14)` for one — see `fitPins()` at `TripMap.tsx:50`.
- `options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}`.

Differences:

- Pins come from `/api/map` (through `apiUrl()`), already geocoded. **No client-side
  geocoding.**
- Marker colour by timing, using `tripTiming()` / `localToday()` from `src/lib/trip-status.ts`:
  grey for trips that have ended, blue (`#2563eb`, the app's active colour) for in-progress and
  upcoming.
- `InfoWindow` shows title, formatted date range, and a **`next/link` to `/trips/{id}`**.
- A side list paired with the map: every trip, including ones with no pin. Clicking a row pans
  and opens its InfoWindow; the map and list stay in sync from one piece of state.
- A filter: **All / Upcoming / Past**, applied to both the map and the list.
- Full-height-ish map (e.g. `h-[70vh]` with a sensible min), not a fixed 500px, since this is
  the whole page.

**No API key.** `TripMap` returns `null` when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unset
(`TripMap.tsx:115`). A whole page cannot do that. Render an explicit panel — "Map unavailable:
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set" — and **keep the side list rendering**, so the page
is still useful. Same for `loadError`.

## 6. The page and its nav row

- `src/app/map/page.tsx` — server component in `<TravelShell title="Map" …>`, rendering
  `<TripsMap />`. `slate-*` palette.
- **Add the `map` nav row to `TravelShell`** — the `Explore` section, `MapIcon`, href `/map` —
  and its assertion to `src/appShell/destinations.test.mjs`, plus `map/page.tsx` in the
  "interactive Travel routes use the shared shell" loop. Phase 1 deliberately left this out so
  the sidebar never advertised a 404.
- Empty state: no trips at all → a short line and a link to `/trips/new`.

## 7. mcp-server

`mcp-server/travel-write.js` mirrors the writable `colMap` field lists. The three new columns
are **derived cache and must NOT be added to `TRIP_FIELDS`.** Add a comment saying so,
following the `planningNotes` exclusion precedent already in that file:

```js
// latitude/longitude/resolvedName are deliberately absent: they are a cache of a geocode of
// `destination`, written only by GET /api/map and cleared whenever `destination` changes.
// Writing them directly would pin a trip to a city it is not in.
```

That is the entire mcp-server change. Do not touch the tool registry, the scopes, or anything
the `genealogy` scope can see.

## 8. What this phase must NOT touch

- `src/components/itinerary/TripMap.tsx` — read it, copy its patterns, leave it alone.
- The weather route's behaviour (§3 is a pure extraction).
- `trip_legs` writes of any kind.
- `src/app/page.tsx` — Phase 2 finished it.
- The `colMap` in the trip PATCH route (add the invalidation, not the columns).
- Google Places / `PlacesInput.tsx`.

---

## Verification

**Back up first — see the WAL-safe backup command in `00-overview.md`; `cp` is not a valid
backup here.** This phase writes to Chris's real database.

Run `npm run dev` (port **3000**, base path `/travel`).

1. Restart the dev server **twice**. `SELECT name FROM schema_migrations` shows exactly one
   `008_trip_geocode` row, and `PRAGMA table_info(trips)` shows the three new columns exactly
   once. The migration is idempotent.
2. `curl -s localhost:3000/travel/api/map` → all five trips. First call fills coordinates.
3. `SELECT id, destination, latitude, longitude, resolved_name FROM trips` → coordinates are
   populated and plausible (Paris ≈ 48.85/2.35, Washington ≈ 38.9/-77.0).
4. Call `/api/map` **again** and watch the terminal: **no outbound geocoding requests**. The
   cache is being used.
5. **Rule 1, the one that matters.** Note a trip's cached coordinates, then PATCH its
   `destination` to a different city. Re-`SELECT` → all three columns are `NULL`. Reload
   `/travel/map` → **the pin has moved to the new city.** Prove this in the browser, not by
   reading the code.
6. PATCH the **same** `destination` value again → coordinates survive. (Then do it through the
   trip edit dialog in the UI, which resends every field — the same must hold.)
7. PATCH only `title` → coordinates survive.
8. Note `trips.updated_at`, delete a trip's coordinates by hand, hit `/api/map`, re-read
   `updated_at` → **unchanged** (rule 3). Then open `/travel/trips/{id}`, expand a booking
   form, and confirm nothing remounts.
9. A trip whose `destination` geocodes to nothing (set one to `"zzzzz"` temporarily) → the
   route still returns it, it has no pin, and **it still appears in the side list**. Restore it.
10. `/travel/map`: pins for all trips, grey for ended and blue for upcoming, InfoWindow links
    land on the right trip, side-list clicks pan the map, and All/Upcoming/Past filters both
    views together.
11. A trip with legs that already have coordinates shows its leg stops. Do **not** expect
    uncached legs to be geocoded here.
12. Temporarily unset `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and reload → the "Map unavailable"
    panel appears **and the side list still renders**. Restore it.
13. Confirm the trip page's own map (`/travel/trips/{id}`) still works — the shared `libraries`
    array is the thing most likely to have broken it.
14. `node --test src/appShell/destinations.test.mjs` passes with the new `map` assertions.
15. Read-only (`ADMIN_EMAILS` set elsewhere): `/travel/map` renders fully — it is a read-only
    page and nothing should be hidden.
16. `npm run build` and `npm run lint` clean.
17. Restore any destination you changed, restore `ADMIN_EMAILS`, and leave `local.db` correct.

**Done when:** step 5 passes in the browser and step 4 shows no repeat geocoding.

Then append a Phase 3 report to `PROGRESS.md`, update its Status blockquote, and run
`node tools/project-status.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com`.
