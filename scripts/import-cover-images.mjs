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
