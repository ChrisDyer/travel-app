import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeText, fold, dtProperty, nextDay, buildVEvent, buildCalendar } from './ics.ts';

const UPDATED = '2026-07-01T09:30:00.000Z';
const STAMP = '20260701T093000Z';

function item(overrides) {
  return {
    uid: 'event-1@travel.zo-bot.com',
    summary: 'Dinner',
    start: { date: '2026-08-10', time: '19:00' },
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

test('dtProperty emits an all-day DATE value when there is no time', () => {
  assert.equal(dtProperty('DTSTART', '2026-08-10', null), 'DTSTART;VALUE=DATE:20260810');
  assert.equal(dtProperty('DTSTART', '2026-08-10'), 'DTSTART;VALUE=DATE:20260810');
});

test('dtProperty emits a floating local datetime when there is a time', () => {
  assert.equal(dtProperty('DTSTART', '2026-08-10', '19:00'), 'DTSTART:20260810T190000');
});

test('dtProperty zero-pads a single-digit hour', () => {
  assert.equal(dtProperty('DTSTART', '2026-08-10', '9:05'), 'DTSTART:20260810T090500');
});

test('dtProperty returns null without a date', () => {
  assert.equal(dtProperty('DTSTART', '', '19:00'), null);
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
    start: { date: '2026-08-08', time: null },
    end: { date: '2026-08-15', time: null },
  }));
  assert.match(out, /DTSTART;VALUE=DATE:20260808/);
  assert.match(out, /DTEND;VALUE=DATE:20260816/);
});

test('a single-day all-day event still gets a DTEND of the next day', () => {
  const out = buildVEvent(item({ start: { date: '2026-08-08', time: null }, end: null }));
  assert.match(out, /DTEND;VALUE=DATE:20260809/);
});

test('a timed event with a timed end produces a timed DTEND, not a date one', () => {
  const out = buildVEvent(item({
    start: { date: '2026-08-10', time: '19:00' },
    end: { date: '2026-08-10', time: '21:30' },
  }));
  assert.match(out, /DTEND:20260810T213000/);
  assert.doesNotMatch(out, /DTEND;VALUE=DATE/);
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
