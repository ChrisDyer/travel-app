# Travel App Fix & Upgrade Program

This folder contains **seven phase documents**, each a self-contained work order for an implementation agent. They fix every defect found in the July 2026 audit (including the two user-reported bugs: broken cover images in production, and "can't mark a trip complete") and add the experience upgrades the owner requested.

**Execute phases in order.** Each phase is independently testable and must be committed on its own. Later phases assume earlier ones are done (dependencies are listed at the top of each doc).

| Phase | Document | Theme | Risk / size |
|-------|----------|-------|-------------|
| 1 | `PHASE-1-cover-images.md` | Cover images → SQLite blobs (fixes the broken-image bug + deploy data loss) | High value, isolated |
| 2 | `PHASE-2-trip-editing.md` | Status visibility (fixes "can't mark complete") + full trip editability | Small, isolated |
| 3 | `PHASE-3-state-sync.md` | One source of truth for bookings; transit in the timeline | Biggest refactor |
| 4 | `PHASE-4-error-handling.md` | Kill silent failures; API validation + clean errors | Wide but mechanical |
| 5 | `PHASE-5-dates-validation.md` | Timezone-safe dates, form validation, cost correctness, edit-flow polish | Medium |
| 6 | `PHASE-6-day-management.md` | Day notes, event reordering | Feature |
| 7 | `PHASE-7-experience.md` | Toasts, list filters/search/sort, timing chips, status nudge, duplicate trip, onboarding | Feature, do LAST |

## Global conventions (read before every phase)

1. **This is Next.js 16.2.6 with breaking changes** vs. what you may remember. Read `AGENTS.md` at the repo root; consult `node_modules/next/dist/docs/` when unsure about an API. Route handlers receive `params` as a **Promise** and must `await` it — every existing route does this; copy the existing pattern.
2. **Run the app:** `npm run dev` (http://localhost:3000). SQLite DB at `local.db`; migrations auto-run on boot from `src/db/migrations.ts`.
3. **Migrations:** append a new `{ name: '00N_...', sql: ... }` entry to the `migrations` array with the next number. Never edit an already-shipped migration. Before testing a migration, back up: `copy local.db local.db.bak` (PowerShell) / `cp local.db local.db.bak`.
4. **After each phase:** `npx tsc --noEmit` and `npm run lint` must pass, every item in the phase's Verification section must pass, then commit with a message naming the phase.
5. **Single-user app by design:** `getUserId()` returns `'local'` (`src/lib/auth.ts`); Cloudflare Access guards production (`src/proxy.ts`). Keep the ownership-check pattern in routes; do NOT build multi-user auth (explicitly out of scope).
6. **Style:** match the existing Tailwind stone-palette look; serif headings (`font-serif`), small muted labels. Forms show errors inline in red (`<p className="text-sm text-red-600">`). Interactive-only elements get the `no-print` class.
7. **Data invariants:** dates are `YYYY-MM-DD` strings (compare as strings; never round-trip through `Date`+`toISOString` — see Phase 5); times are `HH:MM`; booleans in SQLite are 0/1; `trips.travelers` is a JSON string array.

## Complete issue index

Severity: 🔴 breaks core use · 🟠 data loss / silent failure · 🟡 correctness/UX defect · 🟢 improvement

| ID | Sev | Issue / feature | Anchor |
|----|-----|-----------------|--------|
| 1.1 | 🔴 | Uploaded cover images 404 in production (standalone `public/` snapshot at boot) | `cover-image/route.ts:27-29` |
| 1.2 | 🔴 | Deploy `rm -rf .next` deletes all uploads; backup cron syncs wrong dir | `DEPLOY.md:182,232` |
| 1.3 | 🟠 | Upload: no size/type validation; invalid file → unhandled 500 | `cover-image/route.ts:16-24` |
| 1.4 | 🟠 | Upload UI: failures silent; network error freezes "Uploading…" | `CoverImageUpload.tsx:17-39` |
| 1.5 | 🟠 | New-trip page ignores cover-upload failures | `trips/new/page.tsx:53-57` |
| 1.6 | 🟡 | Stranded production images / dead URLs need one-time import | `scripts/import-cover-images.mjs` (new) |
| 2.1 | 🔴 | Status saves but is invisible on detail page → "mark complete doesn't work" | `trips/[tripId]/page.tsx:44-48` |
| 2.2 | 🟠 | POST /api/trips drops travelMode/rentalCarNeeded (+ travelers/notes/budget) | `api/trips/route.ts:15-24` |
| 2.3 | 🟡 | `travelers` field has no UI anywhere | `TripEditForm.tsx` |
| 2.4 | 🟡 | `digestEnabled`/`digestDayOfWeek` have no UI anywhere | `TripEditForm.tsx` |
| 2.5 | 🟡 | Day-reconcile runs on every PATCH, even status-only | `api/trips/[tripId]/route.ts:39` |
| 2.6 | 🟡 | "Events will be hidden" warning — they're permanently cascade-deleted | `TripEditForm.tsx:43` |
| 3.1 | 🔴 | KeyBookings duplicate state → stale/ghost bookings after timeline edits; assistant adds invisible | `KeyBookings.tsx:105-132` |
| 3.2 | 🟠 | `router.refresh()` never re-seeds client state (date edits need hard reload) | `ItineraryDocument.tsx:31-37` |
| 3.3 | 🟡 | Transit invisible/uneditable in day timeline (print page has it) | `DaySection.tsx` |
| 4.1 | 🟠 | Parking delete removes from UI even on server failure | `ParkingForm.tsx:68-74` |
| 4.2 | 🟠 | Trip delete same flaw | `TripEditForm.tsx:75-80` |
| 4.3 | 🟠 | Packing toggle/delete fail silently | `PackingChecklist.tsx:48-65` |
| 4.4 | 🟡 | Day-title save: silent failure + Enter double-fires PATCH | `DaySection.tsx:58-68,119-120` |
| 4.5 | 🟡 | Stale error text not reset at submit in 5 forms | Event/Flight/RentalCar/Transit/Parking forms |
| 4.6 | 🟡 | `result.addedEvents.length` missing `?.` | `TripAssistant.tsx:204` |
| 4.7 | 🟠 | No API route validates required fields or catches errors (opaque 500s) | all `api/trips/**` |
| 5.1 | 🟠 | Day generation off-by-one on non-UTC servers (local-midnight + toISOString) | `api/trips/route.ts:26-38` |
| 5.2 | 🟡 | No end≥start validation in Flight/Transit/RentalCar/Parking forms | those forms |
| 5.3 | 🟡 | Cost summary counts `note` events; FX outage hides totals confusingly | `TripCostSummary.tsx:33-43` |
| 5.4 | 🟠 | Cover upload mid-edit closes dialog, discarding unsaved edits | `TripEditForm.tsx:170-174` |
| 5.5 | 🟡 | List edit missing `router.refresh()` | `TripsClient.tsx:33-36` |
| 5.6 | 🟡 | Key Bookings sections default collapsed — bookings look missing | `KeyBookings.tsx:122-126` |
| 6.1 | 🟢 | Day notes (column exists; no API/UI) | `days/[dayId]/route.ts`, `DaySection.tsx` |
| 6.2 | 🟢 | Reorder untimed events (sort_order exists; no UI) | `EventCard.tsx` + parents |
| 7.1 | 🟢 | Toast system + success feedback everywhere | `src/components/ui/toast.tsx` (new) |
| 7.2 | 🟢 | Trips list filter/search/sort with persistence | `TripsClient.tsx` |
| 7.3 | 🟢 | Trip timing chip (In N days / Day X of Y / Ended) | `src/lib/trip-status.ts` |
| 7.4 | 🟢 | Smart status nudge banner with one-click transition | `TripStatusNudge.tsx` (new) |
| 7.5 | 🟢 | Duplicate trip (API + UI) | `api/trips/[tripId]/duplicate` (new) |
| 7.6 | 🟢 | Empty-trip onboarding card | `ItineraryDocument.tsx` |

## Already verified — do not re-fix

- `.ics` calendar export exists and is exposed (`TripHeaderActions.tsx:22-28`).
- Events can already be moved between days (`EventForm.tsx:128-146`).
- All routes correctly `await params` (no missing-await bug in this codebase).
- `HotelForm.tsx` is the reference for correct submit/delete error handling; Event/Flight/RentalCar/Transit forms already check `res.ok` on delete.
- `src/proxy.ts` needs no changes for any phase.

## Out of scope

- Multi-user auth (owner's explicit decision — single user `'local'` behind Cloudflare Access stays).

## Production deploy notes

- Phase 1 requires the **one-time import script run on the VPS** after deploy (instructions in the phase doc) and the DEPLOY/RUNBOOK edits shipped with it.
- All other phases deploy normally via the existing `Deploy-Travel` flow. Migrations apply automatically at boot.
