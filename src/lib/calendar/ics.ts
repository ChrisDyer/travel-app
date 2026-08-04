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

/** One end of an event: a local wall date/time, plus the resolved absolute instant.
 *
 *  `utcStamp` is computed upstream in items.ts (which can import the timezone module and the DB);
 *  this file deliberately does no timezone maths of its own, which is what keeps it import-free. */
export interface EventEndpoint {
  /** 'YYYY-MM-DD' local wall date. Still what all-day events are emitted from. */
  date: string;
  /** 'HH:MM' local wall time, if the item is timed at all. */
  time?: string | null;
  /** The IANA zone `time` is in. null when it could not be resolved. */
  timeZone?: string | null;
  /** 'YYYYMMDDTHHMMSSZ'. Set iff the item is timed AND a zone was resolved. */
  utcStamp?: string | null;
}

/** An absolute UTC instant, or an all-day DATE value. There is deliberately NO third branch.
 *
 *  This used to emit a floating local datetime (`20260808T114500`, no zone) when a time was
 *  present. RFC 5545 calls that "local to the viewer", but Google Calendar does not implement it
 *  for subscribed feeds — it normalises to UTC, so every timed event rendered hours off. Removing
 *  the branch entirely, rather than leaving it behind a flag, is what makes that regression
 *  unrepresentable rather than merely discouraged. */
export function dtProperty(name: string, ep: EventEndpoint): string | null {
  if (!ep.date) return null;
  if (ep.utcStamp) return `${name}:${ep.utcStamp}`;
  return `${name};VALUE=DATE:${ep.date.replace(/-/g, '')}`;
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
  start: EventEndpoint;
  end?: EventEndpoint | null;
  location?: string | null;
  description?: string | null;
}

/** The wall time an unresolved item would have had, prefixed to its SUMMARY.
 *  '09:00' or '09:00–13:00'. Returns '' when there is no time to show. */
function timePrefix(start: EventEndpoint, end?: EventEndpoint | null): string {
  if (!start.time) return '';
  return end?.time ? `${start.time}–${end.time} ` : `${start.time} `;
}

/** A stable-when-unchanged epoch. Used when an item's updatedAt is missing or unparseable:
 *  an obviously wrong 19700101T000000 in the output beats a value that changes every fetch. */
const EPOCH_STAMP = '19700101T000000Z';

/** DTSTAMP and LAST-MODIFIED come from the item's own updated_at, never from `now`. In a
 *  polled feed a request-time stamp makes every fetch byte-different even when nothing
 *  changed, which breaks diffing, blocks any future ETag, and makes Apple/Outlook rewrite
 *  every event on every poll. See docs/calendar-feed/00-overview.md. */
export function buildVEvent(item: EventInput & { updatedAt: string }): string | null {
  if (!item.start.date) return null;

  const parsed = new Date(item.updatedAt);
  const stamp = item.updatedAt && !Number.isNaN(parsed.getTime()) ? toDateStamp(parsed) : EPOCH_STAMP;

  // An item that has a wall time but no resolved zone is DEMOTED to all-day, with the time moved
  // into the title. Wrong-by-a-day-boundary at worst, obviously degraded, and fixable. The
  // alternative — assuming a default zone — renders a Paris dinner in Chicago time and *looks*
  // correct, which is precisely the silent failure this whole change exists to remove.
  const unresolved = Boolean(item.start.time) && !item.start.utcStamp;

  const start: EventEndpoint = unresolved ? { date: item.start.date } : item.start;
  const end: EventEndpoint | null | undefined = unresolved
    ? (item.end?.date ? { date: item.end.date } : null)
    : item.end;

  const dtStart = dtProperty('DTSTART', start);
  if (!dtStart) return null;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${item.uid}`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    dtStart,
  ];

  // Resolve DTEND. A timed start with a timed end emits an instant; everything else falls back to
  // the exclusive all-day form.
  const startAllDay = dtStart.includes('VALUE=DATE');
  if (end?.date) {
    if (!startAllDay && end.utcStamp) {
      // Endpoints are now absolute instants, so for the first time they are comparable — and a
      // mis-resolved zone (or an arrival time typed in the departure zone) can put the end BEFORE
      // the start. Google mangles or silently drops such an event, so omit DTEND instead and let
      // it render as a point in time.
      if (end.utcStamp > dtStart.slice(dtStart.indexOf(':') + 1)) {
        lines.push(dtProperty('DTEND', end)!);
      }
    } else {
      lines.push(dtProperty('DTEND', { date: nextDay(end.date) })!);
    }
  } else if (startAllDay) {
    lines.push(dtProperty('DTEND', { date: nextDay(start.date) })!);
  }

  lines.push(`SUMMARY:${escapeText(timePrefix(unresolved ? item.start : { date: '' }, item.end) + item.summary)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`);

  // Non-standard, ignored by every client, and the only way to answer "why is this an hour off?"
  // from a fetched body — the source zone is otherwise invisible once times are in UTC.
  // Deliberately not in DESCRIPTION, which redactItems() strips for the public feed.
  const zoneTag = unresolved
    ? 'unresolved'
    : item.start.timeZone && item.end?.timeZone && item.end.timeZone !== item.start.timeZone
      ? `${item.start.timeZone}/${item.end.timeZone}`
      : item.start.timeZone;
  if (zoneTag) lines.push(`X-ZO-TZ:${zoneTag}`);

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
    // X-WR-TIMEZONE is still deliberately absent, but the REASON changed on 2026-08-03.
    // It used to be "every DTSTART here is floating local, so naming a zone would pin them".
    // That premise was wrong: Google does not honour floating times in a subscribed feed, it
    // normalises them to UTC, which is why every timed event rendered hours off. Times are now
    // absolute UTC instants, so there is no floating value left for this header to pin — and
    // Google reads it as the CALENDAR'S DISPLAY ZONE, which would override each subscriber's own
    // preference. Still do not add it.
    ...(vevents.length > 0 ? vevents : [PLACEHOLDER_VEVENT]),
    'END:VCALENDAR',
  ].join('\r\n');
}
