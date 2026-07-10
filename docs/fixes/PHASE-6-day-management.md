# PHASE 6 — Day & Event Management

> **Read `docs/fixes/README.md` first.** Requires Phase 4 (error-handling pattern reused here). Best done after Phase 3.

## What already works — do NOT rebuild these

- **Moving an event to another day:** `EventForm` shows a day selector when the trip has multiple days (`src/components/itinerary/EventForm.tsx:128-146`) and PATCHes `tripDayId`.
- **Day titles:** click-to-edit in `DaySection.tsx:114-133` (hardened in Phase 4).
- **Days follow trip dates:** editing trip start/end adds/removes day rows (`src/app/api/trips/[tripId]/route.ts:39-78`). Days are date-derived by design — there is no "insert day between dates" concept.
- **Calendar export:** `.ics` download exists (`TripHeaderActions.tsx:22-28`).

## Features added in this phase

| ID  | Feature | Where |
|-----|---------|-------|
| 6.1 | Day **notes** — column exists (`src/db/migrations.ts:32`) but has no API support or UI | `days/[dayId]/route.ts`, `DaySection.tsx` |
| 6.2 | **Reorder untimed events** within a day — `sort_order` column + PATCH support exist, no UI | `EventCard.tsx`, `DaySection.tsx`, `ItineraryDocument.tsx` |

---

## Step 1 — Day notes

### 1a. API: accept `notes` in the day PATCH

**File: `src/app/api/trips/[tripId]/days/[dayId]/route.ts`** — the handler (lines 15-20) only updates `title`. Replace the body-handling with a partial update that touches only provided fields:

```ts
const body = await request.json() as { title?: string | null; notes?: string | null };

const sets: string[] = [];
const values: unknown[] = [];
if ('title' in body) { sets.push('title = ?'); values.push(body.title?.trim() || null); }
if ('notes' in body) { sets.push('notes = ?'); values.push(body.notes?.trim() || null); }
if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

values.push(dayId, tripId);
db.prepare(`UPDATE trip_days SET ${sets.join(', ')} WHERE id = ? AND trip_id = ?`).run(...values);

const day = db.prepare('SELECT * FROM trip_days WHERE id = ?').get(dayId) as Record<string, unknown>;
return NextResponse.json(camelize(day));
```

(Import `camelize` from `@/db`. This changes the response from `{id, title}` to the full camelized day row — the only current caller, `DaySection.saveTitle`, ignores the response body, so this is safe.)

### 1b. UI: notes line under the day title

**File: `src/components/itinerary/DaySection.tsx`** — mirror the title editing pattern exactly (state at lines 54-56, input at 114-133), but with a `<textarea>`:

- State: `const [editingNotes, setEditingNotes] = useState(false);` and `const [notesDraft, setNotesDraft] = useState(day.notes ?? '');`
- `saveNotes()` — copy the Phase 4 `saveTitle` implementation, but send `{ notes: newNotes }` and call a new optional prop `onDayNotesChanged?.(day.id, newNotes)`.
- Render below the title button/input block (after line 133), inside the same header div:

```tsx
{editingNotes ? (
  <textarea
    value={notesDraft}
    onChange={(e) => setNotesDraft(e.target.value)}
    onBlur={() => { if (editingNotes) saveNotes(); }}
    onKeyDown={(e) => { if (e.key === 'Escape') { setNotesDraft(day.notes ?? ''); setEditingNotes(false); } }}
    className="mt-1 w-full max-w-md text-sm text-stone-600 bg-transparent border border-stone-300 rounded-md p-2 focus:outline-none focus:border-stone-500"
    rows={2}
    placeholder="Notes for this day…"
    autoFocus
  />
) : (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
    className="no-print mt-0.5 block text-left text-xs text-stone-400 hover:text-stone-600 transition-colors"
  >
    {day.notes
      ? <span className="text-stone-500 whitespace-pre-wrap">{day.notes}</span>
      : <span className="italic">+ Add day notes</span>}
  </button>
)}
```

- Add `onDayNotesChanged?: (dayId: string, notes: string | null) => void;` to `DaySectionProps` (lines 11-27).
- **File: `src/components/itinerary/ItineraryDocument.tsx`** — pass `onDayNotesChanged` alongside `onDayTitleChanged` (line 235) with the analogous updater:

```tsx
onDayNotesChanged={(dayId, notes) => setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, notes } : d))}
```

- **Print page:** `src/app/trips/[tripId]/print/page.tsx` renders day headers — add the notes under the day title there too if a `notes` value exists (small muted paragraph; find the day-header JSX and mirror the on-screen styling).

## Step 2 — Reorder untimed events

**Why untimed only:** the timeline sorts timed events by `startTime` and falls back to `sortOrder` only when both events lack times (`ItineraryDocument.tsx:61-67`, same logic in `print/page.tsx:109-114`). Giving reorder arrows to timed events would be a lie — their position is determined by their time. Show arrows **only on events with no `startTime`**.

### 2a. EventCard: arrow buttons

**File: `src/components/itinerary/EventCard.tsx`** — add optional props:

```ts
interface EventCardProps {
  event: TripEvent;
  onEdit: (event: TripEvent) => void;
  onMoveUp?: () => void;    // provided only when the card can move up
  onMoveDown?: () => void;  // provided only when the card can move down
}
```

Render small arrow buttons that appear on hover, in the card's top-right area next to the existing status badge (inside the `flex items-start justify-between` row at line 50). Keep them out of print:

```tsx
{(onMoveUp || onMoveDown) && (
  <div className="no-print flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
    <button aria-label="Move up" disabled={!onMoveUp}
      onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
      className="text-stone-300 hover:text-stone-600 disabled:opacity-30 leading-none text-xs px-1">▲</button>
    <button aria-label="Move down" disabled={!onMoveDown}
      onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
      className="text-stone-300 hover:text-stone-600 disabled:opacity-30 leading-none text-xs px-1">▼</button>
  </div>
)}
```

(`e.stopPropagation()` is required — the whole card's `onClick` opens the edit dialog, line 44.)

### 2b. Reorder handler in ItineraryDocument

**File: `src/components/itinerary/ItineraryDocument.tsx`** — add:

```ts
async function reorderEvent(dayId: string, eventId: string, direction: 'up' | 'down') {
  // Untimed events for this day in current display order
  const untimed = events
    .filter((e) => e.tripDayId === dayId && !e.startTime)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = untimed.findIndex((e) => e.id === eventId);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= untimed.length) return;

  const a = untimed[idx], b = untimed[swapWith];
  // Ensure distinct sort orders even if both are 0 (legacy rows default to 0)
  const aOrder = b.sortOrder === a.sortOrder ? a.sortOrder + (direction === 'up' ? -1 : 1) : b.sortOrder;
  const bOrder = a.sortOrder;

  const prevEvents = events;
  setEvents((prev) => prev.map((e) =>
    e.id === a.id ? { ...e, sortOrder: aOrder } : e.id === b.id ? { ...e, sortOrder: bOrder } : e
  ));
  try {
    const r1 = await fetch(`/api/trips/${trip.id}/events/${a.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: aOrder }),
    });
    const r2 = await fetch(`/api/trips/${trip.id}/events/${b.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: bOrder }),
    });
    if (!r1.ok || !r2.ok) throw new Error();
  } catch {
    setEvents(prevEvents); // roll back optimistic move
    window.alert('Could not reorder. Please try again.');
  }
}
```

(The events `[eventId]` PATCH route already accepts `sortOrder` — its `colMap` includes `sortOrder: 'sort_order'`.)

Pass it into `DaySection` (line 218 map): `onReorderEvent={(eventId, dir) => reorderEvent(day.id, eventId, dir)}`.

**Caveat to preserve:** `eventsForDay` sorts by `startTime` first and `sortOrder` otherwise (`ItineraryDocument.tsx:61-67`). Do not change that comparator; mixed timed/untimed ordering (timed events sort before untimed when only one has a time — see the DaySection timeline comparator at lines 97-102) stays as is.

### 2c. DaySection wiring

**File: `src/components/itinerary/DaySection.tsx`** — add prop `onReorderEvent?: (eventId: string, direction: 'up' | 'down') => void;`. Where events render (line 140-142), compute the untimed list once above the `items.map`:

```ts
const untimedIds = events.filter((e) => !e.startTime).sort((a, b) => a.sortOrder - b.sortOrder).map((e) => e.id);
```

and render:

```tsx
if (item.kind === 'event') {
  const pos = untimedIds.indexOf(item.event.id); // -1 for timed events
  return (
    <EventCard
      key={item.event.id}
      event={item.event}
      onEdit={onEditEvent}
      onMoveUp={pos > 0 ? () => onReorderEvent?.(item.event.id, 'up') : undefined}
      onMoveDown={pos !== -1 && pos < untimedIds.length - 1 ? () => onReorderEvent?.(item.event.id, 'down') : undefined}
    />
  );
}
```

## Verification

1. `npx tsc --noEmit`, `npm run lint`.
2. **Day notes:** add notes to a day → blur → reload the page → notes persist. Escape while editing reverts. Stop the server and try to save → alert appears, draft reverts (Phase 4 behavior). Notes appear on the print page.
3. **API:** `curl -X PATCH http://localhost:3000/api/trips/{tripId}/days/{dayId} -H "Content-Type: application/json" -d '{"notes":"Beach day"}'` → 200 with the full day JSON; title unchanged. Empty body `{}` → 400.
4. **Reorder:** create 3 events without times on one day. Hover a card → arrows appear; top card has no ▲, bottom has no ▼. Move the middle one up → order changes instantly; reload → order persisted. Add a timed event to the same day → it shows no arrows and sorts by its time.
5. Timed-vs-untimed regression: a day with both timed and untimed events prints and displays in the same order as before this phase (timed first by time — comparator untouched).

## Done when

- All verification steps pass; day notes are editable inline and survive reload; untimed events reorder with persistence and rollback on failure.
