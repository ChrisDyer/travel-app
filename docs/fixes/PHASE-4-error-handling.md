# PHASE 4 — Silent Failures + API Hardening

> **Read `docs/fixes/README.md` first** for global conventions. Independent of Phase 3 except where noted.

## Why this phase exists

Several mutations fail **silently**: the UI removes the item (or does nothing) even when the server request failed, so data quietly diverges from what the user sees. Separately, no API route validates required fields or catches exceptions — a POST missing a NOT NULL column crashes into an opaque 500 with no JSON body, which the client renders as a useless "Something went wrong."

The codebase already contains the correct client pattern — **`HotelForm.tsx` is the reference implementation** (submit: lines 30-73 with `setError('')` at line 32; delete: lines 76-87 with a `res.ok` check). This phase copies that pattern to the places that lack it.

## Issues fixed in this phase

| ID  | Issue | Where |
|-----|-------|-------|
| 4.1 | Parking delete removes item from UI even when the DELETE failed (no `res.ok` check) | `src/components/itinerary/ParkingForm.tsx:68-74` |
| 4.2 | Trip delete navigates away / removes from list even when DELETE failed | `src/components/trips/TripEditForm.tsx:75-80` |
| 4.3 | Packing toggle/delete fail silently (no error state at all for these actions) | `src/components/itinerary/PackingChecklist.tsx:48-65` |
| 4.4 | Day-title save: no error handling + Enter double-fires the PATCH (keydown saves AND triggers blur-save) | `src/components/itinerary/DaySection.tsx:58-68,119-120` |
| 4.5 | Stale error text not cleared at submit start in 5 forms | `EventForm.tsx:~34`, `FlightForm.tsx:~34`, `RentalCarForm.tsx:~30`, `TransitForm.tsx:~39`, `ParkingForm.tsx:30-32` |
| 4.6 | `result.addedEvents.length` without `?.` can throw inside try → misreported as "Connection error" | `src/components/trips/TripAssistant.tsx:204` |
| 4.7 | No API route validates required fields or catches errors → opaque 500s | all handlers under `src/app/api/trips/` |

---

## Part A — The client-side pattern (apply everywhere below)

```
1. First line of the async handler:      setError('');
2. Wrap the fetch in try { ... } catch { setError('Connection error. Please try again.'); } finally { setLoading(false); }
3. After fetch:                          if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error ?? 'Something went wrong. Please try again.'); return; }
4. Only mutate local/parent state AFTER res.ok. Never remove an item from the UI before/without server confirmation.
```

### A1. `src/components/itinerary/ParkingForm.tsx:68-74` — delete

Replace `handleDelete` with the HotelForm version (`HotelForm.tsx:76-87`), adapted:

```tsx
async function handleDelete() {
  if (!parking) return;
  setError('');
  setDeleting(true);
  try {
    const res = await fetch(`/api/trips/${tripId}/parking-bookings/${parking.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeleted(parking.id);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Failed to delete. Please try again.');
    }
  } catch {
    setError('Connection error. Please try again.');
  } finally {
    setDeleting(false);
  }
}
```

Also add `setError('')` as the first statement of its `handleSubmit` (line 31, right after `e.preventDefault()`).

### A2. `src/components/trips/TripEditForm.tsx:75-80` — trip delete

Same treatment:

```tsx
async function handleDelete() {
  setError('');
  setDeleting(true);
  try {
    const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 404) {
      onDeleted(trip.id);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Failed to delete trip. Please try again.');
    }
  } catch {
    setError('Connection error. Please try again.');
  } finally {
    setDeleting(false);
  }
}
```

Also wrap the existing `handleSubmit` fetch (lines 60-72) in try/catch/finally per the pattern — it currently has the `res.ok` branch but a network throw skips `setLoading(false)` and strands the dialog on "Saving…".

### A3. `src/components/itinerary/PackingChecklist.tsx:48-65` — toggle + delete

There is an `addError` state used only by add/suggest. Reuse it (rename mentally to "list error"; no need to rename the variable). Replace `togglePacked` and `deleteItem`:

```tsx
async function togglePacked(item: PackingItem) {
  setAddError('');
  const next = !item.isPacked;
  try {
    const res = await fetch(`/api/trips/${tripId}/packing/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPacked: next }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, isPacked: next } : i));
    } else {
      setAddError('Could not update that item. Please try again.');
    }
  } catch {
    setAddError('Connection error. Please try again.');
  }
}

async function deleteItem(id: string) {
  setAddError('');
  try {
    const res = await fetch(`/api/trips/${tripId}/packing/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 404) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setAddError('Could not delete that item. Please try again.');
    }
  } catch {
    setAddError('Connection error. Please try again.');
  }
}
```

The `addError` message currently renders only inside the global-add block (line 218). Move/duplicate it so it is always visible when set: render it once near the section header, e.g. immediately after the header div that closes at line 121:

```tsx
{addError && <p className="text-sm text-red-600 mb-4">{addError}</p>}
```

(and remove the copy at line 218 to avoid double display).

### A4. `src/components/itinerary/DaySection.tsx:58-68,119-120` — day title save

Two bugs: no error handling, and pressing Enter calls `saveTitle()` from `onKeyDown` **and** the input then blurs (dialog closes/refocus), firing `onBlur={saveTitle}` again → duplicate PATCH.

Fix the double-fire by making Enter just blur (the blur handler does the one save):

```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
  if (e.key === 'Escape') { setTitleDraft(day.title ?? ''); setEditingTitle(false); }
}}
```

(When Escape sets `editingTitle` false, React unmounts the input which triggers blur → `saveTitle` — guard that: make `saveTitle` a no-op when the draft equals the current title, which line 61 already does, and additionally have Escape reset `titleDraft` BEFORE the blur fires, which the code above does. To be safe, change `onBlur` to only save while still editing:)

```tsx
onBlur={() => { if (editingTitle) saveTitle(); }}
```

And add error handling to `saveTitle` (a silent failure currently makes the title *look* saved until reload):

```tsx
async function saveTitle() {
  setEditingTitle(false);
  const newTitle = titleDraft.trim() || null;
  if (newTitle === (day.title ?? null)) return;
  try {
    const res = await fetch(`/api/trips/${day.tripId}/days/${day.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    if (!res.ok) throw new Error();
    onDayTitleChanged?.(day.id, newTitle);
  } catch {
    setTitleDraft(day.title ?? '');           // revert draft
    window.alert('Could not save the day title. Please try again.');
  }
}
```

Note: the old code had `day.tripId ?? ''` which would produce a malformed `/api/trips//days/...` URL; `tripId` is always present on rows from the DB, so drop the fallback (as above).

### A5. Error reset at submit start

Add `setError('');` as the first statement inside `handleSubmit` (right after `e.preventDefault()`):
- `src/components/itinerary/EventForm.tsx` (~line 34, before `setLoading(true)` at line 36)
- `src/components/itinerary/FlightForm.tsx` (~line 34, before line 36)
- `src/components/itinerary/RentalCarForm.tsx` (~line 30, before line 32)
- `src/components/itinerary/TransitForm.tsx` (~line 39, before line 41)
- `ParkingForm.tsx` — already covered in A1.

(`HotelForm.tsx:32` and `TripEditForm.tsx:33` already do this — do not touch.)

### A6. `src/components/trips/TripAssistant.tsx:204`

Change `if (result.addedEvents.length)` → `if (result.addedEvents?.length)` to match lines 207-209.

---

## Part B — API hardening

### B1. New file `src/lib/api-helpers.ts`

```ts
import { NextResponse } from 'next/server';

/** Returns a 400 response if any required field is missing/empty, else null. */
export function requireFields(body: Record<string, unknown>, fields: string[]): NextResponse | null {
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      return NextResponse.json({ error: `Missing required field: ${f}` }, { status: 400 });
    }
  }
  return null;
}

/** Wraps a route handler: malformed JSON / DB errors become clean JSON responses. */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse | Response>
) {
  return async (...args: A): Promise<NextResponse | Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      console.error('[api]', err);
      return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
    }
  };
}
```

### B2. Apply to every handler under `src/app/api/trips/`

Mechanical transformation for each `route.ts`. Example — `src/app/api/trips/[tripId]/events/route.ts` POST (lines 17-46):

```ts
import { requireFields, withErrorHandling } from '@/lib/api-helpers';

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['tripDayId', 'category', 'title']);
  if (invalid) return invalid;

  // ... existing insert unchanged ...
});
```

Note the shape change: `export async function POST(...)` becomes `export const POST = withErrorHandling(async (...) => { ... })`. Keep parameter types identical; do not change any logic inside beyond adding `requireFields`.

Apply `withErrorHandling` to **all** GET/POST/PATCH/DELETE handlers in these files, and `requireFields` on the POST bodies as listed:

| Route file | POST required fields |
|---|---|
| `api/trips/route.ts` | `title`, `destination`, `startDate`, `endDate` |
| `api/trips/[tripId]/events/route.ts` | `tripDayId`, `category`, `title` |
| `api/trips/[tripId]/flights/route.ts` | *(none NOT NULL beyond defaults — wrapper only)* |
| `api/trips/[tripId]/hotels/route.ts` | `name` |
| `api/trips/[tripId]/parking-bookings/route.ts` | `location` |
| `api/trips/[tripId]/rental-cars/route.ts` | `company` |
| `api/trips/[tripId]/transit/route.ts` | `operator` |
| `api/trips/[tripId]/packing/route.ts` | `category`, `item` |
| `api/trips/[tripId]/route.ts` (PATCH/DELETE/GET) | wrapper only |
| `api/trips/[tripId]/days/[dayId]/route.ts` | wrapper only |
| all `[id]` sub-routes (events/[eventId], flights/[flightId], hotels/[hotelId], parking-bookings/[parkingId], rental-cars/[rentalCarId], transit/[transitId], packing/[itemId]) | wrapper only |
| `api/trips/[tripId]/cover-image/route.ts` (from Phase 1) | wrapper only (keep its specific 400/413 responses) |

Check each file's actual NOT-NULL columns against `src/db/migrations.ts` if unsure — the table above was derived from that schema.

Do NOT wrap: `api/summary`, `api/rates`, `api/gmail/*`, assistant routes — out of scope here (they have their own error paths); wrapping them is optional and low-value.

## Verification

1. `npx tsc --noEmit` and `npm run lint` pass.
2. Required-field validation:
   - `curl -s -o - -w "\n%{http_code}\n" -X POST http://localhost:3000/api/trips -H "Content-Type: application/json" -d '{}'` → `{"error":"Missing required field: title"}` + `400`.
   - Same for an event without `title` → 400, hotel without `name` → 400.
3. Malformed JSON: `curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/trips -H "Content-Type: application/json" -d 'not-json'` → `{"error":"Invalid JSON body"}` + `400` (not an HTML 500 page).
4. Failure-path UX: start the app, open a parking booking's delete confirm, **stop the dev server**, click "Yes, delete" → the row STAYS in the UI and a red error appears (previously it vanished). Restart the server and repeat for trip delete and a packing checkbox toggle.
5. Day title: type a title, press Enter → exactly ONE PATCH in the network tab (was two). Escape reverts without saving.
6. Submit a form twice, first with an invalid state that errors, then a valid one → the old red error disappears during the second submit.

## Done when

- All verification steps pass.
- Grep checks: every `handleDelete` in `src/components` checks `res.ok` before mutating state; `grep -rn "await fetch" src/components` shows no un-try/caught mutation calls in the files listed above.
- No API route in `src/app/api/trips/` can return a bodiless 500 for bad input.
