# Implementation Agent Prompts

Copy-paste one prompt per agent session, in order. Each phase must be finished, verified, and committed before starting the next — start each phase in a **fresh session** so the agent reads the current state of the code.

---

## Phase 1

```
Implement the work order in docs/fixes/PHASE-1-cover-images.md in this repo, exactly as written.

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root (this Next.js version has breaking changes — trust the repo's existing patterns over your training data).

Scope discipline:
- The design decisions are final: cover images move to SQLite blob storage in a separate trip_cover_images table, served by a GET API route with a ?v= cache-buster. Do not redesign or "improve" this.
- Do NOT touch src/proxy.ts — the doc explains why it needs no change.
- Do not fix unrelated issues you notice; they are covered by later phase documents.
- Use the code snippets in the doc as written unless they conflict with the actual code, in which case locate the described code by content and note the drift in your report.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section actually performed and passing — including step 7, the production-mode check (npm run build && npm start, then upload an image and see it render). That step reproduces the original bug and is mandatory.
3. grep -r "trip-photos" src/ returns nothing.
4. Commit everything (including the scripts/import-cover-images.mjs script and the DEPLOY.md/RUNBOOK.md edits) with message "Phase 1: move cover images to SQLite blob storage".
5. Report back: files changed, verification results item by item, and any deviations from the doc with reasons. Do not run the import script against the VPS — that is a manual step for the owner; just make sure it works locally per verification step 8.
```

---

## Phase 2

```
Implement the work order in docs/fixes/PHASE-2-trip-editing.md in this repo, exactly as written. Phase 1 is already committed.

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root.

Context you must not lose: the user's bug report was "I can't mark a trip complete." The status ALREADY saves correctly — the fix is making it visible (the badge on the trip detail page) plus the editability gaps listed in the doc. Do not modify the status save path, the API status handling, or the DB schema; none of them are broken.

Scope discipline:
- Follow the doc's 6 steps only. Do not fix unrelated issues (other phase docs cover them).
- Step 5's day-reconcile guard must compare against the STORED dates fetched before the UPDATE runs, as the doc specifies — the order matters.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed and passing — especially step 2 (mark a trip completed and SEE the badge change on the detail page header) and step 5 (a status-only PATCH must not change trip_days row ids; verify with sqlite3 before/after).
3. Commit with message "Phase 2: trip status visibility and full trip editability".
4. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## Phase 3

```
Implement the work order in docs/fixes/PHASE-3-state-sync.md in this repo, exactly as written. Phases 1-2 are already committed.

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root. Also read src/components/itinerary/ItineraryDocument.tsx and src/components/itinerary/KeyBookings.tsx completely before editing either — this phase is a refactor of how those two share state.

The design is fixed: KeyBookings becomes a fully CONTROLLED component. It loses its five collection useState hooks and its updateX wrappers; the arrays arrive as props from ItineraryDocument and all mutations go up through the existing onXChange callbacks. This is a deletion-heavy change — if you find yourself adding new state or new synchronization logic to KeyBookings, you have gone off-plan; stop and re-read the doc.

Scope discipline:
- Three steps only: (1) controlled KeyBookings, (2) key={trip.updatedAt} remount on the detail page, (3) transit wired into the day timeline. Nothing else.
- The remount-on-refresh tradeoff (dialogs close when a trip-level edit saves) is accepted by the owner — do not engineer around it.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed in the running app — these are interaction tests (edit a flight from the timeline and watch Key Bookings update live, etc.); actually click through them.
3. The "Done when" grep check passes: KeyBookings.tsx has no array collection state left.
4. Commit with message "Phase 3: single source of truth for bookings; transit in day timeline".
5. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## Phase 4

```
Implement the work order in docs/fixes/PHASE-4-error-handling.md in this repo, exactly as written. Phases 1-3 are already committed.

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root.

This phase is wide but mechanical. Two halves:
- Part A (client): apply the 4-step error-handling pattern stated at the top of the doc to the exact locations listed. src/components/itinerary/HotelForm.tsx is the reference implementation — when in doubt, make the target code look like HotelForm's submit/delete handlers. Never remove an item from the UI before the server confirms.
- Part B (API): create src/lib/api-helpers.ts exactly as specified, then apply withErrorHandling to every handler and requireFields to every POST in the route table in the doc. The transformation is `export async function POST(...)` → `export const POST = withErrorHandling(async (...) => {...})`. Do NOT change any logic inside the handlers beyond adding requireFields.

Scope discipline: do not wrap api/summary, api/rates, api/gmail/*, or the assistant routes — the doc excludes them. Do not add toast notifications (Phase 7 does that); failures surface via the existing inline setError pattern.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed — including the curl 400-tests, the malformed-JSON test, the stopped-server delete test (item must STAY in the UI with an error shown), and the single-PATCH day-title Enter test (watch the network tab).
3. Commit with message "Phase 4: eliminate silent failures; API validation and error handling".
4. Report back: files changed, a checklist of every location from the doc's tables confirming it was covered, verification results, any deviations with reasons.
```

---

## Phase 5

```
Implement the work order in docs/fixes/PHASE-5-dates-validation.md in this repo, exactly as written. Phases 1-4 are already committed (this phase depends on Phase 2's reconcile guard, Phase 3's KeyBookings props, and Phase 4's error pattern).

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root.

Critical rule for Step 1: dates in this app are 'YYYY-MM-DD' strings. The new src/lib/dates.ts must be created exactly as specified (noon-UTC anchoring), and the two replaced loops must not round-trip date-only values through new Date(...) + toISOString() anywhere. After the change, `grep -rn "toISOString().split" src/app/api` must return nothing.

For Step 2 (form date validation), read each form's actual FormData field names from its body construction before writing the comparison — the doc lists them but verify. Only validate when both dates are non-empty, and copy HotelForm's message style.

For Step 4 (cover upload must not close the edit dialog), the mechanism is a new optional onUpdated prop on TripEditForm, wired differently in TripsClient vs TripHeaderActions — follow the doc's three sub-steps exactly; onSaved keeps its close-on-submit behavior.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed — including the month-boundary trip date check via sqlite3 and the change-cover-mid-edit test (dialog stays open, typed-but-unsaved title survives).
3. Commit with message "Phase 5: timezone-safe dates, form validation, cost and edit-flow fixes".
4. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## Phase 6

```
Implement the work order in docs/fixes/PHASE-6-day-management.md in this repo, exactly as written. Phases 1-5 are already committed.

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root.

First read the doc's "What already works — do NOT rebuild these" section and take it literally: moving events between days, day titles, date-derived days, and .ics export all exist. This phase adds exactly two things: day NOTES (API + inline UI + print page) and up/down reordering for UNTIMED events.

The untimed-only rule for reordering is a design decision, not an oversight: events with a startTime are positioned by their time, so reorder arrows appear only on events without one. Do not add arrows to timed events and do not change the existing sort comparators in ItineraryDocument.tsx or DaySection.tsx.

The reorder handler in the doc is optimistic with rollback — keep that shape (update state first, PATCH both events, restore previous state and alert on failure).

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed — including the curl tests for the extended day PATCH (notes-only update leaves title untouched; empty body → 400), reorder persistence across reload, and the timed/untimed ordering regression check.
3. Commit with message "Phase 6: day notes and untimed event reordering".
4. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## Phase 7

```
Implement the work order in docs/fixes/PHASE-7-experience.md in this repo, exactly as written. Phases 1-6 are already committed; this phase reuses src/lib/trip-status.ts (Phase 2), the error pattern (Phase 4), and src/lib/dates.ts (Phase 5) — import from them, do not duplicate them.

Before touching code: read that file in full, then the "Global conventions" section of docs/fixes/README.md, then AGENTS.md at the repo root.

Six features, all specified with code: toast system, trips-list filter/search/sort, timing chips, status-nudge banner, duplicate-trip API+UI, empty-trip onboarding card. Notes per feature:
- Toasts: no new npm dependency. The module-level emitter pattern in the doc is intentional — no React context. If the animate-in classes don't exist in this Tailwind setup, drop them rather than debugging CSS.
- Trips list: restructure so the filter/search/sort controls render whenever tripList is non-empty; the existing "No trips yet" block remains only for a truly empty list. Persist filter+sort (not search) in localStorage under 'trips-list-prefs'.
- Duplicate trip: the SQL in the doc interleaves literals and placeholders — heed the placeholder-count warning (18 placeholders, 18 run args) and verify by actually duplicating a trip that has events. Copying only trip+days+events (bookings excluded, statuses reset to unbooked, confirmation fields cleared) is a deliberate product decision; do not copy bookings.
- Status nudge: date comparisons are string comparisons on YYYY-MM-DD using localToday(); dismissal is per-trip per-session via sessionStorage.

Definition of done:
1. npx tsc --noEmit and npm run lint pass.
2. Every step in the doc's Verification section performed in the running app — all 7 items, including the sqlite3 spot-check that duplicated events have no confirmation numbers, and the print-preview check that toasts don't appear in print.
3. Commit with message "Phase 7: toasts, trips-list controls, status intelligence, duplicate trip, onboarding".
4. Report back: files changed, verification results item by item, any deviations with reasons.
```

---

## If an agent gets stuck

Every prompt implies this, but if you need to say it explicitly mid-session:

```
If the doc's line numbers have drifted or a symbol was renamed, find the described code by its content and proceed, noting the drift in your report. If the doc genuinely contradicts the code's current behavior, STOP, describe the contradiction, and wait — do not improvise a different design.
```
