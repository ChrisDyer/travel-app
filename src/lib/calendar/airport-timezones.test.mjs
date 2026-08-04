import test from 'node:test';
import assert from 'node:assert/strict';
import { TZ_ZONES, AIRPORT_TZ_INDEX, airportTimeZone } from './airport-timezones.ts';

// --- integrity of the generated table -------------------------------------------

// A truncated or half-written regeneration must fail here rather than quietly unresolving half
// the world's flights, which would show up only as events silently demoted to all-day.
test('the table is not truncated', () => {
  assert.ok(
    Object.keys(AIRPORT_TZ_INDEX).length > 4000,
    `only ${Object.keys(AIRPORT_TZ_INDEX).length} codes — regeneration probably failed`
  );
  assert.ok(TZ_ZONES.length > 300, `only ${TZ_ZONES.length} zones`);
});

test('every key is a well-formed upper-case IATA code', () => {
  for (const code of Object.keys(AIRPORT_TZ_INDEX)) {
    assert.match(code, /^[A-Z]{3}$/, code);
  }
});

test('every index points at a real zone', () => {
  for (const [code, i] of Object.entries(AIRPORT_TZ_INDEX)) {
    assert.ok(Number.isInteger(i) && i >= 0 && i < TZ_ZONES.length, `${code} → ${i}`);
  }
});

// Validate with the constructor, not Intl.supportedValuesOf — they disagree (see timezone.test.mjs).
test('every zone in the table is accepted by this runtime', () => {
  for (const zone of TZ_ZONES) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }), zone);
  }
});

test('zones are unique and sorted', () => {
  assert.equal(new Set(TZ_ZONES).size, TZ_ZONES.length, 'duplicate zone in TZ_ZONES');
  assert.deepEqual([...TZ_ZONES], [...TZ_ZONES].sort(), 'TZ_ZONES should be sorted');
});

// --- spot checks ----------------------------------------------------------------

test('well-known airports resolve to the right zone', () => {
  const expected = {
    SEA: 'America/Los_Angeles',
    ORD: 'America/Chicago',
    JFK: 'America/New_York',
    DEN: 'America/Denver',
    LHR: 'Europe/London',
    CDG: 'Europe/Paris',
    NRT: 'Asia/Tokyo',
    SYD: 'Australia/Sydney',
    KTM: 'Asia/Kathmandu',
    GRU: 'America/Sao_Paulo',
  };
  for (const [iata, zone] of Object.entries(expected)) {
    assert.equal(airportTimeZone(iata), zone, iata);
  }
});

test('airports in half-hour and quarter-hour zones resolve', () => {
  // These are the ones a naive integer-offset implementation gets wrong.
  assert.equal(airportTimeZone('DEL'), 'Asia/Kolkata');       // +05:30
  assert.equal(airportTimeZone('ADL'), 'Australia/Adelaide'); // +09:30
});

test('the two airports of a cross-zone route differ', () => {
  // The case the whole feature exists for: a flight whose start and end are in different zones.
  assert.notEqual(airportTimeZone('ORD'), airportTimeZone('SEA'));
  assert.notEqual(airportTimeZone('ORD'), airportTimeZone('LHR'));
});

// --- airportTimeZone contract ---------------------------------------------------

test('airportTimeZone returns null for unknown or empty input', () => {
  for (const bad of ['', null, undefined, 'ZZZ', 'sea', 'SEAX', 'toString', 'constructor']) {
    assert.equal(airportTimeZone(bad), null, String(bad));
  }
});

test('airportTimeZone is not fooled by inherited Object properties', () => {
  // AIRPORT_TZ_INDEX is a plain object literal, so 'toString' would resolve to a function if the
  // lookup were careless. Covered above, asserted separately because it is the subtle one.
  assert.equal(airportTimeZone('toString'), null);
  assert.equal(airportTimeZone('hasOwnProperty'), null);
});

test('airportTimeZone is case-sensitive by design', () => {
  // extractIata() upper-cases before calling in; accepting lower case here would hide a bug there.
  assert.equal(airportTimeZone('SEA'), 'America/Los_Angeles');
  assert.equal(airportTimeZone('sea'), null);
});
