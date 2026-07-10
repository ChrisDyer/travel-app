# PHASE 7 — Experience Upgrades

> **Read `docs/fixes/README.md` first.** Requires Phase 2 (`src/lib/trip-status.ts`), Phase 4 (error pattern), Phase 5 (`src/lib/dates.ts`). Do this phase LAST.

This is the polish-and-delight phase: success feedback, a trips list that scales past a handful of trips, status intelligence, trip duplication, and onboarding for empty trips.

## Features added in this phase

| ID  | Feature |
|-----|---------|
| 7.1 | Toast notification system (no new dependency) + success toasts on saves/deletes |
| 7.2 | Trips list: status filter chips, text search, sort control (persisted in localStorage) |
| 7.3 | Trip timing chip ("In 12 days" / "Day 3 of 7" / "Ended Jun 5") on cards and detail header |
| 7.4 | Smart status nudge banner (one-click "Mark completed" / "Mark in progress") |
| 7.5 | Duplicate trip (API + UI) |
| 7.6 | Empty-trip onboarding card |

---

## Step 1 — Toast system

**New file: `src/components/ui/toast.tsx`** — module-level emitter + a `<Toaster />`, no context provider needed:

```tsx
'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' };
type Listener = (t: Toast) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function toast(message: string, type: 'success' | 'error' = 'success') {
  const t = { id: nextId++, message, type };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 no-print" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-2.5 text-sm shadow-lg bg-white animate-in fade-in slide-in-from-bottom-2 ${
            t.type === 'success' ? 'border-emerald-200 text-stone-700' : 'border-red-200 text-red-700'
          }`}
        >
          {t.type === 'success' ? '✓ ' : ''}{t.message}
        </div>
      ))}
    </div>
  );
}
```

(If `animate-in ...` classes don't exist in this Tailwind setup, drop them — `tw-animate-css` is a dependency, check `src/app/globals.css` imports; if unsure, omit the animation classes entirely rather than debugging them.)

**Mount it:** `src/app/layout.tsx` — render `<Toaster />` just inside `<body>` after `{children}`. `layout.tsx` is a server component; `Toaster` is a client component, which is fine to render from a server layout.

**Wire success toasts** (import `{ toast } from '@/components/ui/toast'`; failures keep their inline errors from Phase 4):
- `TripsClient.handleSaved` → `toast('Trip saved')`; `handleDeleted` → `toast('Trip deleted')`.
- `TripHeaderActions` `onSaved` → `toast('Trip saved')`.
- `ItineraryDocument`: in `handleEventSaved` → `toast(isNew ? 'Event added' : 'Event saved')`; `handleEventDeleted` → `toast('Event deleted')`; and in the four booking-form `onSaved`/`onDeleted` callbacks (flights/hotels/parking/rental, lines 253-303) + the transit dialog from Phase 3 → `toast('Flight saved')` etc.
- `KeyBookings` `handleXSaved`/`onDeleted` callbacks → same messages (these are different code paths than ItineraryDocument's dialogs — both need it).
- `CoverImageUpload` on successful upload/remove → `toast('Cover photo updated')` / `toast('Cover photo removed')`.
- `src/app/trips/new/page.tsx`: replace the Phase 1 `window.alert(...)` for failed cover upload with `toast('Trip created, but the cover photo failed to upload. Add it from Edit Trip.', 'error')`.

## Step 2 — Trips list: filter, search, sort

**File: `src/components/trips/TripsClient.tsx`** — all client-side; the list is already fully loaded.

2a. State + persistence:

```tsx
type SortKey = 'startDate-desc' | 'startDate-asc' | 'created-desc';
const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all');
const [query, setQuery] = useState('');
const [sort, setSort] = useState<SortKey>('startDate-desc');

useEffect(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('trips-list-prefs') ?? '{}');
    if (saved.statusFilter) setStatusFilter(saved.statusFilter);
    if (saved.sort) setSort(saved.sort);
  } catch { /* ignore */ }
}, []);
useEffect(() => {
  localStorage.setItem('trips-list-prefs', JSON.stringify({ statusFilter, sort }));
}, [statusFilter, sort]);
```

2b. Derived list (replace direct `tripList.map`):

```tsx
const visible = tripList
  .filter((t) => statusFilter === 'all' || t.status === statusFilter)
  .filter((t) => {
    const q = query.trim().toLowerCase();
    return !q || t.title.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q);
  })
  .sort((a, b) => {
    if (sort === 'startDate-asc') return a.startDate.localeCompare(b.startDate);
    if (sort === 'created-desc') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    return b.startDate.localeCompare(a.startDate);
  });
```

2c. Controls row above the grid — filter chips styled like the status badges (reuse `statusColors` + `statusLabel` from `@/lib/trip-status`), an `<Input>` for search, and a `<Select>` for sort (`Newest trips first` / `Oldest trips first` / `Recently created`). When `visible.length === 0` but `tripList.length > 0`, show "No trips match — clear filters" with a button that resets all three controls. Keep the existing true-empty state (lines 44-53) for `tripList.length === 0`.

**Important:** the early-return empty state at line 44 currently fires before any controls render — restructure so the controls + filtered-empty message render for non-empty lists, and the existing "No trips yet" block only for a truly empty list.

## Step 3 — Trip timing chip

**File: `src/lib/trip-status.ts`** (from Phase 2) — add:

```ts
import { nextDay } from '@/lib/dates'; // only if needed; comparison below is pure string math

/** today: 'YYYY-MM-DD' in the user's local zone. Call with localToday() on the client. */
export function tripTiming(startDate: string, endDate: string, today: string): string {
  if (today < startDate) {
    const days = Math.round((Date.parse(startDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
    return days === 1 ? 'Tomorrow' : `In ${days} days`;
  }
  if (today > endDate) {
    const d = new Date(endDate + 'T12:00:00Z');
    return `Ended ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  }
  const dayNum = Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000) + 1;
  const total = Math.round((Date.parse(endDate + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000) + 1;
  return `Day ${dayNum} of ${total}`;
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

Render as a small muted chip:
- **Trip cards** (`TripsClient.tsx`, next to the date range at line 71): `<span className="text-xs text-stone-400">· {tripTiming(trip.startDate, trip.endDate, today)}</span>` where `const today = localToday();` is computed once in the component. `TripsClient` is a client component, so local timezone is correct.
- **Detail header**: the page is a server component; put the chip inside `TripHeaderActions` (client) instead — add it before the Export link, reading `trip.startDate/endDate` from its existing prop.

## Step 4 — Smart status nudge

**New file: `src/components/trips/TripStatusNudge.tsx`**:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trip, TripStatus } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { localToday } from '@/lib/trip-status';

export function TripStatusNudge({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(`nudge-${trip.id}`) === '1'
  );

  const today = localToday();
  let suggestion: { status: TripStatus; text: string; cta: string } | null = null;
  if (trip.endDate < today && trip.status !== 'completed') {
    suggestion = { status: 'completed', text: 'This trip has ended.', cta: 'Mark completed' };
  } else if (trip.startDate <= today && today <= trip.endDate && (trip.status === 'confirmed' || trip.status === 'planning')) {
    suggestion = { status: 'in-progress', text: 'This trip is underway.', cta: 'Mark in progress' };
  }
  if (!suggestion || dismissed) return null;

  async function apply() {
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: suggestion!.status }),
      });
      if (!res.ok) throw new Error();
      toast(`Status updated to ${suggestion!.status.replace('-', ' ')}`);
      router.refresh();
    } catch {
      toast('Could not update status. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    sessionStorage.setItem(`nudge-${trip.id}`, '1');
    setDismissed(true);
  }

  return (
    <div className="no-print mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="text-sm text-stone-700">{suggestion.text}</p>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={apply} disabled={saving}>{saving ? 'Saving…' : suggestion.cta}</Button>
        <button onClick={dismiss} className="text-stone-400 hover:text-stone-600 text-sm" aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
```

Render it in `src/app/trips/[tripId]/page.tsx` at the top of `<main>` (before `<TripWeather />`): `<TripStatusNudge trip={trip} />`. The `useState` initializer touching `sessionStorage` is safe in client components with the `typeof window` guard shown.

## Step 5 — Duplicate trip

### 5a. API — **new file: `src/app/api/trips/[tripId]/duplicate/route.ts`**

Copies the trip, its days, and its **events** (plans). Deliberately does NOT copy flights/hotels/parking/rental-cars/transit/packing: those are purchased bookings and packed bags specific to the original dates — carrying over confirmation numbers would fabricate bookings that don't exist. Events copy with `booking_status` reset to `unbooked` and confirmation fields cleared for the same reason.

```ts
import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { Trip } from '@/types/travel';

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);

  const src = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newTripId = crypto.randomUUID();
  const now = new Date().toISOString();

  const duplicate = db.transaction(() => {
    db.prepare(`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status,
                         travelers, notes, travel_mode, rental_car_needed,
                         digest_enabled, digest_day_of_week, budget, budget_currency,
                         created_at, updated_at)
      SELECT ?, user_id, title || ' (Copy)', destination, start_date, end_date, 'planning',
             travelers, notes, travel_mode, rental_car_needed,
             0, digest_day_of_week, budget, budget_currency, ?, ?
      FROM trips WHERE id = ?
    `).run(newTripId, now, now, tripId);

    const days = db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number').all(tripId) as
      { id: string; date: string; day_number: number; title: string | null; notes: string | null }[];
    const insertDay = db.prepare('INSERT INTO trip_days (id, trip_id, date, day_number, title, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const dayIdMap = new Map<string, string>();
    for (const d of days) {
      const newDayId = crypto.randomUUID();
      dayIdMap.set(d.id, newDayId);
      insertDay.run(newDayId, newTripId, d.date, d.day_number, d.title, d.notes);
    }

    const events = db.prepare('SELECT * FROM trip_events WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
    const insertEvent = db.prepare(`
      INSERT INTO trip_events (id, trip_day_id, trip_id, category, title, start_time, end_time,
        location, location_url, booking_status, confirmation_number, confirmation_source,
        source_email_id, booking_url, cost, currency, seat_info, vendor, order_number,
        cancellation_policy, cancellation_deadline, sort_order, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unbooked', NULL, 'manual', NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)
    `);
    for (const e of events) {
      const newDayId = dayIdMap.get(e.trip_day_id as string);
      if (!newDayId) continue;
      insertEvent.run(
        crypto.randomUUID(), newDayId, newTripId, e.category, e.title, e.start_time, e.end_time,
        e.location, e.location_url, e.booking_url, e.cost, e.currency, e.seat_info, e.vendor,
        e.sort_order, e.notes, now, now
      );
    }
  });
  duplicate();

  const created = db.prepare('SELECT * FROM trips WHERE id = ?').get(newTripId) as Record<string, unknown>;
  return NextResponse.json(camelize<Trip>(created), { status: 201 });
});
```

**⚠ Placeholder-count check:** the `insertEvent` VALUES clause interleaves literals with `?` placeholders. Count carefully: 25 columns; literals cover `booking_status`, `confirmation_number`, `confirmation_source`, `source_email_id`, `order_number`, `cancellation_policy`, `cancellation_deadline` (7), leaving **18 placeholders** matching the 18 `.run()` args listed. better-sqlite3 throws at prepare/run time if the count is off — verify by actually duplicating a trip with events.

### 5b. UI

**File: `src/components/trips/TripsClient.tsx`** — add a Copy icon button next to the Pencil (lines 77-83), same styling, `aria-label="Duplicate trip"` (import `Copy` from `lucide-react`):

```tsx
<button
  className="p-1.5 rounded-md text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors"
  onClick={(e) => { e.preventDefault(); handleDuplicate(trip); }}
  aria-label="Duplicate trip"
>
  <Copy className="h-4 w-4" />
</button>
```

```tsx
const [duplicating, setDuplicating] = useState<string | null>(null);

async function handleDuplicate(trip: Trip) {
  if (duplicating) return;
  setDuplicating(trip.id);
  try {
    const res = await fetch(`/api/trips/${trip.id}/duplicate`, { method: 'POST' });
    if (!res.ok) throw new Error();
    const copy = await res.json() as Trip;
    toast('Trip duplicated');
    router.push(`/trips/${copy.id}`);
  } catch {
    toast('Could not duplicate the trip. Please try again.', 'error');
  } finally {
    setDuplicating(null);
  }
}
```

## Step 6 — Empty-trip onboarding card

**File: `src/components/itinerary/ItineraryDocument.tsx`** — when the trip has no content at all, show a guidance card at the top of the right (days) column. Condition:

```tsx
const isEmpty = events.length === 0 && flights.length === 0 && hotels.length === 0
  && parking.length === 0 && rentalCars.length === 0 && transit.length === 0;
```

Render above the `days.map(...)` inside the right column div (line 217):

```tsx
{isEmpty && (
  <div className="no-print rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
    <p className="font-serif text-lg text-stone-700">Let's plan this trip ✈</p>
    <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
      Add your first flight or hotel from the Key Bookings panel, add events to any day below,
      or open the Trip Assistant and paste a confirmation email to import bookings automatically.
    </p>
  </div>
)}
```

(It disappears automatically once anything is added — the condition is derived from live state. Match the trips-list empty-state tone: short, friendly, no walls of text.)

## Verification

1. `npx tsc --noEmit`, `npm run lint`.
2. **Toasts:** save a trip, an event, a flight; delete a packing item → each shows a bottom-right toast that auto-dismisses ~3.5s; two rapid saves stack two toasts. Print preview shows no toast artifacts.
3. **List controls:** with ≥3 trips of mixed status — chips filter correctly; search matches title and destination case-insensitively; each sort order works; reload the page → filter+sort persisted (search intentionally not); "No trips match" + clear-filters works; deleting the last matching trip doesn't render the "No trips yet" onboarding (only true-empty does).
4. **Timing chip:** a future trip shows "In N days" (or "Tomorrow"), an active one "Day X of Y" (matches today's actual position), a past one "Ended <date>". Check a trip starting today shows Day 1.
5. **Nudge:** set a trip's end date to yesterday, status planning → banner appears on its detail page; click "Mark completed" → badge (Phase 2) flips, banner gone, toast shown. Dismiss ✕ on another ended trip → hidden for the session, reappears in a new tab. A completed past trip shows no banner.
6. **Duplicate:** duplicate a trip that has days with titles/notes and events (some with confirmation numbers) → lands on "<title> (Copy)", status planning; days match with titles/notes; events present with `unbooked` status and NO confirmation numbers; original untouched; flights/hotels NOT copied. `sqlite3` spot-check `trip_events` of the copy for `confirmation_number IS NULL`.
7. **Onboarding:** brand-new trip shows the guidance card; adding one event removes it.

## Done when

- All verification steps pass and the app gives visible feedback for every successful action (toast), every failed action (inline error or error toast), and every empty state (guidance).
