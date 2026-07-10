# PHASE 5 — Dates, Validation, Cost Correctness, Edit-Flow Polish

> **Read `docs/fixes/README.md` first.** Requires Phase 3 (item 5.6 touches KeyBookings props) and Phase 2 (the day-reconcile guard).

## Issues fixed in this phase

| ID  | Issue | Where |
|-----|-------|-------|
| 5.1 | Day generation uses local-midnight `Date` + `toISOString()` → stored day dates shift ±1 on non-UTC servers | `src/app/api/trips/route.ts:26-38`, `src/app/api/trips/[tripId]/route.ts:41-47` |
| 5.2 | No end≥start validation in Flight/Transit/RentalCar/Parking forms (Hotel and both trip forms have it) | those four forms |
| 5.3 | Cost summary counts `note`-category events; FX outage silently kills the grand total & budget bar | `src/components/itinerary/TripCostSummary.tsx:33-43,66-77` |
| 5.4 | Uploading/removing a cover photo mid-edit closes the Edit dialog and discards unsaved field edits | `TripEditForm.tsx:170-174` → `TripsClient.tsx:33-36` / `TripHeaderActions.tsx:38` |
| 5.5 | Trips-list edit doesn't `router.refresh()` (delete does) | `TripsClient.tsx:33-36` |
| 5.6 | Key Bookings sections all default collapsed — bookings look missing | `KeyBookings.tsx:122-126` |

---

## Step 1 — Timezone-safe date iteration

**New file: `src/lib/dates.ts`**

```ts
/** Date-only helpers for 'YYYY-MM-DD' strings. Never use `new Date(str)` + toISOString()
 *  for date-only values: parsing at local midnight then converting to UTC shifts the day
 *  on any server west of UTC. Anchoring at NOON UTC is immune to offsets and DST. */

export function nextDay(date: string): string {
  const dt = new Date(date + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = nextDay(d)) out.push(d);
  return out;
}
```

**Apply in `src/app/api/trips/route.ts`** — replace the loop at lines 26-38 (the `const start = new Date(startDate + 'T00:00:00') ... days.push(...)` block) with:

```ts
import { datesBetween } from '@/lib/dates';
// ...
const days: TripDay[] = datesBetween(startDate, endDate).map((date, i) => ({
  id: crypto.randomUUID(), tripId: id, date, dayNumber: i + 1,
} as TripDay));
if (days.length > 0) insertDays(days);
```

(Keep the `insertDay`/`insertDays` prepared-statement/transaction setup as is.)

**Apply in `src/app/api/trips/[tripId]/route.ts`** — replace lines 41-47 (`const start = new Date(...)` through the `expectedDates.push` loop) with:

```ts
const expectedDates: string[] = datesBetween(t.startDate, t.endDate);
```

## Step 2 — End ≥ start validation in the four remaining forms

Copy the HotelForm pattern (`src/components/itinerary/HotelForm.tsx:34-40`: read both values from FormData, compare as strings, `setError(...)` + `return` before `setLoading`). String comparison is correct for `YYYY-MM-DD`.

- **FlightForm** (`handleSubmit`, ~line 33): if `arrivalDate` && `departureDate` && arrival < departure → `'Arrival date can't be before the departure date.'`; for round-trips also `returnDepartureDate < departureDate` → `'Return can't depart before the outbound flight.'`
- **TransitForm** (~line 38): `arrivalDate < departureDate` → same style message.
- **RentalCarForm** (~line 29): `dropoffDate < pickupDate` → `'Drop-off date can't be before pick-up.'`
- **ParkingForm** (~line 30): `endDate < startDate` → `'Pick-up date can't be before drop-off.'`

Use the actual form field names in each file (read the file's `body` construction to get them — e.g. ParkingForm uses `startDate`/`endDate`, RentalCarForm uses `pickupDate`/`dropoffDate`). Only validate when **both** values are non-empty.

## Step 3 — Cost summary correctness

**File: `src/components/itinerary/TripCostSummary.tsx`**

3a. Exclude `note` events from totals — change line 38 from:

```ts
for (const e of events) add(e.cost, e.currency);
```

to:

```ts
for (const e of events) { if (e.category !== 'note') add(e.cost, e.currency); }
```

3b. FX-outage fallback: today, if `/api/rates` fails, `grandTotal` goes `null` and both the total row and the budget bar vanish (lines 92-115) — a transient external-API hiccup looks like lost data. Keep the per-currency rows (already rendered, lines 84-89) and make the degradation explicit. The `grandTotal == null && needsConversion` branch (lines 98-100) already shows "conversion unavailable"; extend it so the budget line still renders a partial comparison when a budget exists. Replace the message block at lines 98-100 with:

```tsx
{grandTotal == null && needsConversion && (
  <p className="mt-2 text-xs text-amber-600">
    Currency conversion is unavailable right now — totals above are shown per currency.
    {budget != null ? ' Budget comparison will return when rates are back.' : ''}
  </p>
)}
```

(No logic change needed in the budget section; it is already guarded by `grandTotal != null`. The goal is only that the user understands *why* the total is missing and that costs are not lost.)

## Step 4 — Cover upload must not close the edit dialog

**Problem chain:** `CoverImageUpload.onChanged` → `TripEditForm.tsx:173` calls `onSaved({...trip, coverImageUrl: url})` → both parents treat `onSaved` as "form submitted, close dialog": `TripsClient.tsx:35` (`setEditing(null)`), `TripHeaderActions.tsx:38` (`setEditing(false)`). So changing the photo mid-edit closes the form and throws away un-submitted field edits.

4a. **`src/components/trips/TripEditForm.tsx`** — add an optional prop and use it for cover changes:

```ts
interface TripEditFormProps {
  trip: Trip;
  onSaved: (trip: Trip) => void;
  /** Data changed outside the main form flow (e.g. cover photo) — update caches, do NOT close. */
  onUpdated?: (trip: Trip) => void;
  onDeleted: (tripId: string) => void;
  onClose: () => void;
}
```

Change line 173: `onChanged={(url) => onUpdated?.({ ...trip, coverImageUrl: url })}`.

4b. **`src/components/trips/TripsClient.tsx`** — pass it (and fix 5.5 while here):

```tsx
function handleSaved(updated: Trip) {
  setTripList((prev) => prev.map((t) => t.id === updated.id ? updated : t));
  setEditing(null);
  router.refresh();
}

function handleUpdated(updated: Trip) {
  setTripList((prev) => prev.map((t) => t.id === updated.id ? updated : t));
  setEditing((prev) => (prev && prev.id === updated.id ? updated : prev)); // keep dialog open with fresh data
}
```

and `<TripEditForm trip={editing} onSaved={handleSaved} onUpdated={handleUpdated} onDeleted={handleDeleted} onClose={...} />`.

4c. **`src/components/trips/TripHeaderActions.tsx:35-41`**:

```tsx
<TripEditForm
  trip={trip}
  onSaved={() => { setEditing(false); router.refresh(); }}
  onUpdated={() => router.refresh()}
  onDeleted={() => router.push('/trips')}
  onClose={() => setEditing(false)}
/>
```

**Interaction with Phase 3's remount key:** `router.refresh()` after a cover change bumps nothing visible inside the dialog (the dialog lives in `TripHeaderActions`, outside `ItineraryDocument`), but the cover upload DOES bump `trips.updated_at`, so `ItineraryDocument` remounts behind the dialog. That is fine — the dialog itself stays open because `editing` state in `TripHeaderActions` is untouched.

## Step 5 — Key Bookings sections open when they have content

**File: `src/components/itinerary/KeyBookings.tsx:122-126`** (after Phase 3, `flights`/`hotels`/... are props). Change the five `useState(false)` to content-aware defaults:

```ts
const [flightsOpen, setFlightsOpen] = useState(flights.length > 0);
const [hotelsOpen, setHotelsOpen] = useState(hotels.length > 0);
const [parkingOpen, setParkingOpen] = useState(parking.length > 0);
const [rentalCarsOpen, setRentalCarsOpen] = useState(rentalCars.length > 0);
const [transitOpen, setTransitOpen] = useState(transit.length > 0);
```

(Initial-render-only is intended: user toggles are respected afterward.)

## Verification

1. `npx tsc --noEmit`, `npm run lint`.
2. **Dates:** create a trip Jan 30 → Feb 2. `sqlite3 local.db "SELECT date, day_number FROM trip_days WHERE trip_id='...' ORDER BY day_number"` → exactly `01-30, 01-31, 02-01, 02-02` numbered 1-4. Optional stronger check: `TZ=America/Los_Angeles npm run dev` (PowerShell: `$env:TZ='America/Los_Angeles'; npm run dev`) and repeat — dates must not shift.
3. **Validation:** in FlightForm set arrival date before departure → inline red error, no request sent. Same for transit/rental/parking.
4. **Costs:** add an event with category `note` and a cost → not counted in the summary or budget bar. Block `/api/rates` (stop network or temporarily break the URL) on a multi-currency trip → per-currency rows still visible + amber explanation, no blank card.
5. **Cover mid-edit:** open Edit Trip, type a new title WITHOUT saving, then change the cover photo → dialog stays open, new photo previewed, typed title still in the field; Save → both persist. From the trips list, do the same → list card shows new photo, dialog stays open.
6. **List refresh:** edit a trip title from the list → after save the card updates and the page data is fresh (no stale server cache).
7. **Key Bookings:** open a trip with flights and hotels → those sections are expanded on load; empty sections stay collapsed.

## Done when

- All verification steps pass; `grep -rn "toISOString().split" src/app/api` returns nothing (the two date loops are gone).
