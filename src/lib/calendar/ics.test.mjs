import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeText, fold, dtProperty, nextDay, buildVEvent, buildCalendar } from './ics.ts';
import { wallTimeToInstant, toUtcStamp } from './timezone.ts';

const UPDATED = '2026-07-01T09:30:00.000Z';
const STAMP = '20260701T093000Z';

/** A resolved endpoint, built the same way items.ts builds one. */
function at(date, time, timeZone = 'America/Chicago') {
  const r = wallTimeToInstant(date, time, timeZone);
  return { date, time, timeZone, utcStamp: toUtcStamp(r.ms) };
}
/** An endpoint whose zone could not be resolved — a wall time and nothing to anchor it to. */
function unresolvedAt(date, time) {
  return { date, time, timeZone: null, utcStamp: null };
}
/** An all-day endpoint. */
function allDay(date) {
  return { date, time: null, timeZone: null, utcStamp: null };
}

function item(overrides) {
  return {
    uid: 'event-1@travel.zo-bot.com',
    summary: 'Dinner',
    start: at('2026-08-10', '19:00'),
    updatedAt: UPDATED,
    ...overrides,
  };
}

// --- escapeText ---------------------------------------------------------------

test('escapeText escapes backslash before the characters it introduces', () => {
  assert.equal(escapeText('a\\b'), 'a\\\\b');
  assert.equal(escapeText('a;b'), 'a\\;b');
  assert.equal(escapeText('a,b'), 'a\\,b');
  assert.equal(escapeText('a\nb'), 'a\\nb');
  assert.equal(escapeText('a\r\nb'), 'a\\nb');
});

test('escapeText applies backslash first so an escape is not double-escaped', () => {
  // '\;' must become '\\\;' — backslash escaped, then the semicolon escaped separately.
  assert.equal(escapeText('\\;'), '\\\\\\;');
});

// --- fold ---------------------------------------------------------------------

test('fold leaves a 74-character line alone', () => {
  const line = 'x'.repeat(74);
  assert.equal(fold(line), line);
});

test('fold leaves a 75-character line alone', () => {
  const line = 'x'.repeat(75);
  assert.equal(fold(line), line);
});

test('fold breaks a 76-character line with a single-space continuation', () => {
  const folded = fold('x'.repeat(76));
  assert.equal(folded, 'x'.repeat(75) + '\r\n x');
  const [first, second] = folded.split('\r\n');
  assert.equal(first.length, 75);
  assert.equal(second[0], ' ');
});

test('fold continuation lines are at most 75 characters including the space', () => {
  const folded = fold('y'.repeat(400));
  for (const line of folded.split('\r\n')) {
    assert.ok(line.length <= 75, `line of ${line.length} octets`);
  }
});

// The limit is 75 OCTETS, not 75 JavaScript characters. These two differ for every non-ASCII
// character in the output, and real trip notes are full of em dashes.
const octets = (s) => Buffer.byteLength(s, 'utf8');

test('fold measures octets, not code units: em dashes push 75 characters over the limit', () => {
  // 73 ASCII + 2 em dashes = 75 code units but 79 octets. The old length-based fold left
  // this alone and emitted an over-long line; it must now be folded.
  const line = 'x'.repeat(73) + '——';
  assert.equal(line.length, 75);
  assert.equal(octets(line), 79);
  for (const l of fold(line).split('\r\n')) {
    assert.ok(octets(l) <= 75, `line of ${octets(l)} octets`);
  }
});

test('fold never splits a multi-octet character', () => {
  // An emoji sitting exactly on the byte boundary must move to the next line whole.
  for (let pad = 70; pad <= 80; pad += 1) {
    const folded = fold('x'.repeat(pad) + '🏨' + 'tail');
    for (const l of folded.split('\r\n')) {
      assert.ok(octets(l) <= 75, `pad ${pad}: line of ${octets(l)} octets`);
      // A lone surrogate on either edge means a character was cut in half.
      assert.ok(!/[\uD800-\uDBFF]$/.test(l), `pad ${pad}: line ends with a lone high surrogate`);
      assert.ok(!/^ ?[\uDC00-\uDFFF]/.test(l), `pad ${pad}: line starts with a lone low surrogate`);
    }
    // Unfolding must give the original text back, emoji intact.
    assert.equal(folded.replace(/\r\n /g, ''), 'x'.repeat(pad) + '🏨' + 'tail');
  }
});

test('fold round-trips: unfolding any folded line restores the original', () => {
  for (const line of [
    'SUMMARY:✈️ American Airlines AA 3234 (Chicago O’Hare (ORD) → Seattle-Tacoma (SEA)) delayed',
    'DESCRIPTION:Open on January 1st — confirm hours closer to the date. World-class museum.',
    '🏨'.repeat(60),
    'z'.repeat(300),
  ]) {
    const folded = fold(line);
    assert.equal(folded.replace(/\r\n /g, ''), line);
    for (const l of folded.split('\r\n')) {
      assert.ok(octets(l) <= 75, `line of ${octets(l)} octets in ${JSON.stringify(line.slice(0, 30))}`);
    }
  }
});

test('fold still leaves a 75-octet ASCII line alone and breaks a 76-octet one', () => {
  assert.equal(fold('x'.repeat(75)), 'x'.repeat(75));
  assert.equal(fold('x'.repeat(76)), 'x'.repeat(75) + '\r\n x');
});

// --- dtProperty ---------------------------------------------------------------

test('dtProperty emits an all-day DATE value when there is no instant', () => {
  assert.equal(dtProperty('DTSTART', allDay('2026-08-10')), 'DTSTART;VALUE=DATE:20260810');
  assert.equal(dtProperty('DTSTART', { date: '2026-08-10' }), 'DTSTART;VALUE=DATE:20260810');
});

test('dtProperty emits an absolute UTC instant when one was resolved', () => {
  // 19:00 in Chicago on this date is CDT (UTC-5), so midnight UTC the next day.
  assert.equal(dtProperty('DTSTART', at('2026-08-10', '19:00')), 'DTSTART:20260811T000000Z');
});

// The old floating branch is gone on purpose: Google normalises a zone-less datetime to UTC in a
// subscribed feed, which is what made every timed event render hours off. A wall time with no
// resolved zone must fall through to all-day rather than silently become a wrong instant.
test('dtProperty never emits a floating datetime, even with a time present', () => {
  const out = dtProperty('DTSTART', unresolvedAt('2026-08-10', '19:00'));
  assert.equal(out, 'DTSTART;VALUE=DATE:20260810');
  assert.doesNotMatch(out, /T\d{6}$/, 'no naked local datetime');
});

test('dtProperty returns null without a date', () => {
  assert.equal(dtProperty('DTSTART', { date: '', time: '19:00' }), null);
});

// --- nextDay ------------------------------------------------------------------

test('nextDay crosses a leap day', () => {
  assert.equal(nextDay('2028-02-28'), '2028-02-29');
  assert.equal(nextDay('2028-02-29'), '2028-03-01');
});

test('nextDay skips February 29 in a non-leap year', () => {
  assert.equal(nextDay('2026-02-28'), '2026-03-01');
});

test('nextDay crosses a year boundary', () => {
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
});

// --- buildVEvent --------------------------------------------------------------

test('an all-day event gets an exclusive DTEND one day after the end date', () => {
  const out = buildVEvent(item({
    start: allDay('2026-08-08'),
    end: allDay('2026-08-15'),
  }));
  assert.match(out, /DTSTART;VALUE=DATE:20260808/);
  assert.match(out, /DTEND;VALUE=DATE:20260816/);
});

test('a single-day all-day event still gets a DTEND of the next day', () => {
  const out = buildVEvent(item({ start: allDay('2026-08-08'), end: null }));
  assert.match(out, /DTEND;VALUE=DATE:20260809/);
});

// All-day items must be byte-for-byte what they always were — no Z, no TZID, no X-ZO-TZ. This is
// what keeps the diff after this change confined to timed events.
test('an all-day event carries no timezone artefacts at all', () => {
  const out = buildVEvent(item({ start: allDay('2026-08-08'), end: allDay('2026-08-15') }));
  // DTSTAMP/LAST-MODIFIED are UTC and always have been; it is DTSTART/DTEND that must stay DATE.
  for (const line of out.split('\r\n').filter((l) => /^DT(START|END)/.test(l))) {
    assert.match(line, /^DT(START|END);VALUE=DATE:\d{8}$/, line);
  }
  assert.doesNotMatch(out, /TZID/);
  assert.doesNotMatch(out, /X-ZO-TZ/);
});

test('a timed event with a timed end produces an instant DTEND, not a date one', () => {
  const out = buildVEvent(item({
    start: at('2026-08-10', '19:00'),
    end: at('2026-08-10', '21:30'),
  }));
  assert.match(out, /DTEND:20260811T023000Z/);
  assert.doesNotMatch(out, /DTEND;VALUE=DATE/);
});

test('a flight across two zones stamps each end in its own zone', () => {
  // 11:45 Chicago → 14:19 Seattle: about 4h34m of wall clock, but only 2h34m elapsed.
  const out = buildVEvent(item({
    summary: 'AA 1829',
    start: at('2026-08-08', '11:45', 'America/Chicago'),
    end: at('2026-08-08', '14:19', 'America/Los_Angeles'),
  }));
  assert.match(out, /DTSTART:20260808T164500Z/);
  assert.match(out, /DTEND:20260808T211900Z/);
  assert.match(out, /X-ZO-TZ:America\/Chicago\/America\/Los_Angeles/);
});

// New failure mode: endpoints are instants now, so they are comparable for the first time and can
// be inverted by one mis-resolved zone. Google mangles or drops such an event.
test('an end instant at or before the start omits DTEND rather than inverting', () => {
  const inverted = buildVEvent(item({
    start: at('2026-08-10', '19:00', 'America/Chicago'),
    end: at('2026-08-10', '19:00', 'Asia/Tokyo'),   // an earlier instant
  }));
  assert.match(inverted, /DTSTART:/);
  assert.doesNotMatch(inverted, /DTEND/);

  const equal = buildVEvent(item({
    start: at('2026-08-10', '19:00', 'America/Chicago'),
    end: at('2026-08-10', '19:00', 'America/Chicago'),
  }));
  assert.doesNotMatch(equal, /DTEND/);
});

// --- unresolved timezone: degrade loudly, never guess -------------------------

test('an unresolved timed event becomes all-day with the time in the title', () => {
  const out = buildVEvent(item({
    summary: '✈️ AA 3234',
    start: unresolvedAt('2026-08-08', '11:45'),
    end: null,
  }));
  assert.match(out, /DTSTART;VALUE=DATE:20260808/);
  assert.match(out, /SUMMARY:11:45 ✈️ AA 3234/);
  assert.match(out, /X-ZO-TZ:unresolved/);
  assert.doesNotMatch(out, /\d{8}T\d{6}Z\r\nDTEND|DTSTART:\d/, 'no instant emitted');
});

test('an unresolved event with an end time shows the range in the title', () => {
  const out = buildVEvent(item({
    summary: 'Hike',
    start: unresolvedAt('2026-08-10', '09:00'),
    end: unresolvedAt('2026-08-10', '13:00'),
  }));
  assert.match(out, /SUMMARY:09:00–13:00 Hike/);
  assert.match(out, /DTEND;VALUE=DATE:20260811/);
});

test('an unresolved event keeps its UID unchanged', () => {
  // Demotion must never orphan an already-imported event in a subscriber's calendar.
  const resolved = buildVEvent(item({ start: at('2026-08-10', '19:00') }));
  const not = buildVEvent(item({ start: unresolvedAt('2026-08-10', '19:00') }));
  const uidOf = (s) => /UID:(.*)/.exec(s)[1];
  assert.equal(uidOf(resolved), uidOf(not));
});

test('a resolved event tags its single zone', () => {
  const out = buildVEvent(item({ start: at('2026-08-10', '19:00', 'Europe/Paris') }));
  assert.match(out, /X-ZO-TZ:Europe\/Paris/);
});

test('a timed event with no end omits DTEND entirely', () => {
  const out = buildVEvent(item({ end: null }));
  assert.doesNotMatch(out, /DTEND/);
});

test('DTSTAMP and LAST-MODIFIED both come from updatedAt and are equal', () => {
  const out = buildVEvent(item());
  assert.match(out, new RegExp(`DTSTAMP:${STAMP}`));
  assert.match(out, new RegExp(`LAST-MODIFIED:${STAMP}`));
});

test('an unparseable updatedAt falls back to the epoch, not to now', () => {
  const a = buildVEvent(item({ updatedAt: 'not a date' }));
  const b = buildVEvent(item({ updatedAt: '' }));
  assert.match(a, /DTSTAMP:19700101T000000Z/);
  assert.match(b, /DTSTAMP:19700101T000000Z/);
});

test('buildVEvent returns null without a start date', () => {
  assert.equal(buildVEvent(item({ start: { date: '', time: null } })), null);
});

test('no SEQUENCE is emitted', () => {
  assert.doesNotMatch(buildVEvent(item()), /SEQUENCE/);
});

test('summary, location and description are escaped', () => {
  const out = buildVEvent(item({
    summary: 'Dinner; with, friends',
    location: 'Rue de la Paix, Paris',
    description: 'line one\nline two',
  }));
  assert.match(out, /SUMMARY:Dinner\\; with\\, friends/);
  assert.match(out, /LOCATION:Rue de la Paix\\, Paris/);
  assert.match(out, /DESCRIPTION:line one\\nline two/);
});

// --- buildCalendar ------------------------------------------------------------

test('an empty calendar contains exactly one placeholder VEVENT', () => {
  const out = buildCalendar('Zo Travel', []);
  assert.equal(out.split('BEGIN:VEVENT').length - 1, 1);
  assert.match(out, /UID:empty-placeholder@travel\.zo-bot\.com/);
  assert.match(out, /SUMMARY:No trips match your calendar filters/);
});

test('a non-empty calendar has no placeholder', () => {
  const out = buildCalendar('Zo Travel', [buildVEvent(item())]);
  assert.equal(out.split('BEGIN:VEVENT').length - 1, 1);
  assert.doesNotMatch(out, /empty-placeholder/);
});

test('the envelope carries the TTL hints and never X-WR-TIMEZONE', () => {
  const out = buildCalendar('Zo Travel', []);
  assert.match(out, /X-PUBLISHED-TTL:PT12H/);
  assert.match(out, /REFRESH-INTERVAL;VALUE=DURATION:PT12H/);
  assert.match(out, /X-WR-CALDESC:/);
  assert.doesNotMatch(out, /X-WR-TIMEZONE/);
});

test('the calendar name is escaped and lines are CRLF-joined', () => {
  const out = buildCalendar('Trip; one', []);
  assert.match(out, /X-WR-CALNAME:Trip\\; one/);
  assert.ok(out.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(out.endsWith('\r\nEND:VCALENDAR'));
});

// --- the regression guard for this whole change --------------------------------

// If anything ever emits a naked local datetime again, every timed event in every subscriber's
// calendar silently shifts by their UTC offset. Assert it across a realistic calendar.
test('no output anywhere contains a floating datetime', () => {
  const cal = buildCalendar('Zo Travel', [
    buildVEvent(item({ start: at('2026-08-10', '19:00') })),
    buildVEvent(item({ uid: 'b', start: at('2026-08-08', '11:45', 'America/Chicago'), end: at('2026-08-08', '14:19', 'America/Los_Angeles') })),
    buildVEvent(item({ uid: 'c', start: allDay('2026-08-08'), end: allDay('2026-08-15') })),
    buildVEvent(item({ uid: 'd', start: unresolvedAt('2026-08-08', '11:45') })),
  ]);
  for (const line of cal.split('\r\n')) {
    assert.doesNotMatch(line, /^DT(START|END):\d{8}T\d{6}$/, `floating datetime: ${line}`);
  }
});

test('buildVEvent is byte-stable across calls', () => {
  // The feed's "two fetches with no edits are identical" contract depends on this, and nothing
  // asserted it before timezones made the output a function of more inputs.
  const a = buildVEvent(item({ start: at('2026-08-10', '19:00'), end: at('2026-08-10', '21:30') }));
  const b = buildVEvent(item({ start: at('2026-08-10', '19:00'), end: at('2026-08-10', '21:30') }));
  assert.equal(a, b);
});
