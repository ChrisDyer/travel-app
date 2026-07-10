# PHASE 2 — Trip Status Visibility + Edit Completeness

> **Read `docs/fixes/README.md` first** for global conventions.

## Why this phase exists

The user reported "I can't switch a trip to complete — it doesn't work." Investigation proved the status **does save**: the edit form sends `status: "completed"` (`src/components/trips/TripEditForm.tsx:53`), the PATCH handler's `colMap` includes `status` (`src/app/api/trips/[tripId]/route.ts:20-25`), and the DB column has no constraint (`src/db/migrations.ts:14`). The real bug: **the trip detail page never displays status anywhere** (`src/app/trips/[tripId]/page.tsx` has zero references to `trip.status`), so saving produces no visible change and looks broken. The only status badge in the app is on the trips list (`src/components/trips/TripsClient.tsx:74-76`).

This phase also closes the "I need to edit everything" gaps: fields silently dropped at creation and fields with backend support but no edit UI.

## Issues fixed in this phase

| ID  | Issue | Where |
|-----|-------|-------|
| 2.1 | Trip status invisible on detail page → "mark complete doesn't work" | `src/app/trips/[tripId]/page.tsx:44-48` |
| 2.2 | POST /api/trips drops `travelMode`/`rentalCarNeeded` (and accepts no notes/budget/travelers) — new trips silently revert to defaults | `src/app/api/trips/route.ts:15-24` |
| 2.3 | `travelers` has no UI anywhere (create or edit) | `TripEditForm.tsx`, `src/app/trips/new/page.tsx` |
| 2.4 | `digestEnabled` / `digestDayOfWeek` have no UI anywhere | `TripEditForm.tsx` |
| 2.5 | Day-reconcile runs on EVERY trip PATCH (even status-only), renumbering all days each save | `src/app/api/trips/[tripId]/route.ts:39` |
| 2.6 | Warning says shortened-trip events "will be hidden" — they are permanently CASCADE-deleted | `TripEditForm.tsx:43`, schema `migrations.ts:37` |

---

## Step 1 — Shared status utilities

**New file: `src/lib/trip-status.ts`** — move the `statusColors` map out of `TripsClient.tsx:11-16` so the detail page can reuse it:

```ts
import type { TripStatus } from '@/types/travel';

export const statusColors: Record<TripStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  'in-progress': 'bg-amber-100 text-amber-800',
  completed: 'bg-stone-100 text-stone-600',
};

export function statusLabel(status: TripStatus): string {
  return status.replace('-', ' ');
}
```

In `src/components/trips/TripsClient.tsx`: delete the local `statusColors` const (lines 11-16) and import it from `@/lib/trip-status`. The badge JSX at lines 74-76 stays as is (it already handles unknown values with `?? statusColors.planning`).

## Step 2 — Status badge on the trip detail page

**File: `src/app/trips/[tripId]/page.tsx`** — in the header, next to the title (line 45), render the badge. Replace:

```tsx
<h1 className="text-xl font-serif font-bold text-stone-900">{trip.title}</h1>
```

with:

```tsx
<div className="flex items-center gap-2">
  <h1 className="text-xl font-serif font-bold text-stone-900">{trip.title}</h1>
  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[trip.status] ?? statusColors.planning}`}>
    {statusLabel(trip.status)}
  </span>
</div>
```

and add the import `import { statusColors, statusLabel } from '@/lib/trip-status';`. This is a server component — no `'use client'` concerns; the badge re-renders on `router.refresh()`, which `TripHeaderActions` already calls after every save (`TripHeaderActions.tsx:38`). **This is the user-visible fix for "can't mark complete."**

## Step 3 — POST /api/trips: stop dropping fields

**File: `src/app/api/trips/route.ts`** — the POST handler (lines 12-42) destructures only `{ title, destination, startDate, endDate, status }`, so the `travelMode` and `rentalCarNeeded` the new-trip form sends (`src/app/trips/new/page.tsx:41-42`) are discarded and the trip reverts to `travel_mode='fly'`, `rental_car_needed=0`. Replace lines 15-24 with:

```ts
  const {
    title, destination, startDate, endDate,
    status = 'planning',
    travelMode = 'fly',
    rentalCarNeeded = false,
    travelers = '[]',
    notes = null,
    budget = null,
    budgetCurrency = null,
  } = body;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const trip = db.prepare(`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status,
                       travel_mode, rental_car_needed, travelers, notes, budget, budget_currency,
                       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(id, userId, title, destination, startDate, endDate, status,
         travelMode, rentalCarNeeded ? 1 : 0,
         typeof travelers === 'string' ? travelers : JSON.stringify(travelers),
         notes, budget, budgetCurrency, now, now) as Record<string, unknown>;
```

(SQLite booleans are stored as 0/1 — note the `rentalCarNeeded ? 1 : 0`. The PATCH route already receives a boolean and SQLite coerces it; keep PATCH as is.)

## Step 4 — Travelers + digest controls in the edit form

**File: `src/components/trips/TripEditForm.tsx`**

The PATCH API already accepts `travelers`, `digestEnabled`, `digestDayOfWeek` (`[tripId]/route.ts:22-24`); only the UI is missing. `trip.travelers` is a JSON string array (e.g. `'["Chris","Sam"]'`).

4a. Add state near the existing `travelMode` state (line 28):

```tsx
const [digestEnabled, setDigestEnabled] = useState(!!trip.digestEnabled);
```

4b. Parse travelers for the default value (top of component):

```tsx
let initialTravelers = '';
try { initialTravelers = (JSON.parse(trip.travelers ?? '[]') as string[]).join(', '); } catch { /* keep '' */ }
```

4c. Add to the `body` object in `handleSubmit` (after `notes`, line 58):

```tsx
travelers: JSON.stringify(
  ((form.get('travelers') as string) ?? '').split(',').map((t) => t.trim()).filter(Boolean)
),
digestEnabled,
digestDayOfWeek: Number(form.get('digestDayOfWeek') ?? trip.digestDayOfWeek ?? 1),
```

4d. Add fields to the JSX. Travelers input after the destination block (line 98):

```tsx
<div className="space-y-1.5">
  <Label htmlFor="travelers">Travelers</Label>
  <Input id="travelers" name="travelers" defaultValue={initialTravelers} placeholder="Chris, Sam (comma-separated)" />
</div>
```

Digest controls after the notes block (line 168), following the existing checkbox pattern (`rentalCarNeeded`, lines 143-152) and Select pattern (status, lines 111-121):

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-2">
    <input
      type="checkbox"
      id="digestEnabled"
      checked={digestEnabled}
      onChange={(e) => setDigestEnabled(e.target.checked)}
      className="h-4 w-4 rounded border-stone-300 accent-blue-600"
    />
    <Label htmlFor="digestEnabled" className="cursor-pointer">Weekly email digest</Label>
  </div>
  {digestEnabled && (
    <Select name="digestDayOfWeek" defaultValue={String(trip.digestDayOfWeek ?? 1)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
          <SelectItem key={d} value={String(i)}>{d}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}
</div>
```

4e. **Create form** (`src/app/trips/new/page.tsx`): add the same Travelers input (after the destination field, line 85) and include `travelers` in the POST body the same way as 4c. Digest controls are NOT needed on create (defaults off).

## Step 5 — Only reconcile days when dates actually changed

**File: `src/app/api/trips/[tripId]/route.ts`**

The reconcile block (lines 38-78) runs whenever `body.startDate || body.endDate` is truthy — and the edit form always sends both (they're `required` inputs), so every save (even status-only edits from a curl/assistant) deletes/renumbers day rows. Fix by comparing against the stored values **before** the UPDATE. Insert above the `colMap` declaration (line 20):

```ts
const before = db.prepare('SELECT start_date, end_date FROM trips WHERE id = ? AND user_id = ?')
  .get(tripId, userId) as { start_date: string; end_date: string } | undefined;
if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

Then change the reconcile condition (line 39) from:

```ts
if (body.startDate || body.endDate) {
```

to:

```ts
const datesChanged =
  (typeof body.startDate === 'string' && body.startDate !== before.start_date) ||
  (typeof body.endDate === 'string' && body.endDate !== before.end_date);
if (datesChanged) {
```

Do not otherwise modify the reconcile block in this phase (its date-iteration loop is replaced in Phase 5).

## Step 6 — Honest warning text

**File: `src/components/trips/TripEditForm.tsx:43`** — `trip_events.trip_day_id` has `ON DELETE CASCADE` (`src/db/migrations.ts:37`), so events on removed days are **permanently deleted**, and re-extending the trip creates brand-new day rows — the events do not come back. Replace the confirm text with:

```ts
const proceed = window.confirm('Shortening the trip will remove days from the end. Any events on removed days will be PERMANENTLY DELETED. Continue?');
```

## Verification

1. `npx tsc --noEmit` and `npm run lint` pass.
2. `npm run dev` → open a trip → Edit → Status → Completed → Save. The header now shows a stone-gray "completed" badge immediately. The trips list shows the same badge. **(This is the user's reported bug — must pass.)**
3. Create a new trip choosing "🚗 Driving" + "Rental car needed" + travelers "Chris, Sam". On the new trip's page: no Flights section in Key Bookings, Rental Car section present. `sqlite3 local.db "SELECT travel_mode, rental_car_needed, travelers FROM trips ORDER BY created_at DESC LIMIT 1"` → `drive|1|["Chris","Sam"]`.
4. Edit a trip: set travelers, enable digest, pick Wednesday, save; re-open Edit → values persisted (check DB: `digest_enabled=1`, `digest_day_of_week=3`).
5. Day-reconcile guard: note the day ids (`sqlite3 local.db "SELECT id FROM trip_days WHERE trip_id='...' ORDER BY day_number"`), then `curl -X PATCH http://localhost:3000/api/trips/{id} -H "Content-Type: application/json" -d '{"status":"planning"}'` — day ids must be unchanged. Then save the edit form without touching dates — ids still unchanged. Then actually change the end date — days update.
6. Shorten a trip that has an event on its last day → confirm dialog mentions PERMANENT deletion.

## Done when

- All verification steps pass; status changes are visibly reflected on both pages; every trip field is editable from the UI (title, destination, dates, status, travelers, travel mode, rental car, budget+currency, notes, digest, cover photo).
