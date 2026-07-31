# Agent prompts — Trip Brief

Copy-paste prompts for the implementation agents, one per phase.

**Run them in order, in separate sessions.** Each phase assumes the previous phase's code
exists. Do not run two in parallel.

Note the working directory changes between phases — Phases 1, 2 and 4 start in `travel-app`,
Phase 3 starts in `mcp-server`. These are **separate git repos**, not a monorepo.

---

## Before you start

- **Phase 3 is blocked** on the `travel-write-tools` program in mcp-server. Check
  `mcp-server/docs/plans/travel-write-tools/PROGRESS.md` — all three phases must show
  `**Status:** complete`. Phases 1 and 2 have no such dependency and can run immediately.
- **Back up the local database before Phase 1.** Every phase from 1 onward writes to Chris's
  real `travel-app/local.db`: `cp travel-app/local.db travel-app/local.db.bak`
- **Ports.** Local travel-app dev is **3000**; `3001` in `.env.example` is the VPS port.
  mcp-server is 3005. travel-app's base path is `/travel`, required even on localhost.
- **There is no `mcp-server/.env` on this machine** — it is gitignored and the server has only
  ever run on the VPS. Phase 3 needs one; `travel-write-tools/02-write-tools.md` has the
  contents. Do not copy `.env.example` verbatim: its `TRAVEL_URL` port is the VPS's.
- **Phases 1-3 stay on this machine.** Phase 4 is the first that touches the VPS, runs a
  migration against live data, and needs `ssh chris@91.99.230.234` — do that one when Chris
  can watch it.
- The default shell here is **PowerShell**. Bash-style `VAR=x npm start` is a parse error.

---

## Phase 1 — Schema and API

```
Implement Phase 1 of the Trip Brief program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-brief/00-overview.md          (context, decisions, data contract, conventions)
  docs/trip-brief/01-schema-and-api.md    (your spec)

Phase 1 adds four planning_notes columns to the trips table and builds the dedicated brief
API: GET/PUT /api/trips/{tripId}/brief and POST /api/trips/{tripId}/brief/undo. No UI —
verification is by curl.

Hard constraints:
- Scope is travel-app ONLY. Do not modify anything under mcp-server/. You may read it.
- Do NOT add planningNotes to the colMap in src/app/api/trips/[tripId]/route.ts. That
  omission is deliberate and must carry a comment explaining why: a second write path
  would bypass the undo snapshot and the author attribution, making the Undo button lie.
- Author attribution comes from the x-internal-token request header compared against
  process.env.INTERNAL_API_TOKEN, NEVER from the request body. A client must not be able
  to claim it is the assistant.
- The undo route SWAPS planning_notes and planning_notes_previous, so undo is
  self-inverting. Do not clear previous on undo — that would make a mis-clicked undo
  unrecoverable, which is the exact failure this feature exists to prevent.
- Do not touch trips.updated_at in the brief routes. The trip page passes
  key={trip.updatedAt} to ItineraryDocument, so bumping it remounts the whole client tree.
- Follow the migration pattern in src/db/migrations.ts exactly: an entry in the migrations
  array AND a runCustomMigration branch using addColumnIfMissing. Both are required.
  Check for migrations newer than 005 before picking a number.
- This is not the Next.js in your training data — see AGENTS.md and check
  node_modules/next/dist/docs/ before using an API you half-remember.

Back up the database first: cp local.db local.db.bak

Work through the full verification section, including every guard case. For each guard the
assertion is that the brief is UNCHANGED afterwards — re-GET to prove it, don't just check
the status code. Note that verification step 14 (attribution) proves nothing unless
INTERNAL_API_TOKEN is actually set in the running server; confirm that before trusting it.

Done when: all four columns exist and the migration is idempotent across restarts; every
verification step passes; npm run build succeeds.

Finally, append a Phase 1 report to docs/trip-brief/PROGRESS.md following the template at
the bottom of that file, and update its top Status blockquote. Then run
`node tools/project-status.mjs` from C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 2 — Trip page UI

```
Implement Phase 2 of the Trip Brief program in the travel-app repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-brief/00-overview.md        (context, decisions, conventions)
  docs/trip-brief/02-trip-page-ui.md    (your spec)
  docs/trip-brief/PROGRESS.md           (what Phase 1 actually delivered)

Phase 2 builds src/components/itinerary/TripBrief.tsx and renders it in the trip page's
overview column, between CancellationDeadlines and TripCostSummary.

Hard constraints:
- Scope is travel-app ONLY.
- Render it inside the EXISTING overview wrapper div at ItineraryDocument.tsx:288-307.
  That div already carries the mobile-tab and print classes, so the brief lands under the
  Overview mobile tab for free. Do not add a fourth mobile tab and do not touch the tab bar
  at lines 240-260.
- ItineraryDocument already receives the whole trip object, so no new props are threaded
  through it and src/app/trips/[tripId]/page.tsx needs no change.
- Explicit Save/Cancel buttons, NOT save-on-blur. DaySection blur-saves day notes and
  that's right for a one-line field, but blur-saving a long brief loses work on a stray
  click outside the textarea.
- Read-only users must still SEE the brief. Hide only the Edit / Add / Undo controls, using
  the TripAssistant.tsx:226 / AddPlanMenu.tsx:32 convention. Do NOT follow DaySection, which
  leaves inline editors visible for read-only users and lets the write 403 — that's a known
  gap, not a pattern to copy.
- Every fetch goes through apiUrl() from src/lib/api.ts. A bare /api/... URL breaks in
  production because of NEXT_PUBLIC_BASE_PATH.
- Free text renders as escaped React text with whitespace-pre-wrap. No markdown renderer —
  the repo has none and this feature does not add one. Never dangerouslySetInnerHTML.
- Match the sibling overview panels' styling exactly (stone-* palette, not slate-*). The
  panel should be visually indistinguishable in style from CancellationDeadlines.
- Add formatRelativeTime to src/lib/dates.ts rather than inlining it. Note in its docstring
  that the file's noon-UTC warning applies to date-only strings and NOT to this full ISO
  timestamp, so nobody later "fixes" it.

Verify at every breakpoint: the brief must appear under the Overview mobile tab only, and
must NOT appear in the print view. Test the read-only path for real (NODE_ENV=production,
ALLOW_NO_ACCESS_HEADER=1, ADMIN_EMAILS set to an address that isn't yours, with a
cf-access-authenticated-user-email header) — not just by reading the code.

Also confirm you haven't disturbed the rest of the trip page: add an event, open a booking
sheet, switch mobile tabs, reorder an event. ItineraryDocument holds a lot of state.

Done when: every verification step passes; npm run build and npm run lint are clean.

Finally, append a Phase 2 report to docs/trip-brief/PROGRESS.md and update its Status
blockquote. Then run `node tools/project-status.mjs` from
C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 3 — MCP tools

```
Implement Phase 3 of the Trip Brief program in the mcp-server repo at
C:\Users\chris\OneDrive\Apps\zo-bot.com\mcp-server.

FIRST: check mcp-server/docs/plans/travel-write-tools/PROGRESS.md. All three of its phases
must show "**Status:** complete". This phase builds on the travel-write.js module that
program creates. If it is not finished, stop and tell Chris.

Read these first, in order:
  ../travel-app/docs/trip-brief/00-overview.md   (context, decisions, conventions)
  ../travel-app/docs/trip-brief/03-mcp-tools.md  (your spec)
  ../travel-app/docs/trip-brief/PROGRESS.md      (what phases 1-2 delivered)

Note the plan folder lives in the travel-app repo — this program is mostly a travel-app
feature and Phase 3 is its MCP surface.

Phase 3 adds travel_get_trip_brief and travel_update_trip_brief, plus two changes that make
Claude aware of the brief without needing a tool call first: a server-level `instructions`
string, and a top-level `brief` key in get_trip_details.

Hard constraints:
- Scope is mcp-server ONLY. Do not modify anything under travel-app/src. You may read it.
- The tool DESCRIPTIONS are the point of this phase, not incidental documentation. They are
  the reason Chris chose dedicated tools over a field on travel_update_trip. Use the strings
  in the phase doc verbatim unless you have a concrete reason not to, and keep them
  instructional ("Call this before…", "Call this whenever…") rather than descriptive.
- Do NOT add planningNotes to TRIP_FIELDS.fields. travel_update_trip must reject it. Add the
  redirect note to the travel_describe_fields payload so a model that guesses gets pointed at
  the right tool.
- travel_update_trip_brief goes behind the TRAVEL_WRITE gate; travel_get_trip_brief does NOT
  — it is a pure read and should work even with writes disabled.
- Match house style exactly: 4-arg server.tool() with a raw zod shape (not z.object),
  .describe() on every field, handlers as thin wrappers over top-level async functions,
  and the standard { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  return shape. Implementations throw; no try/catch in handlers.
- Zod here is v3, not v4. travel-app uses v4 — do not carry idioms across.
- Before writing the `instructions` option, check the installed SDK's actual constructor
  signature in node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts. Do not guess.
  If the installed version doesn't support it, say so in the report — do not fake it.
- Do not add client-side validation of content or mode. travel-app's brief route validates
  both and returns actionable 400s that internalRequest surfaces. This differs from the item
  write tools, which validate locally because travel-app's colMap silently ignores unknown
  keys — the brief route has no such gap.

Read the "Local setup" section of travel-write-tools/02-write-tools.md before testing.
There is no mcp-server/.env on this machine and you must create one. .env.example's
TRAVEL_URL says port 3001, which is the VPS port — local travel-app dev is on 3000.

Back up first: cp ../travel-app/local.db ../travel-app/local.db.bak
Never set TRAVEL_URL to zo-bot.com or any remote host — that is the live production
database. Verify the localhost guard rejects a brief PUT aimed at a remote host, but do not
treat it as your first line of defence.

Verification must include checking the genealogy scope still lists exactly 7 tools. That
scope is a family member's access and a regression there is the worst outcome of this
program.

Done when: npm test passes; tools/list shows both new tools on 'full' with TRAVEL_WRITE=1
and only the getter without it, and exactly 7 on 'genealogy' in both states; the initialize
response carries the instructions string; a brief written over MCP shows on the site
attributed to Claude; travel_update_trip rejects planningNotes.

Finally, append a Phase 3 report to ../travel-app/docs/trip-brief/PROGRESS.md (noting
whether the SDK supported `instructions`) and update its Status blockquote. Then run
`node tools/project-status.mjs` from C:\Users\chris\OneDrive\Apps\zo-bot.com.
```

---

## Phase 4 — Deploy and docs

```
Implement Phase 4 of the Trip Brief program. This phase spans both repos; start in
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app.

Read these first, in order:
  docs/trip-brief/00-overview.md         (context)
  docs/trip-brief/04-deploy-and-docs.md  (your spec)
  docs/trip-brief/PROGRESS.md            (what phases 1-3 delivered)

Phase 4 deploys both apps, verifies the feature end-to-end from claude.ai, and brings the
operational docs back in line with reality.

This phase performs a real production deploy AND runs a database migration against live
data. Confirm with Chris before running Deploy-Travel.

Back up the production database first — take a fresh copy, don't rely on the nightly backup
which may be up to 24 hours old. Get the real DB_PATH from travel-app/RUNBOOK.md rather
than assuming; the Next.js standalone build's process.chdir makes DB_PATH mandatory and it
is not the repo-root local.db.

Deploy order matters: Deploy-Travel FIRST, verify the migration applied and the panel
renders in production, THEN Deploy-Mcp. The other order leaves a window where
travel_update_trip_brief exists and 404s.

The acceptance test is the point of the whole program and must be run in the real claude.ai
app with the connector, not by curling the endpoint:
  1. In a fresh conversation, state several constraints for a trip. Claude should call
     travel_update_trip_brief UNPROMPTED.
  2. Open a BRAND NEW conversation and ask for a day plan. It should honour every
     constraint without being told again.
If Claude does not call the tool unprompted, the descriptions or the instructions string
need work. Report that honestly rather than papering over it by telling Claude what to do —
a feature that only works when you remind it hasn't solved the problem it exists for.

Verification must include checking the genealogy scope still lists exactly 7 tools in
production.

Doc updates are not optional and happen in this session, per the operational-docs contract
in the root CLAUDE.md. Three files: travel-app/CLAUDE.md (new "Trip brief" section),
mcp-server/CLAUDE.md (the "Tools (12, all read-only)" heading is already wrong and needs to
match reality after this phase), and travel-app/TESTING.md (a manual checklist block — match
its existing unchecked-box voice). The root README.md most likely needs no change since
this adds no port, process, vhost or cron job — confirm rather than assume.

Then run, from C:\Users\chris\OneDrive\Apps\zo-bot.com:
  node tools/ops-check.mjs
  node tools/project-status.mjs

Done when: both apps deployed and healthy in pm2; production tools/list correct on 'full'
and exactly 7 on 'genealogy'; the acceptance test passes; Undo works in production; all
three docs updated; both tools run clean; scratch test content removed; PROGRESS.md
finished with a Status blockquote reflecting a completed program.
```

---

## Optional — review pass

Worth running after Phase 3, before Phase 4. This is the first field in the app that an
agent rewrites autonomously.

```
Review the uncommitted changes across
C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app and
C:\Users\chris\OneDrive\Apps\zo-bot.com\mcp-server against
travel-app/docs/trip-brief/00-overview.md and the phase docs.

Focus on the single-write-path and attribution guarantees:
- Is there any path that writes planning_notes without snapshotting planning_notes_previous
  in the same statement?
- Can a caller influence planning_notes_updated_by through the request body, query string,
  or any header other than a correct x-internal-token?
- Does the undo swap actually round-trip, or does any path clear previous and make a
  mis-clicked undo unrecoverable?
- Can the generic trip PATCH or travel_update_trip write planningNotes after all?
- Does the 409 conflict path leave the stored brief untouched?
- Does any error path leak INTERNAL_API_TOKEN into a message, log, or tool response?
- Does the read-only gate cover the brief and undo routes server-side, not just in the UI?

Report findings; do not fix them without asking.
```

---

## If a phase goes wrong

- **Local data damaged in Phases 1-3** — restore from `travel-app/local.db.bak`. Stop the dev
  server first; SQLite is in WAL mode, so also remove `local.db-wal` and `local.db-shm`.
- **mcp-server misbehaving after Phase 4** — remove `TRAVEL_WRITE` from `~/mcp-server/.env`
  and `pm2 restart mcp-server`. Writes stop immediately, no rollback deploy needed;
  `travel_get_trip_brief` survives, which is harmless. If the deploy itself is broken,
  `git revert` and re-run `Deploy-Mcp`.
- **travel-app migration failed in production** — the four columns are additive and nullable,
  so a partial apply is not destructive, and `addColumnIfMissing` makes a re-run safe. Check
  `pm2 logs`, fix forward.
- **Production travel data damaged** — restore from the pre-deploy backup, or from
  `~/travel-app/backups/` (cron 02:10) or OneDrive (rclone 03:10). Full procedure in
  `travel-app/RUNBOOK.md`.
