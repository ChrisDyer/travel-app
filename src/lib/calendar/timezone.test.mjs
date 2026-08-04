import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTimeZone,
  offsetMsAt,
  wallTimeToInstant,
  toUtcStamp,
  extractIata,
  firstValidTimeZone,
} from './timezone.ts';

/** Convenience: wall time → ISO instant string, for readable assertions. */
function iso(date, time, tz) {
  const r = wallTimeToInstant(date, time, tz);
  return r === null ? null : new Date(r.ms).toISOString().replace('.000', '');
}
function res(date, time, tz) {
  const r = wallTimeToInstant(date, time, tz);
  return r === null ? null : r.resolution;
}
/** Render an instant back in the zone, to prove the round trip. */
function renderIn(ms, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}

// --- isValidTimeZone -----------------------------------------------------------

test('isValidTimeZone accepts real zones and rejects junk', () => {
  for (const tz of ['UTC', 'America/Chicago', 'Europe/London', 'Asia/Tokyo', 'Pacific/Chatham']) {
    assert.equal(isValidTimeZone(tz), true, tz);
  }
  for (const bad of ['', null, undefined, 'Not/AZone', 'America/Nowhere', 42, {}]) {
    assert.equal(isValidTimeZone(bad), false, String(bad));
  }
});

// This is the regression guard for the whole module. Intl.supportedValuesOf and
// Intl.DateTimeFormat DISAGREE, and the geocoder returns the modern names. If someone
// "simplifies" isValidTimeZone into a supportedValuesOf lookup, every Indian trip silently
// loses its timezone and every timed item there degrades to all-day.
test('isValidTimeZone accepts zones missing from Intl.supportedValuesOf', () => {
  const listed = Intl.supportedValuesOf('timeZone');
  assert.equal(listed.includes('Asia/Kolkata'), false, 'precondition: Kolkata absent from the list');
  assert.equal(isValidTimeZone('Asia/Kolkata'), true, 'but DateTimeFormat accepts it');
});

test('isValidTimeZone never throws', () => {
  assert.doesNotThrow(() => isValidTimeZone('../../etc/passwd'));
  assert.doesNotThrow(() => isValidTimeZone('A'.repeat(500)));
});

// --- offsetMsAt ----------------------------------------------------------------

const H = 3_600_000;

test('offsetMsAt reports fixed offsets', () => {
  assert.equal(offsetMsAt(Date.UTC(2026, 7, 8), 'UTC'), 0);
  assert.equal(offsetMsAt(Date.UTC(2026, 7, 8), 'Asia/Tokyo'), 9 * H);
});

test('offsetMsAt tracks DST across the year', () => {
  assert.equal(offsetMsAt(Date.UTC(2026, 0, 15), 'America/Chicago'), -6 * H, 'January = CST');
  assert.equal(offsetMsAt(Date.UTC(2026, 6, 15), 'America/Chicago'), -5 * H, 'July = CDT');
});

test('offsetMsAt handles sub-hour offsets', () => {
  assert.equal(offsetMsAt(Date.UTC(2026, 7, 8), 'Asia/Kathmandu'), 5 * H + 45 * 60_000);
  assert.equal(offsetMsAt(Date.UTC(2026, 7, 8), 'Australia/Adelaide'), 9 * H + 30 * 60_000);
});

// --- wallTimeToInstant: the cases that matter ----------------------------------

test('an ordinary wall time converts and round-trips', () => {
  assert.equal(iso('2026-08-08', '11:45', 'America/Chicago'), '2026-08-08T16:45:00Z');
  assert.equal(res('2026-08-08', '11:45', 'America/Chicago'), 'unique');
  const { ms } = wallTimeToInstant('2026-08-08', '11:45', 'America/Chicago');
  assert.equal(renderIn(ms, 'America/Chicago'), '11:45');
});

// Spring forward: 02:30 does not exist on this date in New York. The naive
// guess-then-correct-once approach yields 01:30 EST — an hour EARLIER than asked for, and on the
// wrong side of the transition. Correct behaviour is to shift forward past the gap.
test('a wall time inside the spring-forward gap shifts FORWARD, not backward', () => {
  assert.equal(iso('2026-03-08', '02:30', 'America/New_York'), '2026-03-08T07:30:00Z');
  assert.equal(res('2026-03-08', '02:30', 'America/New_York'), 'gap');
  const { ms } = wallTimeToInstant('2026-03-08', '02:30', 'America/New_York');
  assert.equal(renderIn(ms, 'America/New_York'), '03:30', 'lands after the gap');
  assert.ok(ms > Date.parse('2026-03-08T06:59:00Z'), 'must not walk backwards into EST');
});

// Fall back: 01:30 happens twice. We take the earlier (still-on-DST) occurrence.
test('an ambiguous wall time takes the earlier occurrence', () => {
  assert.equal(iso('2026-11-01', '01:30', 'America/New_York'), '2026-11-01T05:30:00Z');
  assert.equal(res('2026-11-01', '01:30', 'America/New_York'), 'ambiguous');
  const { ms } = wallTimeToInstant('2026-11-01', '01:30', 'America/New_York');
  assert.equal(renderIn(ms, 'America/New_York'), '01:30', 'still renders as the requested time');
});

test('European DST transitions behave the same way', () => {
  assert.equal(iso('2026-03-29', '02:30', 'Europe/Paris'), '2026-03-29T01:30:00Z');
  assert.equal(res('2026-03-29', '02:30', 'Europe/Paris'), 'gap');
  assert.equal(iso('2026-10-25', '02:30', 'Europe/Paris'), '2026-10-25T00:30:00Z');
  assert.equal(res('2026-10-25', '02:30', 'Europe/Paris'), 'ambiguous');
});

test('a 30-minute DST shift is handled', () => {
  // Lord Howe moves by 30 minutes, not an hour.
  assert.equal(iso('2026-10-04', '02:15', 'Australia/Lord_Howe'), '2026-10-03T15:45:00Z');
  assert.equal(res('2026-10-04', '02:15', 'Australia/Lord_Howe'), 'gap');
});

test('sub-hour zone offsets convert correctly', () => {
  assert.equal(iso('2026-08-08', '11:45', 'Asia/Kathmandu'), '2026-08-08T06:00:00Z');
  assert.equal(iso('2026-09-20', '00:00', 'Pacific/Chatham'), '2026-09-19T11:15:00Z');
});

test('midnight and end-of-day convert without slipping a date', () => {
  assert.equal(iso('2026-08-10', '00:00', 'America/Los_Angeles'), '2026-08-10T07:00:00Z');
  assert.equal(iso('2026-08-10', '23:59', 'America/Los_Angeles'), '2026-08-11T06:59:00Z');
});

test('a zone east of the line can push the UTC date backwards', () => {
  assert.equal(iso('2026-08-10', '08:00', 'Pacific/Auckland'), '2026-08-09T20:00:00Z');
});

test('wallTimeToInstant returns null rather than throwing on bad input', () => {
  assert.equal(wallTimeToInstant('2026-08-08', '11:45', 'Not/AZone'), null);
  assert.equal(wallTimeToInstant('not-a-date', '11:45', 'UTC'), null);
  assert.equal(wallTimeToInstant('2026-08-08', 'noon', 'UTC'), null);
  assert.equal(wallTimeToInstant('2026-08-08', '25:00', 'UTC'), null);
  assert.equal(wallTimeToInstant('2026-08-08', '12:99', 'UTC'), null);
  assert.equal(wallTimeToInstant('', '', ''), null);
});

test('wallTimeToInstant is deterministic — the same input always gives the same instant', () => {
  const a = wallTimeToInstant('2026-08-08', '11:45', 'America/Chicago');
  const b = wallTimeToInstant('2026-08-08', '11:45', 'America/Chicago');
  assert.deepEqual(a, b);
});

// --- toUtcStamp ----------------------------------------------------------------

test('toUtcStamp emits the RFC 5545 UTC form', () => {
  assert.equal(toUtcStamp(Date.parse('2026-08-08T16:45:00Z')), '20260808T164500Z');
  assert.match(toUtcStamp(Date.now()), /^\d{8}T\d{6}Z$/);
});

test('toUtcStamp composes with wallTimeToInstant', () => {
  const { ms } = wallTimeToInstant('2026-08-08', '11:45', 'America/Chicago');
  assert.equal(toUtcStamp(ms), '20260808T164500Z');
});

// --- extractIata ---------------------------------------------------------------

test('extractIata reads the AirportCombobox format', () => {
  assert.equal(extractIata('Seattle (SEA)'), 'SEA');
  assert.equal(extractIata('Chicago O’Hare (ORD)'), 'ORD');
  assert.equal(extractIata('Paris (CDG)'), 'CDG');
});

test('extractIata accepts a bare code in any case', () => {
  assert.equal(extractIata('SEA'), 'SEA');
  assert.equal(extractIata('sea'), 'SEA');
  assert.equal(extractIata('  lhr  '), 'LHR');
});

// The important negative. 'Rio' is a real IATA code (Ecuador); matching bare 3-letter tokens
// inside longer text would put a Brazilian trip on the wrong continent.
test('extractIata rejects 3-letter words inside longer text', () => {
  assert.equal(extractIata('Rio de Janeiro'), null);
  assert.equal(extractIata('Heathrow'), null);
  assert.equal(extractIata('New York JFK'), null);
  assert.equal(extractIata('San Francisco International'), null);
});

test('extractIata handles empty and non-string input', () => {
  for (const bad of ['', '   ', null, undefined, 42, {}]) {
    assert.equal(extractIata(bad), null, String(bad));
  }
});

// --- firstValidTimeZone --------------------------------------------------------

test('firstValidTimeZone returns the first acceptable candidate', () => {
  assert.equal(firstValidTimeZone(null, undefined, '', 'America/Denver', 'UTC'), 'America/Denver');
  assert.equal(firstValidTimeZone('Not/AZone', 'Europe/Berlin'), 'Europe/Berlin');
  assert.equal(firstValidTimeZone(null, undefined, 'nope'), null);
  assert.equal(firstValidTimeZone(), null);
});
