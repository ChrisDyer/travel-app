# Phase 1 — Shell and navigation

**Repo:** travel-app. **Read `00-overview.md` first.**

Restructures the sidebar into sections, derives the active item from the URL instead of a
prop, adds the missing mobile drawer, and extends the contract test so none of it can regress
silently. **No new pages, no new routes, no schema, no data access.** At the end of this phase
the app has the same five routes it started with.

---

## 1. The nav model

`src/appShell/TravelShell.tsx`. Replace the flat `localNav` array (lines 24–32) with a
sectioned structure. Keep it a module-level const in the same file — it is not big enough to
deserve its own module, and `destinations.ts` is reserved for the cross-app registry.

| Section | id | Label | href | Icon |
|---|---|---|---|---|
| Plan | `overview` | Overview | `/` | `LayoutDashboard` |
| Plan | `trips` | Trips | `/trips` | `ListChecks` |
| Plan | `new` | New trip | `/trips/new` | `Plus` |
| Explore | `map` | Map | `/map` | `MapIcon` |
| footer | `settings` | Settings | `/settings` | `Settings2` |

**Ship only `overview`, `trips` and `new` in this phase.** `/map` and `/settings` do not exist
yet; Phase 3 and Phase 4 each add their own row as their first step. Define the section
structure so that adding a row is a one-line change, and leave the `Explore` section out
entirely rather than rendering an empty heading.

`new` stays hidden for read-only users — the existing filter at line 45. Generalize it to a
per-item `adminOnly: true` flag so the rule is on the data rather than in an `id !== "new"`
comparison.

Section headings reuse the existing style from line 58:
`text-[11px] font-semibold uppercase tracking-wide text-slate-500`. The current heading reads
"Travel"; with sections it becomes "Plan" (and later "Explore").

## 2. Active state from the URL

Export a pure helper from the same file so the test can reason about it:

```ts
/** The nav id that `pathname` belongs to, or null. Exact for '/', longest-prefix otherwise. */
export function matchNav(pathname: string): string | null;
```

Rules:

- `usePathname()` **already strips the `/travel` basePath** — it returns `/trips/abc`, not
  `/travel/trips/abc`. Do not strip it again.
- `/` matches `overview` by **exact** match only. A prefix match would make every page match it.
- Everything else matches by prefix, **longest first**, so `/trips/new` selects `new` rather
  than `trips`, and `/trips/{id}` selects `trips`.
- No match → no highlight. Do not fall back to `trips`; that is the bug the current default
  parameter creates.

Then:

- Add `"use client"`-side `const pathname = usePathname()` and compute `active` from
  `matchNav(pathname) === item.id`.
- **Delete the `activeLocalNav` prop** from `TravelShellProps` and remove it from all three
  call sites: `src/app/trips/page.tsx`, `src/app/trips/new/page.tsx`,
  `src/app/trips/[tripId]/page.tsx`. `src/app/error.tsx`, `not-found.tsx` and `loading.tsx`
  render `TravelShell` without it and need no change.
- Keep the active/inactive classes byte-identical: active is `bg-blue-600 text-white`,
  inactive is `text-slate-400 hover:bg-slate-800 hover:text-slate-100`, and
  `aria-current={active ? "page" : undefined}` stays.

`TravelShell` is already a client component (`"use client"` at line 1), so `usePathname()`
needs no new boundary.

## 3. The footer

Replace the non-link blurb at lines 83–88 — the `Route` icon and "Itineraries, bookings, maps,
and exports stay local to Travel" — with the Settings nav row, in the same `mt-auto border-t
border-slate-800 pt-4` region and rendered with the same row markup as the rest of the nav.
Drop the now-unused `Route` import.

**Not in this phase**, since `/settings` does not exist until Phase 4: leave the footer region
in place and empty of the Settings link for now, or render nothing there. Phase 4 fills it.
Do **not** ship a link to a 404.

## 4. Mobile drawer — `src/appShell/MobileNavDrawer.tsx`

New file. Rendered inside the existing `<div className="lg:hidden">` at line 95, beside the
mobile `AppSwitcher`, as a `Menu`-icon trigger.

**Build it on `@base-ui/react/dialog` directly. Do not use `src/components/ui/sheet.tsx`** —
its `SheetContent` hardcodes bottom-on-mobile / right-on-`sm` positioning
(`sheet.tsx:56-60`) and exposes no `side` prop, so making it slide from the left would change
every existing sheet in the app. Read that file for the `Root`/`Portal`/`Backdrop`/`Popup`
composition and the `data-open:` / `data-closed:` animation classes, then write a left-side
variant.

Requirements:

- Slides from the left, `bg-slate-900 text-slate-200`, width ~`w-72`, full height.
- Contains the `AppSwitcher` (`placement="sidebar"`) and the same nav sections as the desktop
  aside, using the same `matchNav()` result. **One nav model, rendered twice** — do not
  duplicate the array.
- Nav rows are `min-h-11` here (the style guide's mobile target) versus `min-h-10` on desktop.
- **Closes on navigation.** Base UI dialogs do not close on route change by themselves; drive
  `open` as controlled state and set it false in the link's `onClick`.
- Trigger has an accessible name (`aria-label="Open navigation"`), a visible focus ring, and
  is `no-print`.
- Escape and backdrop click close it; focus returns to the trigger.

Watch the stacking: the shell header is `z-20`, the desktop aside is `z-30`, and the trip
page's own mobile tab strip is `sticky top-0 z-20`. The drawer and its backdrop must sit above
all of them — `sheet.tsx` uses `z-50`; match it.

## 5. The contract test

`src/appShell/destinations.test.mjs` is a **source-regex** test: it reads files as text and
asserts on their content. It currently pins `bg-slate-900`, `bg-blue-600`,
`aria-label="Travel navigation"`, both `placement=` values, and that the print page contains
neither `TravelShell` nor `AppSwitcher`. **Every one of those must still hold** — a rework that
passes by deleting assertions has not been verified.

Add:

1. The nav rows shipped in this phase, in order, parsed the way the existing manifest test
   parses `destinations.ts`:
   `{ id: "overview", label: "Overview", href: "/" }`, `trips`, `new`.
2. `assert.match(shellSource, /usePathname/)` — active state comes from the URL.
3. `assert.doesNotMatch(shellSource, /activeLocalNav/)` — the prop is gone.
4. A new `drawerSource` read of `MobileNavDrawer.tsx`, asserting it exists, is `slate-900`, and
   carries an `aria-label` on its trigger.
5. `assert.match(shellSource, /lg:hidden/)` — the mobile branch still exists.
6. Assert none of `src/app/trips/page.tsx`, `src/app/trips/new/page.tsx`,
   `src/app/trips/[tripId]/page.tsx` still mention `activeLocalNav`.

Leave the "interactive Travel routes use the shared shell" loop alone in this phase; Phases 2–4
add their pages to it as they land.

## 6. What this phase must NOT touch

- Any file under `src/app/api/` — no routes change.
- `src/db/` — no schema.
- `src/components/itinerary/**` — the trip page body is not in this program.
- `src/components/ui/sheet.tsx` — see §4.
- `src/appShell/destinations.ts` and `AppSwitcher.tsx` — the cross-app registry is pinned by
  `docs/plans/2026-07-site-wide-ui/APP-SHELL-CONTRACT.md` and is not ours to change.
- `src/app/page.tsx` — it stays a redirect until Phase 2.
- `src/app/trips/[tripId]/print/page.tsx` — deliberately shell-free; must stay that way.

---

## Verification

Run the dev server: `npm run dev`, port **3000**, base path `/travel`.

1. `node --test src/appShell/destinations.test.mjs` — passes, **with the new assertions
   present**. Confirm by temporarily reverting one change and watching the test fail.
2. `npm run build` and `npm run lint` are clean (11 pre-existing warnings expected).
3. Desktop ≥1024px, visit each route and check exactly one nav row is highlighted:
   - `/travel/` → **Overview**
   - `/travel/trips` → **Trips**
   - `/travel/trips/new` → **New trip**, *not* Trips
   - `/travel/trips/{id}` → **Trips**
4. `aria-current="page"` is on the highlighted row and on no other (inspect the DOM).
5. Resize to 375px: the aside disappears, a menu trigger appears next to the app switcher.
   Open it — nav is reachable. Tap **Trips** — it navigates **and the drawer closes**. This is
   the regression the whole phase exists to fix; check it explicitly.
6. In the drawer: Escape closes it, backdrop click closes it, focus returns to the trigger,
   and tabbing stays inside while it is open.
7. The drawer renders above the trip page's sticky mobile tab strip — open it on
   `/travel/trips/{id}` at 375px and confirm nothing shows through.
8. Set `ADMIN_EMAILS` to an address that is not yours and reload: **New trip** is absent from
   both the desktop aside and the drawer.
9. `/travel/trips/{id}/print` and Cmd-P: no sidebar, no drawer trigger, no menu button in the
   printed output.
10. Restore `ADMIN_EMAILS`; leave `local.db` untouched (this phase writes nothing).

**Done when:** every step passes, and the only behavioural change a desktop user sees is the
new Overview row and the section headings.

Then append a Phase 1 report to `PROGRESS.md`, update its Status blockquote, and run
`node tools/project-status.mjs` from `C:\Users\chris\OneDrive\Apps\zo-bot.com`.
