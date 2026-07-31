# Phase 3 — MCP tools

**Prerequisites: read `00-overview.md` first, then `PROGRESS.md`.**

**This phase is blocked** until `mcp-server/docs/plans/travel-write-tools/PROGRESS.md` shows
all three of its phases `complete`. Check that first; if it does not, stop and tell Chris.

Expose the brief to Claude Chat, and make Claude reliably *use* it. **mcp-server only** —
nothing under `travel-app/src` may be modified.

Working directory: `C:\Users\chris\OneDrive\Apps\zo-bot.com\mcp-server`.

## Deliverables

- `mcp-server/travel-write.js` — brief functions; `TRIP_FIELDS` note
- `mcp-server/server.js` — two tools, server `instructions`, `brief` key in
  `get_trip_details`, version bump
- `mcp-server/test/travel-write.test.js` — cases for the new code
- `mcp-server/.env.example` — no new vars, but confirm
- Phase 3 report appended to `PROGRESS.md`

---

## 1. Why dedicated tools

The write-tools program already ships `travel_update_trip`. The brief could have been one
more field on it. It is not, deliberately — **the tool descriptions are the feature**.

A field named `planningNotes` sitting in a 15-item list returned by `travel_describe_fields`
tells a model nothing about when to read it or that it should be kept current. A tool called
`travel_get_trip_brief` whose description opens *"Call this before planning or changing a
trip's itinerary"* does. The whole point of this phase is discoverability, so treat the
description strings as load-bearing code, not documentation.

The second reason is safety: routing every brief write through one endpoint keeps the undo
snapshot and author attribution impossible to bypass.

---

## 2. `travel-write.js`

Append a `── trip brief ──` section, matching the `── section ──` comment-rule style used
throughout the file. Reuse the Phase 1 foundations from the write-tools program; do not
reimplement them.

```js
export async function travelGetTripBrief({ tripId }) {
  return internalRequest('GET', travelUrl(tripId, 'brief'))
}

export async function travelUpdateTripBrief({ tripId, content, mode = 'replace', expectedUpdatedAt }) {
  return internalRequest('PUT', travelUrl(tripId, 'brief'), { content, mode, expectedUpdatedAt })
}
```

`assertLocalWriteTarget` guards the `PUT` for free — a misconfigured `TRAVEL_URL` pointing at
production throws before the fetch. `travelUrl` handles `encodeURIComponent`.

Do not add client-side validation of `content` or `mode`. travel-app's brief route already
validates both and returns actionable 400s, and `internalRequest` surfaces the upstream
`{ error }` message. This differs from the item write tools, which validate locally *because*
travel-app's `colMap` silently ignores unknown keys — the brief route has no such gap.

### `TRIP_FIELDS`

**Do not add `planningNotes` to `TRIP_FIELDS.fields`.** Leaving it out means
`validateFields` rejects it from `travel_update_trip` with its standard
`Unknown field(s) for kind 'trip': planningNotes. Valid fields: …` error — which is correct,
but unhelpful on its own.

Add a note to the `trip` entry that `travel_describe_fields` returns, so a model that guesses
`planningNotes` is redirected rather than left guessing:

> "The trip's planning brief (goals, requirements, constraints) is not writable here. Use
> `travel_get_trip_brief` and `travel_update_trip_brief` instead — they maintain undo history
> and authorship that this tool cannot."

Put the note in the returned payload, not only in a code comment.

---

## 3. `server.js` — tool registration

Register both inside the existing `if (scope === 'full')` block, after the existing travel
tools. Use the **4-arg** `server.tool(name, description, zodRawShape, handler)` form with a
**raw zod v3 shape** — not `z.object(...)`.

**Gating:** `travel_update_trip_brief` goes behind the same `TRAVEL_WRITE` check as the other
write tools. `travel_get_trip_brief` is **ungated** — it is a pure read, and a read-only
deployment should still let Claude see the brief.

### The descriptions

These strings are the reason this phase exists. Write them to **instruct**, not to describe.
Use these verbatim unless you have a concrete reason not to:

**`travel_get_trip_brief`**

> Read the persistent planning brief for a trip: the traveller's goals, must-dos,
> constraints, open questions, and previously rejected ideas. **Call this before planning or
> changing a trip's itinerary** — it carries context from previous conversations that is not
> present in the itinerary itself.

**`travel_update_trip_brief`**

> Update a trip's planning brief. **Call this whenever the traveller states a new goal,
> requirement, preference or constraint, or rejects an idea** — that way the context survives
> into future conversations instead of being lost when this one ends. Use `mode='append'` to
> add a point without disturbing what is already there; use `mode='replace'` only when
> reorganising the whole brief. Returns the previous content, so a bad write can be reverted.

Parameter descriptions (`.describe()` on every field, per house style):

- `tripId` — "The trip ID from get_trips"
- `content` — "The brief text. Markdown-style headings are fine (## Goals, ## Must-do, ## Constraints, ## Open questions). Pass an empty string to clear the brief."
- `mode` — "'append' adds to the existing brief; 'replace' overwrites it. Defaults to 'replace'."
- `expectedUpdatedAt` — "Optional. The updatedAt you last read. If the brief changed since then the call fails with a conflict instead of overwriting someone else's edit."

Handlers stay thin wrappers returning the standard
`{ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }`. Implementations throw;
no try/catch.

---

## 4. Making Claude aware without a tool call

Descriptions only help once the model is already looking at the tool list for a reason. Two
additions close that gap.

### 4a. Server instructions

`server.js:194-198` constructs the server with no options:

```js
const server = new McpServer({ name: 'zo-bot-personal', version: '1.2.0' })
```

Pass a second argument. The SDK returns `instructions` in the `initialize` response, so it is
in context from the **first message of every conversation**, before any tool is called:

```js
const server = new McpServer(
  { name: 'zo-bot-personal', version: '1.3.0' },
  { instructions: `...` }
)
```

The string should be short and behavioural. Cover: this server exposes Chris's personal apps;
each travel trip has a **planning brief** holding stated goals and constraints; read it with
`travel_get_trip_brief` before planning or changing a trip; update it with
`travel_update_trip_brief` whenever a new requirement or preference is stated. Keep it to a
few sentences — it is prepended to every conversation and competes for attention.

Verify the SDK's actual constructor signature in
`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` before writing it. If
`instructions` is not supported by the installed version, **say so in the phase report and do
not fake it** — the tool descriptions still work, they are just less reliable.

Bump `version` to `1.3.0` while you are in that constructor.

### 4b. Surface the brief in `get_trip_details`

`getTripDetails()` (`server.js:56-77`) returns the raw trip row, where `planningNotes` would
sit among ~18 fields and read as incidental. Add an explicit top-level key:

```js
return {
  trip: ...,
  brief: trip.status === 'fulfilled' && trip.value
    ? {
        content: trip.value.planningNotes ?? null,
        updatedAt: trip.value.planningNotesUpdatedAt ?? null,
        updatedBy: trip.value.planningNotesUpdatedBy ?? null,
      }
    : null,
  events: ...,
  // ...unchanged
}
```

Place `brief` immediately after `trip` so it is near the top of the serialised output. The
raw fields stay on `trip` as well — that is harmless duplication and costs nothing.

Note `getTripDetails` uses `Promise.allSettled` and each key ternaries on `status`; follow
that shape rather than assuming `trip` resolved.

---

## 5. Tests

Extend `mcp-server/test/travel-write.test.js` (`node --test`). No network — inject a fetch
stub or keep HTTP out of the test path, consistent with the existing suite.

- `travelUpdateTripBrief` issues a **PUT** (not POST or PATCH) to `.../trips/{id}/brief`
- `mode` defaults to `'replace'` when omitted
- `expectedUpdatedAt` is passed through when supplied and absent from the body when not
- a tripId containing a URL-unsafe character is encoded in the path
- `assertLocalWriteTarget` rejects a brief PUT aimed at a non-loopback host, **before** any
  fetch — mirror the existing guard test
- `TRIP_FIELDS.fields` does **not** contain `planningNotes`
- `validateFields('trip', { planningNotes: 'x' })` throws
- `travelDescribeFields({ kind: 'trip' })` output mentions `travel_update_trip_brief`

---

## Verification

**Local setup.** Read the "Local setup" notes in
`mcp-server/docs/plans/travel-write-tools/02-write-tools.md` first. Two things will bite you:

- There is no `mcp-server/.env` on this machine — it is gitignored and the server has only
  ever run on the VPS. You must create one or `/mcp` returns 500.
- `.env.example`'s `TRAVEL_URL` says port **3001**, which is the **VPS** port. Local
  travel-app dev is on **3000**, so use `TRAVEL_URL=http://localhost:3000/travel`.
- This machine's default shell is PowerShell, where a bash-style `VAR=x npm start` prefix is a
  parse error.

Never point `TRAVEL_URL` at `zo-bot.com` — that is the live production database. The
localhost guard should stop you, but do not rely on it as a first line of defence.

Back up first: `cp ../travel-app/local.db ../travel-app/local.db.bak`.

Run travel-app on 3000 and mcp-server on 3005, then:

1. `npm test` — all green.
2. `node server.js` boots; `curl http://localhost:3005/health` responds.
3. `tools/list` probe (form in `mcp-server/DEPLOY.md:131-138`) with `TRAVEL_WRITE=1` → both
   new tools present on the `full` scope.
4. With `TRAVEL_WRITE` **unset** → `travel_get_trip_brief` is still registered,
   `travel_update_trip_brief` is **not**.
5. **The `genealogy` scope still lists exactly its 7 tools** in both states. That scope is
   someone else's access; a regression there is the worst outcome of this program.
6. `initialize` response carries the `instructions` string.
7. `tools/call travel_get_trip_brief` on a real trip → matches what the site shows.
8. `tools/call travel_update_trip_brief` with `mode: 'append'` → the site shows the appended
   text after a refresh, and the panel reads **Updated by Claude**.
9. `tools/call travel_update_trip_brief` with a bad `mode` → the upstream 400 message
   surfaces through `internalRequest`, not a bare status code.
10. `tools/call travel_describe_fields` with `kind: 'trip'` → no `planningNotes` in `fields`,
    and the note pointing at the brief tools is present.
11. `tools/call travel_update_trip` with `{ planningNotes: 'x' }` → rejected as an unknown
    field, and the brief is unchanged on the site.
12. `tools/call get_trip_details` → top-level `brief` key present and correct.
13. Set `TRAVEL_URL=https://zo-bot.com/travel` and call `travel_update_trip_brief` → throws
    **before** any request; then `get_trips` against the same URL still works (reads are
    unaffected). Reset `TRAVEL_URL` afterwards.

Clean up any scratch content from the test trip.

## Done when

- `npm test` passes
- `tools/list` counts are correct in both `TRAVEL_WRITE` states, and `genealogy` is untouched
- The `initialize` response carries `instructions` (or the report explains why it cannot)
- A brief written over MCP appears on the site attributed to Claude
- `travel_update_trip` cannot write `planningNotes`
- No file under `travel-app/` was modified
- Phase 3 report appended to `PROGRESS.md` with the Status blockquote updated
