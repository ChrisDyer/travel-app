# PHASE 1 — Cover Images: Move to Database Storage

> **Read `docs/fixes/README.md` first** for global conventions (migrations, verification commands, commit rules).

## Why this phase exists (root cause — read before coding)

Cover image uploads are **broken in production** for two independent reasons:

1. **Runtime files in `public/` are never served.** The upload route writes to `path.join(process.cwd(), 'public', 'trip-photos')` (`src/app/api/trips/[tripId]/cover-image/route.ts:27-29`). In production the app runs as a Next.js **standalone** build (`next.config.ts` → `output: 'standalone'`), whose server scans the `public/` directory **once at boot** and serves only that snapshot. A file written after boot returns 404 forever (until a restart). So every freshly uploaded image shows as broken.
2. **Deploys delete all uploads.** The deploy command (`DEPLOY.md:182`, `RUNBOOK.md:218`) runs `sudo rm -rf .next` before rebuilding — and the uploads live inside `.next/standalone/public/trip-photos/`. The nightly backup cron (`DEPLOY.md:232`, `RUNBOOK.md:279`) syncs `~/travel-app/public/trip-photos/` — the **wrong directory**, which is always empty.

**The fix (decided, do not redesign):** store the resized JPEG as a blob in SQLite, serve it from a `GET` API route. Images then survive every deploy automatically and are covered by the existing nightly `local.db` rclone backup.

## Issues fixed in this phase

| ID  | Issue | Where |
|-----|-------|-------|
| 1.1 | Uploaded images 404 in production (standalone public/ snapshot) | `src/app/api/trips/[tripId]/cover-image/route.ts:27-29` |
| 1.2 | Deploy wipes all uploaded images; backup cron watches wrong dir | `DEPLOY.md:182,232`, `RUNBOOK.md:218,279` |
| 1.3 | No upload validation: no size limit, no MIME check, sharp throw → unhandled 500 | `cover-image/route.ts:16-24` |
| 1.4 | Upload UI fails silently; network error leaves "Uploading…" stuck forever | `src/components/trips/CoverImageUpload.tsx:17-39` |
| 1.5 | New-trip page ignores the cover-upload result entirely | `src/app/trips/new/page.tsx:53-57` |
| 1.6 | Existing production images stranded on disk / dead URLs in DB | one-time import script |

---

## Step 1 — Migration: `trip_cover_images` table

**File: `src/db/migrations.ts`** — append to the `migrations` array (after `002_trip_budget`, before the closing `];`):

```ts
  {
    name: '003_cover_images',
    sql: `
      CREATE TABLE IF NOT EXISTS trip_cover_images (
        trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
        data BLOB NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
```

**Why a separate table, not a column on `trips`:** every trips route does `SELECT * FROM trips` and feeds the row through `camelize` into `NextResponse.json(...)` (e.g. `src/app/api/trips/route.ts:8`, `src/app/api/trips/[tripId]/route.ts:9,34`, `src/app/trips/[tripId]/page.tsx:17`). A blob column would serialize image bytes into every JSON response. Do NOT add a blob column to `trips`, and do NOT clear old `cover_image_url` values in the migration — the import script (Step 5) handles those.

## Step 2 — Rewrite the cover-image route

**File: `src/app/api/trips/[tripId]/cover-image/route.ts`** — replace the whole file:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function requireTrip(tripId: string, userId: string) {
  return db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as { id: string } | undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  if (!requireTrip(tripId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = db.prepare('SELECT data FROM trip_cover_images WHERE trip_id = ?').get(tripId) as { data: Buffer } | undefined;
  if (!row) return NextResponse.json({ error: 'No image' }, { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Immutable is safe: the URL carries a ?v= cache-buster that changes on re-upload.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  if (!requireTrip(tripId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Please choose an image file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 10 MB).' }, { status: 413 });
  }

  let resized: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    resized = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize(600, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'That file could not be read as an image.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const coverImageUrl = `/api/trips/${tripId}/cover-image?v=${Date.now()}`;
  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO trip_cover_images (trip_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(trip_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(tripId, resized, now);
    db.prepare('UPDATE trips SET cover_image_url = ?, updated_at = ? WHERE id = ?').run(coverImageUrl, now, tripId);
  });
  save();

  return NextResponse.json({ coverImageUrl });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);
  if (!requireTrip(tripId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM trip_cover_images WHERE trip_id = ?').run(tripId);
    db.prepare('UPDATE trips SET cover_image_url = NULL, updated_at = ? WHERE id = ?').run(now, tripId);
  });
  remove();

  return new NextResponse(null, { status: 204 });
}
```

Notes:
- The `fs` and `path` imports from the old file are gone — nothing touches the filesystem anymore.
- `better-sqlite3` returns BLOB columns as Node `Buffer`; wrapping in `new Uint8Array(...)` makes it a valid `Response` body.
- **Do not touch `src/proxy.ts`.** Its matcher already covers `/api/...`; browser `<img>` requests ride the same Cloudflare Access session as normal page loads, so the image GET is authenticated exactly like every other API call. No change is needed there.

## Step 3 — Upload UI error handling

**File: `src/components/trips/CoverImageUpload.tsx`**

Current bugs (lines 17-39): no try/catch (a network error leaves `uploading` stuck `true` because line 32 never runs), failures silently revert the preview with no message, and `handleRemove` ignores its response.

Replace `handleFile` and `handleRemove`, and add an `error` state:

```tsx
const [error, setError] = useState<string | null>(null);

async function handleFile(file: File) {
  setError(null);
  if (file.size > 10 * 1024 * 1024) {
    setError('Image is too large (max 10 MB).');
    return;
  }
  setUploading(true);
  const localPreview = URL.createObjectURL(file);
  setPreview(localPreview);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/trips/${tripId}/cover-image`, { method: 'POST', body: fd });
    if (res.ok) {
      const { coverImageUrl } = await res.json();
      setPreview(coverImageUrl);
      onChanged(coverImageUrl);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setPreview(currentUrl);
      setError(data.error ?? 'Upload failed. Please try again.');
    }
  } catch {
    setPreview(currentUrl);
    setError('Upload failed. Please check your connection and try again.');
  } finally {
    setUploading(false);
  }
}

async function handleRemove() {
  setError(null);
  try {
    const res = await fetch(`/api/trips/${tripId}/cover-image`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      setError('Could not remove the photo. Please try again.');
      return;
    }
    setPreview(null);
    onChanged(null);
  } catch {
    setError('Could not remove the photo. Please check your connection and try again.');
  }
}
```

Render the error just below the preview/upload button block (inside the outer `div className="space-y-1.5"`, after the `<input ref={inputRef} ...>` element):

```tsx
{error && <p className="text-sm text-red-600">{error}</p>}
```

## Step 4 — New-trip page: stop ignoring the upload result

**File: `src/app/trips/new/page.tsx`** — lines 51-58 currently fire the cover upload and ignore the result. Replace the `if (res.ok)` block body with:

```tsx
if (res.ok) {
  const trip = await res.json();
  if (coverFile) {
    try {
      const fd = new FormData();
      fd.append('file', coverFile);
      const imgRes = await fetch(`/api/trips/${trip.id}/cover-image`, { method: 'POST', body: fd });
      if (!imgRes.ok) {
        window.alert('Your trip was created, but the cover photo failed to upload. You can add it again from Edit Trip.');
      }
    } catch {
      window.alert('Your trip was created, but the cover photo failed to upload. You can add it again from Edit Trip.');
    }
  }
  router.push(`/trips/${trip.id}`);
}
```

(The trip is created either way; navigation proceeds. `window.alert` is acceptable here because the page navigates away immediately — a toast system arrives in Phase 7 and can replace this then.)

## Step 5 — One-time import script for existing images

**New file: `scripts/import-cover-images.mjs`**

```js
// One-time migration: move cover images from the filesystem into SQLite.
// Usage:  node scripts/import-cover-images.mjs          (uses ./local.db)
//         DB_PATH=/path/to/local.db node scripts/import-cover-images.mjs
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'local.db');
const db = new Database(dbPath);

const candidates = (tripId) => [
  path.join(process.cwd(), '.next', 'standalone', 'public', 'trip-photos', `${tripId}.jpg`),
  path.join(process.cwd(), 'public', 'trip-photos', `${tripId}.jpg`),
];

const trips = db.prepare(
  "SELECT id, cover_image_url FROM trips WHERE cover_image_url LIKE '/trip-photos/%'"
).all();

let imported = 0, cleared = 0;
const now = new Date().toISOString();

for (const trip of trips) {
  const file = candidates(trip.id).find((p) => fs.existsSync(p));
  if (file) {
    const data = fs.readFileSync(file);
    const url = `/api/trips/${trip.id}/cover-image?v=${Date.now()}`;
    db.prepare(`
      INSERT INTO trip_cover_images (trip_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(trip_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(trip.id, data, now);
    db.prepare('UPDATE trips SET cover_image_url = ?, updated_at = ? WHERE id = ?').run(url, now, trip.id);
    console.log(`imported ${trip.id} from ${file}`);
    imported++;
  } else {
    db.prepare('UPDATE trips SET cover_image_url = NULL, updated_at = ? WHERE id = ?').run(now, trip.id);
    console.log(`no file found for ${trip.id} — cleared dead URL`);
    cleared++;
  }
}
console.log(`Done. Imported: ${imported}, cleared: ${cleared}, untouched: (all others)`);
```

Run order matters: the app (or `npm run dev` once) must have applied migration 003 **before** running this script, because it inserts into `trip_cover_images`.

**On the VPS (after this phase is deployed):**
```bash
ssh chris@91.99.230.234
cd ~/travel-app
node scripts/import-cover-images.mjs   # add DB_PATH=... if production uses a custom path (check pm2 env / ecosystem file)
pm2 restart travel-app                  # not strictly required, but clears any negative 404 cache
```
Check first how production sets `DB_PATH` (see `pm2 env travel-app` or the ecosystem/config file referenced in RUNBOOK.md) and pass the same value.

**Locally:** `node scripts/import-cover-images.mjs` after starting the dev server once.

## Step 6 — Update DEPLOY.md and RUNBOOK.md

These docs describe the old filesystem scheme; correct them so the next operator isn't misled:

- `DEPLOY.md:44` and `RUNBOOK.md:84` — remove `mkdir -p ~/travel-app/public/trip-photos` (no longer needed).
- `DEPLOY.md:232` and `RUNBOOK.md:279` — remove the `rclone sync ~/travel-app/public/trip-photos/ ...` cron line; add a note that cover images now live inside `local.db` and are covered by the existing `local.db` backup line directly above.
- `RUNBOOK.md:299` — remove the `du -sh ~/travel-app/public/trip-photos/` check line.
- `RUNBOOK.md:343` (the "Cover photos are written to ..." paragraph, roughly lines 340-345) — rewrite to: cover photos are stored as JPEG blobs in the `trip_cover_images` table and served from `GET /api/trips/{tripId}/cover-image`; deploys cannot affect them.
- In both files, near the deploy command (`DEPLOY.md:182`, `RUNBOOK.md:218`): the `cp -r public/. .next/standalone/public/` step stays (it copies real static assets), but delete any prose claiming uploaded photos survive because of it.
- Add the one-time import-script instructions (Step 5) to the deploy notes for this release.

## Verification

1. `npx tsc --noEmit` and `npm run lint` pass.
2. `npm run dev`, open a trip → Edit → upload a photo. The preview must show the uploaded image, and the page must load it from `/api/trips/{id}/cover-image?v=...` (check the Network tab).
3. `curl -s -o img.jpg -w "%{http_code} %{content_type}\n" http://localhost:3000/api/trips/{TRIP_ID}/cover-image` → `200 image/jpeg`, and `img.jpg` opens as a 600×400 JPEG.
4. Re-upload a different photo → the stored `coverImageUrl` gets a **new** `?v=` value (check the trips list JSON or the DB) and the new image displays without a hard refresh.
5. Upload a `.txt` renamed to nothing (send any non-image): UI shows "Please choose an image file." / "could not be read as an image" — no crash, no stuck "Uploading…".
6. Remove photo → card shows the empty-state upload button; `curl` from step 3 now returns 404.
7. **The production repro:** `npm run build && npm start` (production mode), upload a photo — it must render immediately. This exact flow was the original bug.
8. Import script: with the dev server stopped, put a test JPEG at `public/trip-photos/{someTripId}.jpg`, set that trip's `cover_image_url` to `/trip-photos/{someTripId}.jpg` via sqlite3, run `node scripts/import-cover-images.mjs`, confirm the image now serves from the API route.

## Done when

- All 8 verification steps pass.
- No code path writes to or reads from `public/trip-photos/` anymore (`grep -r "trip-photos" src/` returns nothing).
- DEPLOY.md / RUNBOOK.md no longer mention filesystem photo storage except in the import-script release note.
