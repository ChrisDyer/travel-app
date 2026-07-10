# PHASE 3 — Client State Sync: One Source of Truth for Bookings

> **Read `docs/fixes/README.md` first** for global conventions. **Do this phase after Phases 1–2.**

## Why this phase exists

The trip detail page has TWO copies of every booking collection:

- `src/components/itinerary/ItineraryDocument.tsx:31-37` — `useState(initialFlights)` etc. (drives the day timeline, map, cost summary, cancellation deadlines).
- `src/components/itinerary/KeyBookings.tsx:105-109` — its **own** `useState(initialFlights)` etc., seeded from the same props.

`KeyBookings` reports its edits upward via `onFlightsChange`/... (`KeyBookings.tsx:128-132`), so parent state follows KeyBookings — but **nothing flows back down**. Consequences the user experiences as "editing doesn't work":

- Edit/delete a flight, hotel, parking, or rental car from the **day timeline** (`ItineraryDocument.tsx:253-303`) → the Key Bookings panel keeps showing the old (or deleted) item until a full page reload.
- Bookings added by the **Trip Assistant** (`ItineraryDocument.tsx:159-168`) appear in the timeline but never in Key Bookings.
- After editing the trip (dates!), `TripHeaderActions` calls `router.refresh()` (`TripHeaderActions.tsx:38`) — but `useState(initialX)` ignores new props, so added/removed days don't appear without a hard reload.

Also: **transit** entries are invisible in the day timeline entirely (only reachable via the collapsed Key Bookings panel), while the print page already places them on days (`src/app/trips/[tripId]/print/page.tsx:95-97,142-146`).

## Issues fixed in this phase

| ID  | Issue | Where |
|-----|-------|-------|
| 3.1 | KeyBookings duplicate state → stale/ghost bookings after timeline edits; assistant additions missing | `KeyBookings.tsx:105-109,128-132` |
| 3.2 | `router.refresh()` never re-seeds client state → date edits don't update day sections | `ItineraryDocument.tsx:31-37`, `[tripId]/page.tsx:59` |
| 3.3 | Transit not shown/editable in the day timeline | `ItineraryDocument.tsx`, `DaySection.tsx` |

---

## Step 1 — Make KeyBookings fully controlled

**File: `src/components/itinerary/KeyBookings.tsx`**

1a. Change the props interface (lines 17-31): rename the five data props and keep the callbacks:

```ts
interface KeyBookingsProps {
  tripId: string;
  travelMode: 'fly' | 'drive';
  rentalCarNeeded: boolean;
  flights: TripFlight[];
  hotels: TripHotel[];
  parking: TripParking[];
  rentalCars: TripRentalCar[];
  transit: TripTransit[];
  onFlightsChange: (flights: TripFlight[]) => void;
  onHotelsChange: (hotels: TripHotel[]) => void;
  onParkingChange: (parking: TripParking[]) => void;
  onRentalCarsChange: (rentalCars: TripRentalCar[]) => void;
  onTransitChange: (transit: TripTransit[]) => void;
}
```

1b. Update the destructuring in the function signature (lines 99-104) to match (`flights, hotels, parking, rentalCars, transit` instead of `initialFlights, ...`).

1c. **Delete** the five collection `useState` lines (105-109) and the five `updateX` wrapper functions (128-132). All dialog/editing/open state (lines 111-126) stays.

1d. Rewrite the five `handleXSaved` functions (lines 134-153) and the inline `onDeleted` callbacks (lines 440, 446, 452, 458, 464) to call the `onXChange` props directly, computing the next array from the **props**. Pattern (apply the same shape to all five entities):

```ts
function handleFlightSaved(f: TripFlight, isNew: boolean) {
  onFlightsChange(isNew ? [...flights, f] : flights.map((x) => x.id === f.id ? f : x));
  setEditingFlight(null); setAddingFlight(false);
}
```

and for deletes:

```tsx
onDeleted={(id) => { onFlightsChange(flights.filter((x) => x.id !== id)); setEditingFlight(null); }}
```

Everything else in the file (rendering, print section) already reads `flights`/`hotels`/... variables, so it keeps working once those names are props instead of state.

1e. **File: `src/components/itinerary/ItineraryDocument.tsx:180-194`** — update the call site:

```tsx
<KeyBookings
  tripId={trip.id}
  travelMode={trip.travelMode}
  rentalCarNeeded={trip.rentalCarNeeded}
  flights={flights}
  hotels={hotels}
  parking={parking}
  rentalCars={rentalCars}
  transit={transit}
  onFlightsChange={setFlights}
  onHotelsChange={setHotels}
  onParkingChange={setParking}
  onRentalCarsChange={setRentalCars}
  onTransitChange={setTransit}
/>
```

(The `onXChange={setX}` wiring already exists — only the data props change from `initialX={initialX}` to live state.)

## Step 2 — Remount on server refresh

**File: `src/app/trips/[tripId]/page.tsx:59`** — give the client tree a key derived from the trip's `updatedAt`:

```tsx
<ItineraryDocument
  key={trip.updatedAt as string}
  trip={trip}
  ...
/>
```

Every trip PATCH bumps `updated_at` (`src/app/api/trips/[tripId]/route.ts:26-27`), and `TripHeaderActions` already calls `router.refresh()` after saving (`TripHeaderActions.tsx:38`). With the key, the refresh remounts `ItineraryDocument` with fresh server props, so date changes show new/removed day sections immediately.

**Known tradeoff (accept it, don't fight it):** the remount closes any open dialogs inside `ItineraryDocument` when a *trip-level* edit is saved. Booking edits don't bump the trip row, so day-to-day editing is unaffected.

Also apply the same `key={trip.updatedAt}` idea is NOT needed for `PackingChecklist` (its data isn't affected by trip edits) — leave it alone.

## Step 3 — Transit in the day timeline

Mirror how parking is wired; the print page proves the day-mapping logic (`print/page.tsx:95-97`).

3a. **`src/components/itinerary/ItineraryDocument.tsx`**

- Add state next to the other editors (line 43): `const [editingTransit, setEditingTransit] = useState<TripTransit | null>(null);`
- Add the day mapper next to `rentalCarsForDay` (line 100):

```ts
function transitForDay(date: string) {
  return transit.filter((t) => t.departureDate === date);
}
```

- Pass to `DaySection` (inside the `days.map` at line 218): `dayTransit={transitForDay(day.date)}` and `onEditTransit={(t) => setEditingTransit(t)}`.
- Add the dialog after the `editingRentalCar` block (lines 292-303), copying its exact shape:

```tsx
{editingTransit && (
  <TransitForm
    tripId={trip.id}
    transit={editingTransit}
    onSaved={(t, isNew) => {
      setTransit((prev) => isNew ? [...prev, t] : prev.map((x) => x.id === t.id ? t : x));
      setEditingTransit(null);
    }}
    onDeleted={(id) => { setTransit((prev) => prev.filter((x) => x.id !== id)); setEditingTransit(null); }}
    onClose={() => setEditingTransit(null)}
  />
)}
```

- Import `TransitForm` from `'./TransitForm'` (the file already imports the other forms at lines 10-13).

3b. **`src/components/itinerary/DaySection.tsx`**

- Props (lines 11-27): add `dayTransit: TripTransit[];` and `onEditTransit: (transit: TripTransit) => void;`; import `TripTransit` from `@/types/travel` (line 4).
- `TimelineItem` union (lines 45-50): add `| { kind: 'transit'; time: string | null; transit: TripTransit }`.
- Timeline build (the array at lines 71-96): add

```ts
...dayTransit.map((t) => ({ kind: 'transit' as const, time: t.departureTime ?? null, transit: t })),
```

- Rendering: add a `transit` branch alongside the others (e.g. after the `rentalCar` branch, line 209-229), copying the rentalCar card's structure with transit fields. Use the emoji map that `KeyBookings.tsx:95-97` uses (`train 🚆, bus 🚌, ferry ⛴️, subway 🚇, shuttle 🚐, taxi 🚕, rideshare 🚗, other 🚌` — copy that const into DaySection or export it from a shared spot):

```tsx
if (item.kind === 'transit') {
  const t = item.transit;
  return (
    <div key={`transit-${t.id}-${i}`} className="relative pl-8 group cursor-pointer" onClick={() => onEditTransit(t)}>
      <div className="absolute left-0 top-3 w-3 h-3 rounded-full bg-white border-2 border-slate-300 group-hover:border-slate-500 transition-colors" />
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition-all">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm shrink-0">{t.transitType ? (transitTypeIcon[t.transitType] ?? '🚌') : '🚌'}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">
                {t.operator}
                {t.routeNumber && <span className="text-stone-400 font-normal ml-1.5 text-xs">{t.routeNumber}</span>}
              </p>
              <p className="text-xs text-slate-600">
                {t.fromLocation}{t.fromLocation && t.toLocation ? ' → ' : ''}{t.toLocation}
              </p>
            </div>
          </div>
          {item.time && <span className="text-sm font-semibold text-stone-700 shrink-0">{fmt12(item.time)}</span>}
        </div>
      </div>
    </div>
  );
}
```

- Update the destructured props in the function signature (line 52) to include `dayTransit` and `onEditTransit`.

## Verification

1. `npx tsc --noEmit` and `npm run lint` pass.
2. `npm run dev`, open a trip with a flight and a hotel. Expand Key Bookings sections.
3. From the **day timeline**, click the flight and change its time → Save. The Key Bookings flight card shows the new time **without reload**. (Was broken.)
4. From **Key Bookings**, delete the hotel → it disappears from both the panel and the day timeline.
5. Open the Trip Assistant, apply a suggested booking → it appears in Key Bookings immediately. (Was broken.)
6. Edit the trip → extend end date by 2 days → Save. New day sections appear **without a hard reload**. (Was broken.)
7. Add a transit entry (Key Bookings → Transit → + Transit) with a departure date inside the trip → it appears on that day in the timeline; clicking it opens the edit dialog; the printed view still shows it (unchanged).
8. Regression: add/edit/delete an event; edit day title; nothing else changed behavior.

## Done when

- All verification steps pass.
- `KeyBookings.tsx` contains **no** `useState<Trip...[]>` collection state (grep the file for `useState<Trip` — only dialog state remains, which uses `useState<TripFlight | null>` etc. for the item being edited; the five ARRAY states must be gone).
- Timeline and Key Bookings can never disagree, because both render the same five arrays owned by `ItineraryDocument`.
