/** RFC 5545 building blocks, shared by the per-trip .ics download and the subscribe-able feed.
 *
 *  Zero runtime imports on purpose: `node --test` resolves neither the `@/` path alias nor
 *  extensionless relative imports, so this file must load standalone. Do not add one.
 */

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** TextEncoder is a global in both Node and the browser, so this keeps the file import-free. */
const UTF8 = new TextEncoder();
function octets(s: string): number {
  return UTF8.encode(s).length;
}

/** Fold lines to 75 **octets** per RFC 5545 (continuation lines start with a space).
 *
 *  Octets, not JavaScript string length: those differ for any non-ASCII character, and this
 *  file's output is full of them — an em dash is 3 bytes, the ✈️🏨🚗🅿️🚆 summary prefixes are 4+.
 *  Measuring in UTF-16 code units both overshoots the limit (a 75-character line carrying two
 *  em dashes is 77 octets) and, worse, can slice through a surrogate pair and emit a lone
 *  surrogate on each side of the break, which is not valid UTF-8 at all.
 *
 *  Iterating with for...of walks whole code points, so a character is never split. The budget
 *  drops to 74 after the first line because a continuation line's leading space counts toward
 *  its own 75. */
export function fold(line: string): string {
  if (octets(line) <= 75) return line;
  const chunks: string[] = [];
  let current = '';
  let used = 0;
  let budget = 75;
  for (const ch of line) {
    const size = octets(ch);
    if (used + size > budget) {
      chunks.push(current);
      current = '';
      used = 0;
      budget = 74;
    }
    current += ch;
    used += size;
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, i) => (i === 0 ? chunk : ' ' + chunk)).join('\r\n');
}

export function toDateStamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// 'YYYY-MM-DD' + optional 'HH:MM' → floating local datetime, or all-day DATE value.
export function dtProperty(name: string, date: string, time?: string | null): string | null {
  if (!date) return null;
  const ymd = date.replace(/-/g, '');
  if (time && /^\d{1,2}:\d{2}/.test(time)) {
    const [h, m] = time.split(':');
    return `${name}:${ymd}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
  }
  return `${name};VALUE=DATE:${ymd}`;
}

/** For all-day spans DTEND is exclusive, so add one day.
 *  Body copied from src/lib/dates.ts (the noon-UTC anchor is the codebase's one rule for
 *  date-only math); it is duplicated rather than imported to keep this file import-free. */
export function nextDay(date: string): string {
  const dt = new Date(date + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export interface EventInput {
  uid: string;
  summary: string;
  start: { date: string; time?: string | null };
  end?: { date: string; time?: string | null } | null;
  location?: string | null;
  description?: string | null;
}

/** A stable-when-unchanged epoch. Used when an item's updatedAt is missing or unparseable:
 *  an obviously wrong 19700101T000000 in the output beats a value that changes every fetch. */
const EPOCH_STAMP = '19700101T000000Z';

/** DTSTAMP and LAST-MODIFIED come from the item's own updated_at, never from `now`. In a
 *  polled feed a request-time stamp makes every fetch byte-different even when nothing
 *  changed, which breaks diffing, blocks any future ETag, and makes Apple/Outlook rewrite
 *  every event on every poll. See docs/calendar-feed/00-overview.md. */
export function buildVEvent(item: EventInput & { updatedAt: string }): string | null {
  const dtStart = dtProperty('DTSTART', item.start.date, item.start.time);
  if (!dtStart) return null;

  const parsed = new Date(item.updatedAt);
  const stamp = item.updatedAt && !Number.isNaN(parsed.getTime()) ? toDateStamp(parsed) : EPOCH_STAMP;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${item.uid}`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    dtStart,
  ];

  // Resolve DTEND. Timed events use the provided end (or omit). All-day events must use
  // an exclusive end date.
  const startAllDay = dtStart.includes('VALUE=DATE');
  if (item.end?.date) {
    const endTimed = item.end.time && /^\d{1,2}:\d{2}/.test(item.end.time);
    if (!startAllDay && endTimed) {
      lines.push(dtProperty('DTEND', item.end.date, item.end.time)!);
    } else {
      lines.push(dtProperty('DTEND', nextDay(item.end.date), null)!);
    }
  } else if (startAllDay) {
    lines.push(dtProperty('DTEND', nextDay(item.start.date), null)!);
  }

  lines.push(`SUMMARY:${escapeText(item.summary)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

/** A zero-VEVENT VCALENDAR is legal, but Google has been observed to reject it as
 *  "Could not fetch the URL" — and an empty calendar with no explanation looks like a bug
 *  to whoever subscribed. This placeholder sits far in the past so it never clutters a view. */
const PLACEHOLDER_VEVENT = [
  'BEGIN:VEVENT',
  'UID:empty-placeholder@travel.zo-bot.com',
  `DTSTAMP:${EPOCH_STAMP}`,
  `LAST-MODIFIED:${EPOCH_STAMP}`,
  'DTSTART;VALUE=DATE:19700101',
  'DTEND;VALUE=DATE:19700102',
  'SUMMARY:No trips match your calendar filters',
  'END:VEVENT',
].join('\r\n');

export function buildCalendar(name: string, vevents: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//zo-bot//travel-app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-CALDESC:Trips from the Zo travel app',
    // Google ignores both; Apple Calendar and Outlook honour them. Free, and it makes the
    // feed behave for anyone who subscribes on an iPhone directly.
    'X-PUBLISHED-TTL:PT12H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    // X-WR-TIMEZONE is deliberately absent. The app stores no timezone, and every DTSTART
    // here is a floating local time — "7pm dinner" shows at 7pm wherever you are. Naming a
    // calendar timezone would pin those times and shift every timed event on a trip abroad.
    // Do not add it.
    ...(vevents.length > 0 ? vevents : [PLACEHOLDER_VEVENT]),
    'END:VCALENDAR',
  ].join('\r\n');
}
