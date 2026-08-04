#!/usr/bin/env node
/**
 * Fills trips.resolved_timezone and trip_legs.resolved_timezone for rows that do not have one.
 *
 * Why a script and not a migration: runMigrations() executes at import time inside src/db/index.ts,
 * so a network call there would block every cold start and fail the production build. This is a
 * one-off, run by hand after deploying migration 011.
 *
 * Idempotent and re-runnable — it only touches rows whose resolved_timezone IS NULL, and it never
 * bumps updated_at (the trip page keys ItineraryDocument by trips.updated_at, and trip_legs
 * updates would make TripWeather refetch in a loop).
 *
 * Run BEFORE the timezone-aware feed goes live. Any trip without a zone publishes its timed items
 * as all-day, so backfilling afterwards makes both subscribers' calendars flip to all-day and back.
 *
 * Usage:
 *   node tools/backfill-timezones.mjs                    # local.db
 *   DB_PATH=/home/chris/travel-app/local.db node tools/backfill-timezones.mjs
 *   node tools/backfill-timezones.mjs --dry-run
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'local.db');
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 200; // be polite to Open-Meteo

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

async function geocode(place) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`geocoder returned ${res.status}`);
  const json = await res.json();
  const hit = json.results?.[0];
  if (!hit) return null;
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    name: hit.country ? `${hit.name}, ${hit.country}` : hit.name,
    timezone: isValidTimeZone(hit.timezone) ? hit.timezone : null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`DB: ${DB_PATH}${DRY_RUN ? '  (dry run)' : ''}`);
  const db = new Database(DB_PATH);

  const trips = db.prepare(
    'SELECT id, destination FROM trips WHERE resolved_timezone IS NULL AND destination IS NOT NULL AND destination != \'\''
  ).all();
  const legs = db.prepare(
    'SELECT id, trip_id, place FROM trip_legs WHERE resolved_timezone IS NULL AND place IS NOT NULL AND place != \'\''
  ).all();

  console.log(`${trips.length} trips and ${legs.length} legs need a timezone`);
  if (!trips.length && !legs.length) { console.log('Nothing to do.'); return; }

  const updateTrip = db.prepare(
    'UPDATE trips SET latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?), resolved_name = COALESCE(resolved_name, ?), resolved_timezone = ? WHERE id = ?'
  );
  const updateLeg = db.prepare(
    'UPDATE trip_legs SET latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?), resolved_name = COALESCE(resolved_name, ?), resolved_timezone = ? WHERE id = ?'
  );

  let ok = 0;
  let failed = 0;

  for (const [label, rows, place, apply] of [
    ['trip', trips, (r) => r.destination, updateTrip],
    ['leg', legs, (r) => r.place, updateLeg],
  ]) {
    for (const row of rows) {
      const name = place(row);
      try {
        const g = await geocode(name);
        if (!g || !g.timezone) {
          console.log(`  ${label} ${row.id.slice(0, 8)}  "${name}" → no timezone`);
          failed += 1;
        } else {
          if (!DRY_RUN) apply.run(g.latitude, g.longitude, g.name, g.timezone, row.id);
          console.log(`  ${label} ${row.id.slice(0, 8)}  "${name}" → ${g.timezone}`);
          ok += 1;
        }
      } catch (err) {
        console.log(`  ${label} ${row.id.slice(0, 8)}  "${name}" → ERROR ${err.message}`);
        failed += 1;
      }
      await sleep(DELAY_MS);
    }
  }

  const remaining = db.prepare(
    'SELECT COUNT(*) c FROM trips WHERE COALESCE(timezone, resolved_timezone) IS NULL'
  ).get().c;
  console.log(`\nresolved ${ok}, unresolved ${failed}`);
  console.log(`trips still without any timezone: ${remaining}`);
  if (remaining > 0) {
    console.log('Those trips publish their timed items as all-day. Set a timezone on the trip, or');
    console.log('fix the destination so it geocodes, then re-run this script.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
