# Travel App UI/UX Redesign Program

This folder contains **six phase documents**, each a self-contained work order for an implementation agent, plus `PROMPTS.md` with the prompt to paste for each phase. This program follows the completed fix program in `docs/fixes/` (phases 1–7, all committed as of commit `286bcba`).

**The theme:** the trip page shows too much on every card. TripIt-style progressive disclosure — compact cards showing logo/name/time/status, with a slide-over detail drawer holding everything else (confirmation numbers, addresses, seats, policies, costs, notes) plus Edit and Delete. On top of that: a unified "Add a plan" button, a trip-header ⋯ menu, a real mobile experience, and a trips-list refresh.

**Execute phases in order.** Each phase is independently shippable and must be committed on its own. Later phases assume earlier ones are done.

| Phase | Document | Theme | Size / risk |
|-------|----------|-------|-------------|
| 1 | `PHASE-1-foundation.md` | Sheet + DropdownMenu primitives, date-helper consolidation, duplicate-trip data-loss fix | Medium, zero visual change |
| 2 | `PHASE-2-detail-drawer.md` | Booking detail drawer; card click = view (not edit); form-mount consolidation | Biggest behavior change |
| 3 | `PHASE-3-compact-cards.md` | Slim every card to TripIt density | Visual, mechanical |
| 4 | `PHASE-4-add-plan-and-menus.md` | Unified "Add a plan" button + header ⋯ "More options" menu | Feature |
| 5 | `PHASE-5-mobile.md` | Tabbed mobile layout, bottom-sheet drawer, touch targets | Wide, CSS-heavy |
| 6 | `PHASE-6-trips-list.md` | Cover-image-forward trip cards in a grid, per-card ⋯ menu | Cosmetic, isolated |

## Global conventions (read before every phase)

1. **This is Next.js 16.2.6 with breaking changes** vs. your training data. Read `AGENTS.md` at the repo root; consult `node_modules/next/dist/docs/` when unsure about an API. Route handlers receive `params` as a **Promise** and must `await` it — copy the existing pattern.
2. **Base UI, not Radix.** UI primitives are built on `@base-ui/react` (v1.5). Composition uses the `render={<Component/>}` prop, **not** `asChild`. `src/components/ui/dialog.tsx` is the reference implementation — copy its patterns (Backdrop, Popup, Portal, `data-open:animate-in` classes) for any new primitive.
3. **Run the app:** `npm run dev` (http://localhost:3000). SQLite DB at `local.db`; migrations auto-run on boot from `src/db/migrations.ts`. Back up before schema-adjacent work: `copy local.db local.db.bak`.
4. **After each phase:** `npx tsc --noEmit` and `npm run lint` must pass, every item in the phase's Verification section must pass in the running app, then commit with a message naming the phase (e.g. "Redesign phase 2: booking detail drawer").
5. **Style:** warm stone palette (`bg-stone-50` pages, white cards, `stone-200` borders), serif headings (`font-serif` = Playfair Display), small muted labels. Domain accents: blue = flights, amber = hotels, slate = parking/rental/transit, emerald = confirmed, red = destructive/unbooked.
6. **Data invariants:** dates are `YYYY-MM-DD` strings (compare as strings; never round-trip through `Date` + `toISOString` — see `src/lib/dates.ts` header comment); times are `HH:MM`; SQLite booleans are 0/1; `trips.travelers` is a JSON string array.
7. **Single-user app by design.** `getUserId()` returns `'local'`. Keep the ownership-check pattern in API routes. Multi-user auth is out of scope.
8. **State flow:** server pages read SQLite synchronously and pass `initial*` props; `ItineraryDocument.tsx` owns all booking/event arrays in `useState` and mutates optimistically via the REST routes. The trip detail page remounts `ItineraryDocument` via `key={trip.updatedAt}` when trip metadata is saved — open overlays closing at that moment is accepted behavior.

## Print safety — do NOT touch these (any phase)

The print output must keep FULL detail even as screen cards get slimmer. Unless a phase doc explicitly says otherwise:

- `public/print.css` — never modify.
- The **print-only booking list** in `KeyBookings.tsx` (the big array-map rendering `hidden print:flex` cards near the bottom of the file) — never modify, never "clean up", never deduplicate against the visible cards.
- `src/app/trips/[tripId]/print/page.tsx` — the standalone print route; never modify (except mechanical import swaps Phase 1 specifies).
- Every new overlay/menu/FAB/tab-control introduced by this program gets the `no-print` class.

## Out of scope for the whole program

- Dark mode (token system exists in `globals.css` but stays dormant — owner's decision).
- Packing checklist UI revival (owner's decision).
- Multi-user auth / sharing.
- New DB columns for bookings (e.g. `booking_url` on hotels) — the drawer surfaces fields that already exist.

## If a doc contradicts the code

Line numbers and snippets reflect the code as of commit `286bcba`. If something has drifted, locate the described code by content and proceed, noting the drift in your report. If the doc genuinely contradicts current behavior, STOP and report the contradiction — do not improvise a different design.
