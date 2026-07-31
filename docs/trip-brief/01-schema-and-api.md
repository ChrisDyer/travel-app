# Phase 1 — Schema and API

**Prerequisite: read `00-overview.md` first.**

Add the four `planning_notes` columns to `trips` and build the dedicated brief API. **This
phase is travel-app only and produces no UI** — verification is by curl. Nothing under
`mcp-server/` may be modified.

## Deliverables

- `src/db/migrations.ts` — new migration entry + `runCustomMigration` branch
- `src/types/travel.ts` — four fields on `interface Trip`
- `src/app/api/trips/[tripId]/route.ts` — a comment only (deliberate non-change)
- `src/app/api/trips/[tripId]/duplicate/route.ts` — copy `planning_notes`
- `src/app/api/trips/[tripId]/brief/route.ts` (new) — `GET`, `PUT`
- `src/app/api/trips/[tripId]/brief/undo/route.ts` (new) — `POST`
- Phase 1 report appended to `PROGRESS.md`

---

## 1. Migration

`src/db/migrations.ts`. The highest existing migration is `005_restaurant_event_fields`;
**check for anything newer before choosing a number** — another agent may have landed one.

Append to the `migrations` array (the `sql` string is a documentation placeholder; it is not
what runs — see below):

```ts
{
  name: '006_trip_brief',
  sql: `
    ALTER TABLE trips ADD COLUMN planning_notes TEXT;
    ALTER TABLE trips ADD COLUMN planning_notes_previous TEXT;
    ALTER TABLE trips ADD COLUMN planning_notes_updated_at TEXT;
    ALTER TABLE trips ADD COLUMN planning_notes_updated_by TEXT;
  `,
},
```

Then add the matching branch to `runCustomMigration` (`src/db/migrations.ts:246`), following
`004_hike_event_fields` exactly:

```ts
if (name === '006_trip_brief') {
  addColumnIfMissing(db, 'trips', 'planning_notes', 'TEXT');
  addColumnIfMissing(db, 'trips', 'planning_notes_previous', 'TEXT');
  addColumnIfMissing(db, 'trips', 'planning_notes_updated_at', 'TEXT');
  addColumnIfMissing(db, 'trips', 'planning_notes_updated_by', 'TEXT');
  return true;
}
```

**Why both.** `runMigrations` calls `runCustomMigration` first and only falls back to
`db.exec(migration.sql)` when it returns `false` (line 273). `addColumnIfMissing` does a
`PRAGMA table_info` check, so an `ALTER TABLE ... ADD COLUMN` re-run against a database that
already has the column is a no-op instead of a hard error. Both parts are required: the array
entry registers the name in `schema_migrations`, the branch does the actual work.

Migrations run on module import of `src/db/index.ts`, i.e. at first DB touch on startup.
Forward-only, no down migrations.

`planning_notes_updated_by` holds `'you'` or `'assistant'`. Plain `TEXT` with no CHECK
constraint — SQLite CHECK constraints cannot be added by `ALTER TABLE` after the fact, and
the value is set only by our own code.

---

## 2. Type

`src/types/travel.ts`, `interface Trip` (around lines 11-30):

```ts
planningNotes: string | null;
planningNotesPrevious: string | null;
planningNotesUpdatedAt: string | null;
planningNotesUpdatedBy: 'you' | 'assistant' | null;
```

These types are hand-maintained mirrors of the columns; nothing generates them.

---

## 3. The deliberate non-change

`src/app/api/trips/[tripId]/route.ts` has a `colMap` allow-list that is the sole validation
for the generic trip `PATCH`. **Do not add the new fields to it.** Add a comment above the
map so the next reader does not "fix" the omission:

```ts
// planningNotes and its bookkeeping columns are deliberately absent. The brief is written
// only via /api/trips/{tripId}/brief, which snapshots the previous value and derives the
// author from x-internal-token. A second write path here would bypass both and make the
// Undo button lie. See docs/trip-brief/00-overview.md.
```

---

## 4. Trip duplication

`src/app/api/trips/[tripId]/duplicate/route.ts:19-27` uses explicit column lists in an
`INSERT ... SELECT`, so new columns are **not** copied automatically.

Add `planning_notes` to both the column list and the `SELECT` list. A duplicated trip should
inherit the requirements — that is much of the point of duplicating a trip.

Do **not** copy the three bookkeeping columns; they stay `NULL` on the copy, so the duplicate
starts with no undo history. Adding four names to the INSERT list and only one to the SELECT
list would misalign the columns — add `planning_notes` to both, and simply omit the other
three from both.

---

## 5. `brief/route.ts`

New file `src/app/api/trips/[tripId]/brief/route.ts`. Model it on
`src/app/api/trips/[tripId]/days/[dayId]/route.ts` — hand-rolled `sets`/`values`, not a
`colMap`. Wrap both handlers in `withErrorHandling` from `src/lib/api-helpers.ts`. Resolve
the owner with `getUserId(request)` and gate every statement on `AND user_id = ?`.

### Shared response shape

```ts
type BriefResponse = {
  content: string | null;
  updatedAt: string | null;
  updatedBy: 'you' | 'assistant' | null;
  hasUndo: boolean;          // planning_notes_previous IS NOT NULL
};
```

Write one `toBriefResponse(row)` helper and use it from every handler in both files, so the
site and the MCP tools always see identical shapes.

### `GET`

Load the trip; 404 when it does not exist or is not owned. Return `BriefResponse`.

### `PUT`

Body: `{ content: string; mode?: 'replace' | 'append'; expectedUpdatedAt?: string }`

Order of checks — get this right, the error precedence matters:

1. **404** if the trip is missing or not owned.
2. **400** `Missing required field: content` if `content` is not a string. An explicit `null`
   is *not* valid here — clearing the brief is `content: ''`, which normalises to `NULL`.
3. **400** `mode must be "replace" or "append"` for any other value. Default `'replace'`.
4. **400** if `content.length > 20000`:
   `Brief content is too long (N chars, max 20000).` This is a guard against a runaway agent
   write, not a product limit — the number is deliberately far above any real brief.
5. **409** if `expectedUpdatedAt` was supplied and does not equal the stored
   `planning_notes_updated_at`. Message must tell the caller what to do:
   `The brief changed since you read it (expected <x>, found <y>). Re-read it and reapply your change.`
   Compare exact strings; both are our own ISO output. When `expectedUpdatedAt` is omitted,
   skip the check entirely — it is opt-in optimistic concurrency, and Claude will usually
   omit it.

Then compute the next content:

```ts
const incoming = content.trim();
const current = row.planning_notes as string | null;
const next = mode === 'append' && current
  ? `${current}\n\n${incoming}`
  : incoming;
const finalContent = next.trim() || null;   // '' → NULL, per the data contract
```

`mode: 'append'` on an empty brief is just a replace. Join with a blank line so markdown
headings in the appended chunk render as their own block.

Derive the author per `00-overview.md` (from `x-internal-token`, never the body), then write
everything in one statement so the snapshot cannot desynchronise:

```sql
UPDATE trips
   SET planning_notes_previous = planning_notes,
       planning_notes = ?,
       planning_notes_updated_at = ?,
       planning_notes_updated_by = ?
 WHERE id = ? AND user_id = ?
```

`planning_notes_previous = planning_notes` reads the **old** value — SQLite evaluates all
right-hand sides against the pre-update row, so the ordering of the SET clauses is irrelevant.

Return `{ ...toBriefResponse(updatedRow), previous }` where `previous` is the content that was
just displaced. Returning it lets Claude self-correct a bad write without a second call.

> **Do not touch `trips.updated_at`.** `src/app/trips/[tripId]/page.tsx:51` passes
> `key={trip.updatedAt}` to `<ItineraryDocument>`, so bumping it remounts the entire client
> tree on the next `router.refresh()` — losing open dialogs, the selected day, and the mobile
> tab. The brief has its own timestamp.

---

## 6. `brief/undo/route.ts`

New file `src/app/api/trips/[tripId]/brief/undo/route.ts`. `POST`, no body.

- **404** if the trip is missing or not owned.
- **400** `Nothing to undo.` when `planning_notes_previous IS NULL`.
- Otherwise swap, in one statement:

```sql
UPDATE trips
   SET planning_notes = planning_notes_previous,
       planning_notes_previous = planning_notes,
       planning_notes_updated_at = ?,
       planning_notes_updated_by = ?
 WHERE id = ? AND user_id = ?
```

Both right-hand sides see pre-update values, so this is a true swap in one pass. Set the
author the same way `PUT` does — an undo triggered from the site is `'you'`; one triggered
over the internal token is `'assistant'`.

The swap makes undo self-inverting: undo twice and you are back where you started. Do not
"improve" this by clearing `planning_notes_previous` — that would make a mis-clicked undo
unrecoverable, which is the exact failure this feature exists to prevent.

Return `BriefResponse`.

---

## Verification

Run travel-app locally (`npm run dev`, port **3000**, base path `/travel`). Back up first:
`cp local.db local.db.bak`.

**Migration**

```bash
node -e "const d=require('better-sqlite3')('local.db');console.log(d.prepare('PRAGMA table_info(trips)').all().map(c=>c.name).filter(n=>n.startsWith('planning')))"
```
Expect all four. Restart the dev server and confirm it does not re-run (no error, and
`schema_migrations` has one `006_trip_brief` row).

**Happy path** — against a real trip id from `GET /travel/api/trips`:

1. `GET  /travel/api/trips/{id}/brief` → all nulls, `hasUndo: false`.
2. `PUT` `{"content":"A"}` → `content: "A"`, `previous: null`, `updatedBy: "you"`.
3. `PUT` `{"content":"B"}` → `content: "B"`, `previous: "A"`, `hasUndo: true`.
4. `PUT` `{"content":"C","mode":"append"}` → `content: "B\n\nC"`.
5. `POST /brief/undo` → `content: "B"`.
6. `POST /brief/undo` again → `content: "B\n\nC"`. **Self-inverting — this is the important one.**
7. `PUT` `{"content":"   "}` → `content: null`, `hasUndo` still true.

**Guards**

8. `PUT` `{"content":"x","expectedUpdatedAt":"1999-01-01T00:00:00.000Z"}` → **409**, and the
   brief is **unchanged** afterwards (re-`GET` to prove it).
9. `PUT` with 25,000 chars → **400**, brief unchanged.
10. `PUT` `{"content":"x","mode":"prepend"}` → **400**.
11. `PUT` `{}` → **400**.
12. `PUT` with malformed JSON → **400** `Invalid JSON body` (from `withErrorHandling`).
13. `GET`/`PUT` against a trip id that does not exist → **404**.

**Attribution**

14. Set `INTERNAL_API_TOKEN=testtoken` in travel-app's env and restart. `PUT` with
    `-H "x-internal-token: testtoken"` → `updatedBy: "assistant"`. Without the header →
    `"you"`. With a *wrong* token value → `"you"`.

> If `INTERNAL_API_TOKEN` is unset, every write reports `"you"` and this test proves nothing.
> Confirm the variable is actually set in the running server before trusting step 14.

**Duplication**

15. `POST /travel/api/trips/{id}/duplicate` → the copy has the same `planningNotes`, and
    `planningNotesPrevious` / `UpdatedAt` / `UpdatedBy` all null.

**Regression**

16. `PATCH /travel/api/trips/{id}` with `{"planningNotes":"hacked"}` → **200 but ignored**
    (the generic colMap silently drops unknown keys). Confirm the brief did not change.
17. `PATCH` a normal field (`{"title":"..."}`) still works, and the trip page still loads.

Restore `local.db.bak` if anything went sideways. SQLite is in WAL mode — stop the dev server
and remove `local.db-wal` and `local.db-shm` too.

## Done when

- All four columns exist and the migration is idempotent across restarts
- Every verification step above passes, including all six guard cases
- `npm run build` succeeds (the `Trip` type change compiles everywhere it is consumed)
- No file under `mcp-server/` was modified
- Phase 1 report appended to `PROGRESS.md` with the Status blockquote updated
