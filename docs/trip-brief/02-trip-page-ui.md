# Phase 2 — Trip page UI

**Prerequisites: read `00-overview.md` first, then `PROGRESS.md` for what Phase 1 actually
delivered.** Phase 1 must be complete — this phase calls its routes.

Build the Trip Brief panel and wire it into the trip page. **travel-app only.**

## Deliverables

- `src/components/itinerary/TripBrief.tsx` (new)
- `src/components/itinerary/ItineraryDocument.tsx` — render it
- `src/lib/dates.ts` — a relative-time helper
- Phase 2 report appended to `PROGRESS.md`

---

## 1. Where it goes

`src/components/itinerary/ItineraryDocument.tsx`. The desktop layout is a two-column grid
(line 262); there are **no desktop tabs**. The `mobileTab` state (line 60) is a mobile-only
view switcher that hides panels with `max-lg:hidden`.

Render `<TripBrief>` inside the **existing** overview block at lines 288-307, between
`<CancellationDeadlines/>` and `<TripCostSummary/>`:

```tsx
<div className={cn(mobileTab !== 'overview' && 'max-lg:hidden', 'print:block')}>
  <CancellationDeadlines ... />

  <TripBrief
    tripId={trip.id}
    initialContent={trip.planningNotes}
    initialUpdatedAt={trip.planningNotesUpdatedAt}
    initialUpdatedBy={trip.planningNotesUpdatedBy}
    initialHasUndo={trip.planningNotesPrevious !== null}
  />

  <TripCostSummary ... />
</div>
```

That wrapper already carries the mobile-tab and print classes, so the brief lands under the
**Overview** mobile tab with no new tab work and no change to the tab bar at lines 240-260.

`ItineraryDocument` already receives the whole `trip` object as a prop, so **no new props are
threaded through it** and `src/app/trips/[tripId]/page.tsx` needs no change — its
`SELECT *` at line 17 already returns the new columns.

Note the sibling components' spacing: `CancellationDeadlines` ends with `mb-8` on its own
root (`CancellationDeadlines.tsx:127`). Match that convention rather than adding margin at the
call site.

---

## 2. `TripBrief.tsx`

New `'use client'` component in `src/components/itinerary/`.

```tsx
interface TripBriefProps {
  tripId: string;
  initialContent: string | null;
  initialUpdatedAt: string | null;
  initialUpdatedBy: 'you' | 'assistant' | null;
  initialHasUndo: boolean;
}
```

State: `content`, `updatedAt`, `updatedBy`, `hasUndo`, `editing`, `draft`, `expanded`,
`saving`. Seed from props, exactly as `ItineraryDocument` seeds from its `initial*` props.

### Visual spec

Match the sibling overview panels so it reads as one of them, not as a bolt-on.

- **Heading** — identical to `CancellationDeadlines.tsx:130`:
  `<h2 className="text-sm font-semibold text-stone-600 mb-2">Trip Brief</h2>`
- **Panel** — `rounded-xl border border-stone-200 bg-white p-4`, the same vocabulary as
  `CancellationDeadlines.tsx:145`.
- **Body text** — `whitespace-pre-wrap text-sm text-stone-700`. This is the repo's universal
  free-text convention (`BookingDetailSheet.tsx:109`, `DaySection.tsx:170`). Escaped React
  text only. **No markdown renderer** — the repo has none, and headings read fine as plain
  text.
- **Collapsed by default** — `line-clamp-3` with a **Show more** / **Show less** toggle. Show
  the toggle only when the content actually overflows; a two-line brief should not get a
  pointless "Show more". Simplest reliable test is a length/newline-count threshold rather
  than measuring the DOM.
- **Attribution line** — below the text, when `updatedAt` is set:
  `Updated by Claude · 2h ago` or `Updated by you · 2h ago`, in
  `text-xs text-stone-400`. Map `'assistant'` → "Claude", `'you'` → "you".
- **Undo** — a small button on the attribution line when `hasUndo`. Label it `Undo`, not
  "Revert"; `title` attribute explaining it restores the previous version.
- **Empty state** — italic `text-stone-400`:
  *"No brief yet. Claude will fill this in as you plan, or write one yourself."* plus an
  **Add brief** button that opens the editor.
- **Print** — wrap the whole panel in `no-print`. The brief is working notes, not itinerary,
  and does not belong in a printed trip document. (One class to reverse if that proves wrong.)

### Editing

A `<textarea>` with explicit **Save** and **Cancel** buttons, plus Escape to cancel.

**Deliberately not save-on-blur.** `DaySection.tsx:46-83` blur-saves day title and notes, and
that is right for a one-line field — but blur-saving a long brief loses work on a stray click
outside the textarea. Use `rows={10}` or similar; this field holds real prose.

Styling for the textarea: follow `DaySection.tsx:155-176` —
`w-full text-sm text-stone-700 border border-stone-300 rounded-md p-2 focus:outline-none focus:border-stone-500`.

`Cancel` discards the draft and restores `content`. `Save` PUTs and closes on success.

### API calls

Every fetch through `apiUrl()` from `src/lib/api.ts` — it applies `NEXT_PUBLIC_BASE_PATH`,
and a bare `/api/...` URL breaks in production.

- Save → `PUT apiUrl(`/api/trips/${tripId}/brief`)` with `{ content: draft }`.
  Always `mode: 'replace'` from the site — append is an MCP affordance, not a UI one.
- Undo → `POST apiUrl(`/api/trips/${tripId}/brief/undo`)`.

Both responses carry the full `BriefResponse`; set all four state values from the response
rather than guessing locally, so the UI cannot drift from the server.

Feedback: `toast()` from `src/components/ui/toast.tsx` on success. On failure, restore the
previous local state and toast an error — follow the rollback shape of
`DaySection.tsx:64-70` and `ItineraryDocument.tsx:79-109`, but prefer `toast()` over
`window.alert`.

Disable Save while `saving` is true so a double-click cannot fire two writes.

### Read-only

```tsx
const readOnly = useReadOnly();   // from '@/lib/read-only'
```

Hide **Edit**, **Add brief** and **Undo** when `readOnly` — but **still render the panel and
its text**. A read-only viewer should be able to read the brief; they just cannot change it.

Follow the `TripAssistant.tsx:226` / `AddPlanMenu.tsx:32` convention of gating the control.
Do **not** follow `DaySection`, which leaves its inline editors visible for read-only users
and lets the write fail at the proxy with a 403 — that is a known gap, not a pattern.

---

## 3. Relative time

`src/lib/dates.ts` has `nextDay`, `datesBetween`, `fmt12`, `fmtShortDate`, `fmtWeekdayParts`
and `formatDateRange` — **no relative-time helper**. Add one there rather than inlining it in
the component:

```ts
/** ISO timestamp → 'just now' | '5m ago' | '2h ago' | '3d ago' | 'Aug 8'. */
export function formatRelativeTime(iso: string): string
```

Fall back to an absolute date past about a week — "37d ago" is less useful than "Jun 24".

Note the file header's warning: it is about **date-only** `YYYY-MM-DD` strings and the
noon-UTC anchoring trick. `planning_notes_updated_at` is a full ISO timestamp, so plain
`new Date(iso)` is correct here and the noon-UTC rule does not apply. Say so in the docstring
so nobody later "fixes" it.

---

## Verification

`npm run dev`, open a trip at `http://localhost:3000/travel/trips/{id}`.

**Layout**

1. The panel sits between Cancellation Deadlines and Cost Summary in the left column.
2. On a trip with no brief → empty state and an **Add brief** button.
3. Vertical rhythm matches the sibling panels — no double gap, no cramped edge.
4. A trip with neither cancellation deadlines nor unbooked items still lays out correctly
   (`CancellationDeadlines` renders an empty `div` in that case).

**Editing**

5. Add a short brief → saves, panel shows it, no "Show more" toggle.
6. Add a long brief (20+ lines) → collapses to 3 lines, "Show more" expands, "Show less"
   collapses.
7. Hard-reload → content persists.
8. Edit, then **Cancel** → the change is discarded, original text intact.
9. Edit, then **Escape** → same.
10. Clear the whole brief and Save → back to the empty state.
11. Text with `<script>alert(1)</script>` and emoji renders literally and safely.

**Undo**

12. After a save, the attribution line reads `Updated by you · just now` with an **Undo**
    button. Click it → previous text returns.
13. Click **Undo** again → the newer text comes back (self-inverting).
14. Simulate a Claude write — `curl -X PUT` with `-H "x-internal-token: $INTERNAL_API_TOKEN"`
    (see Phase 1 step 14), reload → the line reads `Updated by Claude · …`.

**Responsive and print**

15. Narrow to <1024px → the brief appears under the **Overview** tab only; it is absent from
    Itinerary and Bookings.
16. Tap targets are at least `min-h-10`, matching the mobile convention elsewhere.
17. Cmd-P on the trip page and `/trips/{id}/print` → the brief does **not** appear.

**Read-only**

18. Run with `NODE_ENV=production`, `ALLOW_NO_ACCESS_HEADER=1`, and `ADMIN_EMAILS` set to an
    address that is **not** yours, sending a `cf-access-authenticated-user-email` header for
    your own address. Edit / Add / Undo are hidden; the brief text is still readable.
19. In that same state, a direct `PUT` to the brief route returns **403** `read_only`.

**Regression**

20. `npm run build` succeeds and `npm run lint` is clean.
21. The rest of the trip page still works — add an event, open a booking sheet, switch mobile
    tabs, reorder an event. `ItineraryDocument` holds a lot of state; confirm nothing was
    disturbed.

## Done when

- Every step above passes
- The panel is visually indistinguishable in style from its sibling overview panels
- Read-only users can read the brief but see no write controls
- No file under `mcp-server/` was modified
- Phase 2 report appended to `PROGRESS.md` with the Status blockquote updated
