/** Wall-clock time + IANA zone → an absolute instant, using only `Intl`.
 *
 *  Zero runtime imports on purpose (`Intl` is a global): `node --test` resolves neither the `@/`
 *  path alias nor extensionless relative imports, so this file must load standalone. It cannot
 *  even import a sibling .ts — `allowImportingTsExtensions` is not set. Do not add an import.
 *
 *  Why this exists: the feed used to emit floating datetimes (no TZID, no Z). RFC 5545 says
 *  floating means "local wherever viewed", but Google Calendar does not implement that for
 *  subscribed feeds — it normalises to UTC, so every timed event displayed hours off. Everything
 *  timed is now converted to an absolute UTC instant here. See docs/calendar-feed/00-overview.md.
 */

const DAY_MS = 86_400_000;

/** Formatters are expensive to construct and this runs once per endpoint per item. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** True if this runtime's ICU accepts the zone.
 *
 *  Must be a try/catch on the constructor, NOT a lookup in `Intl.supportedValuesOf('timeZone')`.
 *  Those disagree: on Node 24 `supportedValuesOf` lists 'Asia/Calcutta' but NOT 'Asia/Kolkata',
 *  while `DateTimeFormat` accepts both. A set lookup would reject perfectly valid zones — and the
 *  geocoder returns the modern names. Do not "simplify" this. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `local(utcMs) - utcMs`, in milliseconds. Positive east of Greenwich. */
export function offsetMsAt(utcMs: number, timeZone: string): number {
  const p: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  // Some ICU builds report hour 24 for midnight under h23; normalise defensively.
  const hour = p.hour === 24 ? 0 : p.hour;
  return Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second) - utcMs;
}

export type WallResolution = 'unique' | 'ambiguous' | 'gap';

/** 'YYYY-MM-DD' + 'HH:MM' read in `timeZone` → the absolute instant it names.
 *  Returns null for an unparseable date/time or a zone this runtime does not accept.
 *
 *  Bracket-and-validate, not guess-then-correct-once. The naive approach — assume an offset,
 *  re-measure, apply the correction — walks BACKWARDS through a spring-forward gap and yields an
 *  instant an hour before the one asked for. Here: read the wall fields as though they were UTC
 *  (a coordinate, not an instant), take the zone's offset a day either side of it (no real
 *  transition exceeds 24h, so this brackets any of them), form one candidate per offset, and keep
 *  only candidates that round-trip back to the offset that produced them.
 *
 *  Disambiguation follows the same rule as Temporal's 'compatible' mode:
 *    - fall-back overlap (the time happens twice) → the EARLIER instant
 *    - spring-forward gap (the time never happens) → shifted FORWARD past the gap */
export function wallTimeToInstant(
  date: string,
  time: string,
  timeZone: string,
): { ms: number; resolution: WallResolution } | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!d || !t || !isValidTimeZone(timeZone)) return null;

  const hh = Number(t[1]);
  const mm = Number(t[2]);
  if (hh > 23 || mm > 59) return null;

  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm, 0);

  const before = offsetMsAt(naive - DAY_MS, timeZone);
  const after = offsetMsAt(naive + DAY_MS, timeZone);
  const candA = naive - before;
  const candB = naive - after;
  const okA = offsetMsAt(candA, timeZone) === before;
  const okB = offsetMsAt(candB, timeZone) === after;

  if (okA && okB) {
    return candA === candB
      ? { ms: candA, resolution: 'unique' }
      : { ms: Math.min(candA, candB), resolution: 'ambiguous' };
  }
  if (okA) return { ms: candA, resolution: 'unique' };
  if (okB) return { ms: candB, resolution: 'unique' };
  // Neither round-trips: the wall time falls in a gap. candA lands just after it.
  return { ms: candA, resolution: 'gap' };
}

/** 'YYYYMMDDTHHMMSSZ' — the same shape toDateStamp() in ./ics.ts produces. */
export function toUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Free text → IATA code, or null.
 *
 *  Deliberately conservative, because a wrong code is an event on the wrong continent while a
 *  missed one merely falls through to the trip's zone.
 *
 *    'Seattle (SEA)'   → 'SEA'   (the AirportCombobox format, `${city} (${iata})`)
 *    'SEA' / 'sea'     → 'SEA'
 *    'Heathrow'        → null
 *    'Rio de Janeiro'  → null    ← the reason bare 3-letter tokens inside longer text are
 *                                  rejected: 'Rio' would match, and RIO is a real code in Ecuador
 */
export function extractIata(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  const parenthesised = /\(([A-Za-z]{3})\)/.exec(text);
  if (parenthesised) return parenthesised[1].toUpperCase();
  const trimmed = text.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

/** First candidate this runtime accepts as a zone, or null. Used by the resolution chain. */
export function firstValidTimeZone(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) if (isValidTimeZone(c)) return c;
  return null;
}
