#!/usr/bin/env node
/**
 * Generates src/lib/calendar/airport-timezones.ts — an offline IATA → IANA timezone table.
 *
 * Why generated and committed rather than resolved at runtime: the calendar feed must do ZERO
 * network I/O while serving. Google polls it unattended, a slow geocoder turns a fetch into
 * "Could not fetch the URL", and a resolver that answers differently across two polls would break
 * the byte-identical-refetch contract.
 *
 * Sources:
 *   - OurAirports airports.csv (maintained; has iata_code + coordinates)
 *   - tz-lookup (devDependency) to resolve coordinates to an IANA zone
 *
 * The output is deliberately RESTRICTED to the IATA codes already present in public/airports.json,
 * so the airport picker and the timezone table can never disagree about which codes exist.
 *
 * Usage:  node tools/build-airport-timezones.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tzLookup from 'tz-lookup';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const PICKER_JSON = path.join(ROOT, 'public', 'airports.json');
const OUT = path.join(ROOT, 'src', 'lib', 'calendar', 'airport-timezones.ts');

/** Minimal RFC 4180 parser — fields may be quoted and contain commas and escaped quotes. */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

async function main() {
  console.log('Reading the airport picker list…');
  const picker = JSON.parse(fs.readFileSync(PICKER_JSON, 'utf8'));
  const wanted = new Set(picker.map((a) => a.iata).filter(Boolean));
  console.log(`  ${wanted.size} IATA codes to resolve`);

  console.log(`Fetching ${SOURCE_URL} …`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`OurAirports fetch failed: ${res.status}`);
  const csv = await res.text();
  console.log(`  ${(csv.length / 1e6).toFixed(1)} MB`);

  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const iIata = header.indexOf('iata_code');
  const iLat = header.indexOf('latitude_deg');
  const iLon = header.indexOf('longitude_deg');
  if (iIata < 0 || iLat < 0 || iLon < 0) throw new Error('OurAirports columns moved — check the header');

  /** iata → zone */
  const resolved = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const row = parseCsvLine(lines[i]);
    const iata = (row[iIata] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata) || !wanted.has(iata) || resolved.has(iata)) continue;
    const lat = Number(row[iLat]);
    const lon = Number(row[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    try {
      resolved.set(iata, tzLookup(lat, lon));
    } catch {
      // tz-lookup throws on out-of-range coordinates; skip rather than guess.
    }
  }

  const missing = [...wanted].filter((c) => !resolved.has(c));
  console.log(`  resolved ${resolved.size}, unresolved ${missing.length}`);
  if (missing.length) console.log(`  unresolved sample: ${missing.slice(0, 12).join(', ')}`);

  // A truncated regeneration must be caught here, not discovered in production.
  if (resolved.size < wanted.size * 0.9) {
    throw new Error(`Only ${resolved.size}/${wanted.size} resolved — refusing to write a gutted table`);
  }

  // Zones are interned into an array and referenced by index: ~420 distinct zones across ~4,500
  // airports, so this roughly halves the file and keeps the diff readable when it is regenerated.
  const zones = [...new Set(resolved.values())].sort();
  const zoneIndex = new Map(zones.map((z, i) => [z, i]));
  const codes = [...resolved.keys()].sort();

  const body = `/** GENERATED FILE — do not hand-edit.
 *
 *  Built by tools/build-airport-timezones.mjs on ${new Date().toISOString().slice(0, 10)}
 *  from OurAirports (coordinates) resolved through tz-lookup, restricted to the IATA codes in
 *  public/airports.json.
 *
 *  Regenerate when an airport is added to the picker, or if a country changes timezone. Zone
 *  RENAMES need no regeneration — tzdata keeps the old names working as links.
 *
 *  Zero runtime imports so \`node --test\` can load it, same rule as the rest of src/lib/calendar.
 */

/** ${zones.length} distinct zones, interned so the map below can hold indices. */
export const TZ_ZONES: readonly string[] = [
${zones.map((z) => `  '${z}',`).join('\n')}
];

/** ${codes.length} IATA codes → index into TZ_ZONES. */
export const AIRPORT_TZ_INDEX: Readonly<Record<string, number>> = {
${codes.map((c) => `  ${c}: ${zoneIndex.get(resolved.get(c))},`).join('\n')}
};

/** IANA zone for an IATA code, or null if unknown. Case-sensitive: pass an upper-case code
 *  (extractIata() in ./timezone.ts already upper-cases).
 *
 *  The typeof guard is load-bearing, not defensive noise: a plain object literal inherits from
 *  Object.prototype, so AIRPORT_TZ_INDEX['toString'] is a FUNCTION rather than undefined. An
 *  \`=== undefined\` check would sail past it and return TZ_ZONES[function] — undefined typed as
 *  string. */
export function airportTimeZone(iata: string | null | undefined): string | null {
  if (!iata) return null;
  const i = AIRPORT_TZ_INDEX[iata];
  return typeof i === 'number' ? TZ_ZONES[i] ?? null : null;
}
`;

  fs.writeFileSync(OUT, body, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${zones.length} zones, ${codes.length} codes, ${(body.length / 1024).toFixed(0)} KB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
