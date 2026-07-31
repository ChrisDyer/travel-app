# Trip Brief — Overview

**Every phase agent reads this file first.** It carries the problem, the settled design
decisions, the data contract, and the conventions each phase must honour. The per-phase
docs assume you have read it and do not repeat it.

---

## The problem

Chris plans trips by talking to Claude in the Claude Chat app, which reaches travel-app
through the `zo-bot` MCP server at `mcp.zo-bot.com`. That conversation is amnesiac. Every
new chat session starts knowing the itinerary — flights, hotels, events — but knowing
nothing about *why* it looks that way: the goals, must-dos, constraints and open questions
that shaped it. Those get re-litigated from scratch each session.

The itinerary records decisions. Nothing records **intent**.

## The feature

A **Trip Brief**: one free-text field per trip holding the traveller's stated requirements.

- Claude **reads** it before planning or changing a trip.
- Claude **writes** to it whenever Chris states a new goal, requirement, preference or
  constraint, so the context survives into the next conversation.
- Chris can **read and correct** it on the trip page, with one-click **Undo** when Claude
  gets it wrong.

Content is free text with markdown-ish headings the model maintains — typically Goals,
Must-do, Constraints, Open questions, Rejected ideas. Nothing enforces that structure.

---

## Settled design decisions

These were decided with Chris during planning. **Do not revisit them.** If a phase doc
seems to contradict one, the phase doc is wrong — flag it rather than silently changing
course.

| Decision | Choice | Why |
|---|---|---|
| Storage | New `planning_notes` column on `trips` | Not the existing `trips.notes`, which stays Chris's own field so an agent rewrite can't wipe it |
| Shape | One free-text blob | Structured JSON is brittle and awkward to free-hand edit on the site |
| Page placement | Overview column, between Cancellation Deadlines and Cost Summary | Compact panel slot; inherits the Overview mobile tab for free |
| Safety net | One-click Undo from a `previous` snapshot column | Answers "in case it looks wrong to me" cheaply. Not full revision history |
| MCP surface | Dedicated `travel_get_trip_brief` / `travel_update_trip_brief` | The **tool descriptions** are the mechanism that makes Claude reliably read and maintain the brief. A field on `travel_update_trip` would be one string in a 15-field list with nothing signalling it is a memory to keep current |
| In-app Trip Assistant | Unchanged | Deliberately out of scope — keeps blast radius off a feature that is mid-refactor |

### Explicitly out of scope

- `src/components/trips/TripAssistant.tsx` and `src/app/api/trips/[tripId]/assistant/` —
  the in-app assistant does not read or write the brief. Its prompt is untouched.
- `trips.notes` and its textarea in `TripEditForm.tsx` — left exactly as they are.
- Full revision history. One level of undo only.
- Markdown rendering. The repo has no markdown renderer and this feature does not add one.

---

## Dependency: the travel write-tools program

**Phase 3 is blocked** on `mcp-server/docs/plans/travel-write-tools/` (3 phases), which
another agent is implementing. Phase 3 of *this* program builds directly on the module that
one creates, `mcp-server/travel-write.js`, and reuses:

- `internalRequest(method, url, body, timeoutMs)` — the non-GET HTTP helper
- `assertLocalWriteTarget()` — the localhost write guard, which refuses any non-GET aimed at
  a non-loopback host
- `travelUrl(tripId, ...segments)` — URL builder with `encodeURIComponent`
- The `TRAVEL_WRITE=1` env kill switch
- `TRIP_FIELDS` — the trip field registry served by `travel_describe_fields`

**Before starting Phase 3, check `mcp-server/docs/plans/travel-write-tools/PROGRESS.md`.**
All three phases must show `**Status:** complete`. If they do not, stop and tell Chris.

Phases 1 and 2 of this program are travel-app only and have **no** dependency on that work.
They can proceed immediately and in parallel with it.

---

## Repo layout

This program spans two independent git repos. They are separate repos, not a monorepo —
there is no root-level git.

| Repo | Path | Phases |
|---|---|---|
| travel-app | `C:\Users\chris\OneDrive\Apps\zo-bot.com\travel-app` | 1, 2, and its half of 4 |
| mcp-server | `C:\Users\chris\OneDrive\Apps\zo-bot.com\mcp-server` | 3, and its half of 4 |

**Each phase touches exactly one repo** until Phase 4. Phase 1 and 2 agents must not modify
anything under `mcp-server/`; the Phase 3 agent must not modify anything under
`travel-app/src`. Reading across the boundary is fine and often necessary.

How they talk: mcp-server calls travel-app over **localhost HTTP**, never the database
directly. `BASES.travel` defaults to `http://localhost:3001/travel`. The `/travel` suffix is
mandatory — travel-app runs with Next's `basePath: '/travel'`, so its router requires the
prefix even on localhost.

> **Port trap.** `3001` is the **VPS** port. Local travel-app dev runs on **3000**, so
> local testing needs `TRAVEL_URL=http://localhost:3000/travel`. `.env.example` is written
> for the VPS; do not copy it verbatim for local work.

---

## The data contract

Four new columns on `trips`. Every phase depends on these names.

| Column | Type | Meaning |
|---|---|---|
| `planning_notes` | `TEXT` | The brief itself. `NULL` when unset — never an empty string |
| `planning_notes_previous` | `TEXT` | The content before the most recent write. `NULL` when there is nothing to undo |
| `planning_notes_updated_at` | `TEXT` | ISO 8601 timestamp of the most recent write |
| `planning_notes_updated_by` | `TEXT` | `'you'` or `'assistant'` |

Camel-cased by `camelize()` into `planningNotes`, `planningNotesPrevious`,
`planningNotesUpdatedAt`, `planningNotesUpdatedBy`.

### Author attribution

`planning_notes_updated_by` is derived **server-side from the request headers**, never from
the request body. A client cannot claim to be the assistant.

```ts
const token = process.env.INTERNAL_API_TOKEN;
const author = token && request.headers.get('x-internal-token') === token ? 'assistant' : 'you';
```

This works because `src/proxy.ts` only *reads* `x-internal-token` (line 17) before calling
`NextResponse.next()` — it does not strip it, so the header reaches the route handler intact.

> **Local-dev trap.** `INTERNAL_API_TOKEN` is usually unset in local travel-app dev. When it
> is unset the comparison short-circuits and **every** write is attributed to `'you'`. To
> exercise the `'assistant'` path locally you must set it in travel-app's environment and
> send a matching header.

### Undo semantics

Every write snapshots the outgoing content into `planning_notes_previous` **in the same
statement** that sets `planning_notes`. Undo then **swaps** the two columns, which makes it
self-inverting: undo twice and you are back where you started. That means a mis-clicked undo
costs nothing.

### The single write path

`planning_notes` is writable **only** through `PATCH`-equivalent traffic to
`/api/trips/{tripId}/brief`. It is deliberately excluded from:

- the `colMap` in `src/app/api/trips/[tripId]/route.ts` (the generic trip PATCH)
- `TRIP_FIELDS.fields` in `mcp-server/travel-write.js` (so `travel_update_trip` rejects it)

Both exclusions are intentional and must carry a comment saying so. A second write path
would bypass the snapshot and the attribution, and the Undo button would then lie.

---

## Conventions each phase must honour

**travel-app** (Phases 1, 2)

- Data access is raw `better-sqlite3` — no ORM. `db.prepare(...)` inline in routes and
  server components. `camelize<T>` / `camelizeAll<T>` from `@/db` convert snake_case rows.
- Route handlers wrap in `withErrorHandling` from `src/lib/api-helpers.ts`, which turns
  `SyntaxError` into a 400 and anything else into a 500.
- Ownership is enforced with `AND user_id = ?` in every statement, using `getUserId(request)`.
- **Client fetches must go through `apiUrl()`** from `src/lib/api.ts` — it applies
  `NEXT_PUBLIC_BASE_PATH`. A bare `/api/...` fetch breaks in production.
- Tailwind v4, CSS-first (no `tailwind.config.js`). `cn()` from `src/lib/utils.ts`.
- The itinerary document body uses the `stone-*` palette; the shell chrome uses `slate-*`.
  New itinerary panels are `stone-*`.
- Free text renders as escaped React text with `whitespace-pre-wrap`. Never
  `dangerouslySetInnerHTML`.
- This is **not** the Next.js in your training data (see `AGENTS.md`). Check
  `node_modules/next/dist/docs/` before reaching for an API you half-remember.

**mcp-server** (Phase 3)

- Single-file Express + MCP SDK server. Tools registered inside `createMcpServer(scope)`.
- `server.tool(name, description, zodRawShape, handler)` — the **4-arg** form, third argument
  a **raw zod shape object** (`{ tripId: z.string().describe(...) }`), not `z.object(...)`,
  not JSON Schema.
- **Zod is v3 here**, not v4. (travel-app uses v4 — do not carry idioms across.)
- Handlers are thin wrappers over top-level `async function`s and return
  `{ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }`.
- Implementations **throw**; the SDK converts a throw into an `isError` result. No try/catch
  in handlers.
- Two scopes: `full` (Chris) and `genealogy` (a family member, 7 tools). **Nothing in this
  program may change what the `genealogy` scope sees.** A regression there is the worst
  possible outcome — verify it explicitly in Phases 3 and 4.

---

## Phase map

| Phase | Doc | Repo | Summary |
|---|---|---|---|
| 1 | `01-schema-and-api.md` | travel-app | Migration, `Trip` type, brief GET/PUT + undo routes. No UI |
| 2 | `02-trip-page-ui.md` | travel-app | `TripBrief.tsx` panel and its wiring |
| 3 | `03-mcp-tools.md` | mcp-server | The two brief tools + server instructions. **Blocked on write-tools** |
| 4 | `04-deploy-and-docs.md` | both | Deploy, end-to-end verification from claude.ai, operational docs |

Run them in order, in separate sessions. Append a report to `PROGRESS.md` at the end of each.

---

## What success looks like

The acceptance test for the whole program, run in Phase 4:

> In Claude Chat: *"For the Japan trip — I want a relaxed pace, no more than one big thing a
> day, no early flights, budget around $4k."* Claude calls `travel_update_trip_brief`.
> Then open a **brand new conversation** and ask it to suggest a day plan. It should honour
> every one of those constraints without being told again.

If that works, the feature works. Everything else is plumbing.
