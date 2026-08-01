# Phase 3 — Legs editor UI

**Repo:** travel-app. **Read `00-overview.md` first**, then `PROGRESS.md` for what Phases 1–2
delivered.

Builds `src/components/itinerary/TripLegs.tsx` — the "Where you'll be" panel — wires it into
the itinerary overview column, and adds the one-click *suggest from hotels* action. After this
phase the feature is usable end to end and the acceptance test in `00-overview.md` can be run.

---

## 1. Placement

Inside the **existing** overview wrapper in `src/components/itinerary/ItineraryDocument.tsx`
(the `<div className={cn(mobileTab !== 'overview' && 'max-lg:hidden', 'print:block')}>` at
line 289), as the **first** child — above `<CancellationDeadlines>`, so the order becomes:

```
TripLegs → CancellationDeadlines → TripBrief → TripCostSummary
```

Reusing that wrapper means the panel lands under the Overview mobile tab for free. **Do not
add a fourth mobile tab** and do not touch the tab bar at lines 241–261.

`ItineraryDocument` already receives the whole `trip` object, so it needs `trip.id`,
`trip.startDate` and `trip.endDate` with no new props threaded through it. It does **not**
receive legs — fetch them in the panel on mount, or thread `initialLegs` down from
`page.tsx` the way `initialHotels` is. Threading is the better fit for this codebase: one
less client fetch, and `page.tsx` is already querying legs for `legsVersion` (Phase 2).

## 2. The panel

Match `TripBrief.tsx` and `CancellationDeadlines.tsx` for chrome — same card, same
`stone-*` palette, same `<h3>` treatment. It should be indistinguishable in style from its
siblings.

**Empty state.** A trip with no legs shows one line — "Weather is showing for
*{trip.destination}*" — and an **Add place** button. Say what the current behaviour is, so
the panel explains the default rather than looking like a bug.

**Populated state.** Rows in date order:

```
Seattle, WA                     Aug 5 – Aug 6      [edit] [delete]
Port Angeles, WA                Aug 7 – Aug 10     [edit] [delete]
```

- Dates via `fmtShortDate` from `src/lib/dates.ts`.
- Editing a row swaps it for three inline controls: a `PlacesInput` (from
  `@/components/itinerary/PlacesInput` — it gives Google Places autocomplete and degrades to
  a plain `Input` when the Maps key is absent) and two `<Input type="date">`s, plus Save and
  Cancel.
- **Explicit Save/Cancel, not save-on-blur.** A blur save on a three-field row saves
  half-entered state.
- Escape cancels the row edit. Deleting uses the inline-confirm pattern the other panels use
  (`Delete` → `Delete this place?` → `Yes, delete` / `Cancel`), not a `window.confirm`.
- Default dates for a new row: if there are no legs, the whole trip range; otherwise the day
  after the last leg's `endDate` through `trip.endDate`, clamped so `endDate >= startDate`.
  Getting the common case to one click and a place name is the point.

**Warnings.** Call `legWarnings(legs, trip.startDate, trip.endDate)` from `src/lib/legs.ts`
and render the results as muted amber lines under the list:

- `overlap` — "Aug 7 is in both Seattle and Port Angeles — weather will show Port Angeles."
  Name the winner. That is the resolver's rule made visible, and it is the thing a user would
  otherwise have to guess.
- `gap` — "No place set for Aug 8 — weather will show {trip.destination}."
- `outside-trip` — "Aug 12 is after the trip ends."
- `reversed` should be unreachable (the API rejects it), but render it if it appears.

**These never block saving.** They are information, not validation. The one thing the client
rejects locally is `endDate < startDate`, with an inline message, matching the API's 400.

**Optimistic updates, with rollback.** Follow `reorderEvent` in `ItineraryDocument.tsx:80` —
apply locally, fire the request, restore the previous array and show an error on failure.

**After every successful write** (add, edit, delete, suggest-apply) call `router.refresh()`
from `next/navigation`. That is what refreshes the weather strip via `legsVersion`
(`00-overview.md`). Nothing else refreshes it. Verify it actually works rather than assuming;
if `router.refresh()` does not re-run the server component in this Next version, check
`node_modules/next/dist/docs/` for the current API and report what you found.

## 3. Suggest from hotels

Hotels already carry an address and a check-in/check-out date range. When a trip has **no
legs** and **at least one hotel with both an address and a check-in date**, show a secondary
button: **Use my hotels**.

- Clicking it **proposes** rows — it does not write. Show the proposed list with Apply and
  Cancel. Never write legs implicitly (`00-overview.md`, out of scope).
- One proposed leg per hotel: `place` from the address, `startDate` = `checkInDate`,
  `endDate` = `checkOutDate` **minus one day** (you sleep there the night of check-in; you
  leave on checkout morning). Use `nextDay` logic in reverse from `src/lib/dates.ts` or add a
  `previousDay` helper there — do not hand-roll date arithmetic in the component, and do not
  use `new Date(str)` on a date-only string.
- If `checkOutDate` is missing or would produce `endDate < startDate`, fall back to
  `endDate = checkInDate`.
- Reduce the address to something geocodable — a full street address works with the
  geocoder, but it makes a poor caption. Take the city-ish part if you can do it simply
  (e.g. the second-to-last comma-separated component); if it is ambiguous, use the whole
  address. **Do not build an address parser.** Chris can edit the row.
- Merge consecutive proposals that resolve to the same place into one leg.
- Apply issues one POST per row, sequentially, and stops on the first failure with the
  successful ones kept and an error shown.

## 4. Read-only

Read-only users must **see** the list. Hide only Add place, Use my hotels, edit and delete —
the `TripAssistant.tsx:226` / `AddPlanMenu.tsx:32` convention with `useReadOnly()` from
`src/lib/read-only.tsx`.

**Do not follow `DaySection`**, which leaves inline editors visible for read-only users and
lets the write 403. That is a known gap, not a pattern to copy.

The server-side 403 needs no new code — `src/proxy.ts:30` already gates unsafe `/api`
methods. Verify it; do not re-implement it.

## 5. What this phase must NOT touch

- The weather route and `TripWeather.tsx` — Phase 2 owns them. The only contract between the
  two is `router.refresh()` → `legsVersion`.
- `src/lib/legs.ts` — Phase 1 owns it. Add a failing case to `legs.test.mjs` if `legWarnings`
  is wrong; do not compensate in the component.
- `TripEditForm.tsx`. Legs deliberately do not live in the trip dialog
  (`00-overview.md`).
- `mcp-server/` — Phase 4.

---

## Verification

Back up first: `cp local.db local.db.bak`. Use a trip inside the 15-day forecast window so
the weather strip is live and you can watch it react.

1. Trip with no legs → empty state naming `trip.destination`, plus **Add place**.
2. Add a leg → row appears, **and the weather strip above updates without a page reload**.
   This is the whole point of the `legsVersion` wiring; if it does not happen, the feature is
   not done.
3. **And the itinerary below does not remount** — expand a day, open the assistant, then add
   a leg. Neither resets. (If they do, something is bumping `trips.updated_at` — rule 3.)
4. Edit a leg's place → weather caption and forecast both change. Not just the caption: if
   the numbers stay the same, rule 1's cache invalidation is broken — check the PATCH route.
5. Edit only a leg's dates → the split moves, the forecast values for the same city do not
   change.
6. Delete a leg → row goes, weather regroups.
7. Delete the last leg → back to the empty state and the single-destination forecast.
8. Enter `endDate` before `startDate` → inline error, no request sent.
9. Overlapping legs → amber overlap warning naming the winning place, and the weather strip
   agrees with what the warning says.
10. A gap → gap warning, and that stretch shows the destination forecast.
11. Escape mid-edit → row reverts, nothing saved.
12. Delete → Cancel → the leg survives.
13. Simulate a failed save (offline, or a temporarily broken route) → the optimistic row
    rolls back and an error shows. Nothing is left in a phantom state.
14. **Use my hotels** on a trip with two hotels → proposals with correct check-out-minus-one
    end dates; Cancel writes nothing; Apply writes both and refreshes the weather.
15. The button is absent when the trip already has legs, and when no hotel has an address.
16. Narrow to <1024px → the panel appears under the **Overview** tab only, not Itinerary or
    Bookings.
17. Cmd-P and `/trips/{id}/print` → the panel does **not** appear.
18. Read-only user (`NODE_ENV=production`, `ALLOW_NO_ACCESS_HEADER=1`, `ADMIN_EMAILS` set to
    an address that is not yours, with a `cf-access-authenticated-user-email` header) → the
    list is readable and every write control is hidden. Then `POST` to the legs route
    directly → `403 read_only`. Test this for real, not by reading the code.
19. A leg named `<script>alert(1)</script>` renders literally, in the panel and in the
    weather caption.
20. Nothing else on the trip page broke: add an event, open a booking sheet, switch mobile
    tabs, reorder an event. `ItineraryDocument` holds a lot of state.
21. `npm run build` and `npm run lint` clean.
22. Run the **acceptance test** from `00-overview.md` end to end.
23. Remove your scratch legs; leave `local.db` as you found it.

**Done when:** every step passes, and steps 2, 3, 4 and 18 in particular.

Then append a Phase 3 report to `PROGRESS.md`, update the Status blockquote, and run
`node tools/project-status.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com`.
