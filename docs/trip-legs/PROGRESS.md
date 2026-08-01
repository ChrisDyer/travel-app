# Trip Legs — Progress

> **Status: Phases 1-3 implemented locally in travel-app; Phase 4 MCP/deploy remains pending explicit approval.**
> Append one report per completed phase (format below). Never rewrite an earlier
> phase report; later corrections are new dated entries.

Plan docs: `00-overview.md` (read first), then `01-schema-and-api.md`,
`02-weather-by-leg.md`, `03-legs-editor-ui.md`, `04-mcp-deploy-and-docs.md`.
Agent prompts: `prompts.md`.

Report format (copy the skeleton):

```markdown
## Phase N — <title> — YYYY-MM-DD

**Status:** complete | complete-with-deviations | blocked
**What was built/done:** …
**Deviations from spec (and why):** …
**Known gaps / follow-ups:** …
**Verification evidence:** …
```
## Phase 1 - Schema and API - 2026-08-01

**Status:** complete-with-deviations
**What was built/done:** Added migration `007_trip_legs`, `TripLeg`, pure resolver/tests, CRUD routes, and duplicate-trip copying with geocode cache preservation.
**Deviations from spec (and why):** Local HTTP smoke testing covered the core API matrix but not every curl checklist item, duplicate-trip cascade, or cross-trip 404 case.
**Known gaps / follow-ups:** Full manual checklist remains for browser and production verification.
**Verification evidence:** `node --test src/lib/legs.test.mjs` passed; `npm run build` passed; `npm run lint` passed with the repo's existing 11 warnings; local smoke test covered empty GET, validation failures, overlap create, cache clearing/survival, no parent timestamp bump, and cleanup.

## Phase 2 - Weather by leg - 2026-08-01

**Status:** complete-with-deviations
**What was built/done:** Weather route now resolves forecast-window dates through `segmentDates()`, returns `segments[]`, caches forecasts for 30 minutes, caps location work at 8, and writes leg geocodes without touching `updated_at`. `TripWeather` renders single-segment output like the old panel and multi-segment output as captioned groups.
**Deviations from spec (and why):** I used per-location Open-Meteo forecast requests rather than batched latitude/longitude calls because network verification of batching was not available in this sandboxed session.
**Known gaps / follow-ups:** Browser screenshot comparison and network-tab loop verification remain manual.
**Verification evidence:** `npm run build` passed; local `/weather` request returned 200 with a boolean `available` and did not 500 after temporary legs were created.

## Phase 3 - Legs editor UI - 2026-08-01

**Status:** complete-with-deviations
**What was built/done:** Added the no-print `TripLegs` overview panel, read-only-hidden write controls, inline add/edit/delete with optimistic rollback, Escape cancel, hotel-derived proposals with Apply/Cancel, and `router.refresh()` after successful writes.
**Deviations from spec (and why):** Visual/manual browser acceptance steps were not fully run in this terminal-only pass.
**Known gaps / follow-ups:** Complete the manual UI checklist, especially no-remount behavior, read-only production header simulation, and mobile/print placement.
**Verification evidence:** `npm run build` passed; `npm run lint` passed with existing warnings; the server page now passes `initialLegs` and `legsVersion` into the client tree.
