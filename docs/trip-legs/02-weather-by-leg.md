# Phase 2 — Weather by leg

**Repo:** travel-app. **Read `00-overview.md` first**, then skim `PROGRESS.md` for what
Phase 1 actually delivered.

Rewrites `src/app/api/trips/[tripId]/weather/route.ts` to return one forecast **segment per
leg**, fills and caches each leg's geocode, and rewrites
`src/components/itinerary/TripWeather.tsx` to render the segments as captioned groups.

A trip with no legs must come out of this phase looking **exactly** as it does today: one
group, one caption, `trips.destination`. That is the regression to watch.

---

## 1. The response shape

The endpoint's only consumer is `TripWeather.tsx` (confirm with a repo-wide grep before you
start — if something else has appeared, stop and say so). There is no back-compat to keep, so
replace the flat `days[]` outright rather than serving both shapes.

```ts
{
  available: boolean,      // true if ANY segment has at least one day
  reason?: string,         // only when available === false
  unit: 'F',
  segments: [
    {
      place: string,            // leg.place, or trip.destination for the fallback segment
      location: string | null,  // resolvedName — the caption. null if geocoding failed
      startDate: string,        // first forecast date in this segment
      endDate: string,          // last
      reason?: string,          // 'location_not_found' | 'no_forecast' — when days is empty
      days: [{ date, tMax, tMin, precip, code }]   // unchanged per-day shape
    }
  ]
}
```

**Partial availability is the normal case, not an edge case.** One leg geocoding while
another fails must still render the one that worked. So:

- `available: true` if any segment has a non-empty `days`.
- `available: false` with a top-level `reason` only when *nothing* resolved: keep today's
  `'too_far_out'`, `'location_not_found'`, `'no_forecast'` and `'error'` values so the
  existing "forecast will appear closer to your trip" copy still has something to key on.
- A segment that failed on its own keeps its `place`, gets `days: []` and its own `reason`.

## 2. The route

Keep what already works: Open-Meteo, keyless, `temperature_unit=fahrenheit`, `timezone=auto`,
the ~16-day horizon, the 5-second `AbortSignal.timeout`, and the whole thing wrapped so a
failure degrades to `{ available: false }` rather than a 500. The weather strip is decoration;
it must never take the trip page down.

New flow:

1. Load the trip (unchanged ownership check) **and** its legs, ordered by `start_date`.
2. Clamp the window exactly as today: `start = max(trip.startDate, today)`,
   `end = min(trip.endDate, today + 15d)`. If `start > end`, return `too_far_out` as today —
   before doing any geocoding or forecasting.
3. Build the date list with `datesBetween(start, end)` from `src/lib/dates.ts` (never
   `new Date(str)` + `toISOString()` on a date-only string — see that file's header).
4. Call `segmentDates(legs, dates, trip.destination)` from Phase 1's `src/lib/legs.ts`. That
   returns the groups. **Do not re-derive the grouping here** — the resolver is the single
   source of truth for it (rule 2).
5. Resolve coordinates per distinct location:
   - A leg with `latitude`/`longitude` already stored: use them, no geocoding call.
   - A leg without: geocode `place`, and on success write `latitude`, `longitude`,
     `resolved_name` back to the row. **This is the only place that writes those columns.**
   - The fallback segment (no leg): geocode `trip.destination` as today, with no cache —
     there is no row to cache it on.
   - On geocode failure, leave the columns `NULL` and give that segment
     `reason: 'location_not_found'`. It will be retried next request; that is accepted.
6. Fetch forecasts and slice each segment's own dates out of the result.
7. **Cap outbound work at 8 distinct locations per request.** Segments beyond the cap get
   `days: []` and `reason: 'too_many_locations'`. A trip with 30 legs must not fan out into 30
   HTTP calls on every page load.

### The cache write-back is a write inside a GET

Deliberate, and worth a comment. It is idempotent, derived entirely from `place`, and
invisible to the user. Note the consequence in the code: this GET is not read-only, so it
must still run under the trip-ownership check (it already does), and it must not bump
`trips.updated_at` (rule 3) or `trip_legs.updated_at` — bumping the leg's timestamp would
change `legsVersion` and put `TripWeather` in a refetch loop. **Write the coordinates with a
statement that does not touch `updated_at`.** This is a real infinite-loop risk; verify it
explicitly.

### One request or several

Open-Meteo may accept comma-separated `latitude`/`longitude` and return an array of results.
**Verify with a real curl before relying on it** — do not take this paragraph as fact:

```
curl "https://api.open-meteo.com/v1/forecast?latitude=47.6,48.1&longitude=-122.3,-123.4&daily=temperature_2m_max&timezone=auto&start_date=2026-08-05&end_date=2026-08-07"
```

If it returns an array, use one request for the whole trip window and slice per segment —
fewer calls, and `timezone=auto` still resolves per location. If it does not, use
`Promise.all` over the distinct locations, each with its own segment's date range. Either is
fine; say which you used and what the curl showed in the report.

Add a small module-level response cache: a `Map` keyed by
`` `${lat},${lon},${start},${end}` ``, 30-minute TTL, **hard-capped at 50 entries** (evict
oldest on insert). It contains no user data. It exists so that remounting the trip page a few
times in a row does not re-hit Open-Meteo.

## 3. `TripWeather.tsx`

Add the `legsVersion` prop and render groups.

```tsx
export function TripWeather({ tripId, legsVersion }: { tripId: string; legsVersion: string })
```

- `legsVersion` goes in the fetch effect's dependency array alongside `tripId`. That is the
  entire mechanism by which the strip refreshes after a legs edit (see `00-overview.md`).
- `src/app/trips/[tripId]/page.tsx` computes it:
  `SELECT MAX(updated_at) FROM trip_legs WHERE trip_id = ?`, `?? ''`. One extra prepared
  statement next to the existing ones at lines 21–28.

Rendering:

- **One segment** — render exactly today's markup: the `Weather · {location}` heading and one
  horizontally scrolling row. A no-legs trip must be pixel-identical to before.
- **Two or more** — one `<h3>` as today, then a stacked group per segment: a small caption row
  (`location ?? place` plus its date range, e.g. `Aug 5 – Aug 6`, via `fmtShortDate` from
  `src/lib/dates.ts`) above that segment's scrolling row of day tiles. Keep the day tile
  markup unchanged — same `w-20`, same emoji, same temperature and precipitation formatting.
- A segment with `days: []` renders its caption and one muted line: "Forecast unavailable"
  for `location_not_found` / `no_forecast`, "Too many locations to forecast" for the cap.
  Never render an empty group with no explanation.
- Keep the whole panel `no-print` and on the `stone-*` palette.
- Escaped React text throughout. `place` is user input; never `dangerouslySetInnerHTML`.

## 4. What this phase must NOT touch

- `src/lib/legs.ts` and its test — Phase 1 owns them. If the resolver is wrong, fix it there
  and add the failing case to `legs.test.mjs`; do not work around it in the route.
- The legs CRUD routes.
- Any editor UI. There is still no way to create a leg from the browser after this phase —
  that is Phase 3, and it is fine.
- `TripMap`, `DaySection`, the packing and assistant prompts. All out of scope
  (`00-overview.md`).

---

## Verification

Back up first: `cp local.db local.db.bak`.

Legs are created with Phase 1's API (curl a POST), since there is no UI yet. Use a trip whose
dates are **inside the next 15 days** or the forecast window will short-circuit and you will
verify nothing — create a scratch trip if Chris has no upcoming one.

1. **Regression, most important:** a trip with **no legs** → the strip is visually identical
   to `main`. Same heading, same caption, same tiles. Compare against a screenshot or a
   second browser tab on the pre-change build.
2. Trip with one leg covering the whole trip → one group, captioned with the leg's place.
3. Trip with two legs (Seattle days 1–2, Port Angeles days 3–5) → two captioned groups, split
   on the right date, with visibly different forecasts.
4. Seattle → Port Angeles → Seattle → **three** groups.
5. Legs leaving a gap in the middle → the gap renders as its own group captioned with the
   trip destination.
6. Overlapping legs on the handover day → that day appears in the **later-starting** leg's
   group, exactly once. It must not appear twice.
7. `SELECT latitude, longitude, resolved_name FROM trip_legs` after the first load → filled.
   Load the page again and confirm no second geocoding call (log it, or watch that
   `resolved_name` does not change and the response returns noticeably faster).
8. **Loop check:** with the trip page open, watch the network tab for 60 seconds. There must
   be exactly one `/weather` request. If `legsVersion` is changing on its own, the write-back
   is touching `trip_legs.updated_at` — fix that, do not paper over it with a ref guard.
9. `UPDATE trip_legs SET place='Nowhere Xyzzy' …` then reload → that segment shows "Forecast
   unavailable", **the other segment still renders normally**, and `available` is still `true`.
10. A trip starting more than 16 days out → the existing "Weather forecast will appear closer
    to your trip" line, unchanged.
11. Kill network access to `api.open-meteo.com` (or point the fetch at an unroutable host
    temporarily) → the trip page still renders fully, the strip is simply absent.
12. A leg entirely outside the forecast window on a trip that is partly inside → that leg
    contributes no segment, and no empty group is rendered.
13. 9 distinct legs → the 9th segment reports `too_many_locations` and the first 8 render.
14. Confirm `trips.updated_at` is unchanged after loading the weather (rule 3), and that the
    itinerary below does not remount — expand a day, reload weather, confirm nothing resets.
15. `npm run build` and `npm run lint` clean.
16. Delete the scratch legs and trip; leave `local.db` as you found it.

**Done when:** every step passes, especially 1, 6 and 8.

Then append a Phase 2 report to `PROGRESS.md` — including which Open-Meteo call shape you
used and what the curl showed — update the Status blockquote, and run
`node tools/project-status.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com`.
