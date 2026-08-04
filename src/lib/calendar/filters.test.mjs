import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTERS,
  EXPORT_PRESET,
  includeItem,
  filterItems,
  redactItems,
  prepareItems,
  countByKind,
  parseFeedFilters,
  serializeFeedFilters,
} from './filters.ts';

const TODAY = '2026-08-03';

/** A plain confirmed restaurant on a planning trip, in the future. Included by the defaults. */
function item(overrides = {}) {
  return {
    uid: 'event-1@travel.zo-bot.com',
    kind: 'event',
    id: '1',
    tripId: 't1',
    tripTitle: 'Washington',
    tripStatus: 'planning',
    bookingStatus: 'confirmed',
    noBookingNeeded: false,
    eventCategory: 'restaurant',
    hidden: false,
    summary: 'Dinner',
    start: { date: '2026-08-10', time: '19:00' },
    updatedAt: '2026-07-01T09:30:00.000Z',
    ...overrides,
  };
}

/** DEFAULT_FILTERS with a few keys replaced. */
function filters(overrides = {}) {
  return { ...DEFAULT_FILTERS, ...overrides };
}

// --- 1. hidden beats everything ------------------------------------------------

test('hidden beats every other gate', () => {
  assert.equal(includeItem(item(), filters(), TODAY), true);
  assert.equal(includeItem(item({ hidden: true }), filters(), TODAY), false);
});

test('hidden wins even for a trip span, which answers to no other content gate', () => {
  const span = item({ kind: 'tripSpan', bookingStatus: null, eventCategory: null, hidden: true });
  assert.equal(includeItem(span, filters(), TODAY), false);
});

// --- 2. hikes: the regression that matters most ---------------------------------

test('a hike survives bookingStatuses: [confirmed] because it carries no status', () => {
  const hike = item({ eventCategory: 'hike', bookingStatus: null });
  assert.equal(includeItem(hike, filters({ bookingStatuses: ['confirmed'] }), TODAY), true);
  // ...and even when no booking status at all is selected.
  assert.equal(includeItem(hike, filters({ bookingStatuses: [] }), TODAY), true);
});

test('a hike is governed only by the hike checkbox in eventCategories', () => {
  const hike = item({ eventCategory: 'hike', bookingStatus: null });
  const noHikes = DEFAULT_FILTERS.eventCategories.filter((c) => c !== 'hike');
  assert.equal(includeItem(hike, filters({ eventCategories: noHikes }), TODAY), false);
  assert.equal(includeItem(hike, filters({ eventCategories: ['hike'] }), TODAY), true);
});

// --- 3. "no booking needed" is a toggle, not a status ---------------------------

test('noBookingNeeded is governed by includeNoBookingNeeded and ignores bookingStatuses', () => {
  const walkUp = item({ noBookingNeeded: true, bookingStatus: 'unbooked' });
  // Its own toggle on: kept regardless of the status list, including an empty one.
  assert.equal(includeItem(walkUp, filters({ bookingStatuses: [] }), TODAY), true);
  assert.equal(includeItem(walkUp, filters({ bookingStatuses: ['confirmed'] }), TODAY), true);
  // Its own toggle off: dropped even though 'unbooked' is in the status list.
  assert.equal(
    includeItem(walkUp, filters({ includeNoBookingNeeded: false, bookingStatuses: ['unbooked'] }), TODAY),
    false
  );
});

test('includeNoBookingNeeded does not affect an item that does need booking', () => {
  const booked = item({ noBookingNeeded: false, bookingStatus: 'confirmed' });
  assert.equal(includeItem(booked, filters({ includeNoBookingNeeded: false }), TODAY), true);
});

// --- 4. the trip span answers only to kinds ------------------------------------

test('tripSpan ignores eventCategories and bookingStatuses', () => {
  const span = item({ kind: 'tripSpan', bookingStatus: null, eventCategory: null });
  assert.equal(
    includeItem(span, filters({ eventCategories: [], bookingStatuses: [] }), TODAY),
    true
  );
});

test('tripSpan is controlled only by kinds', () => {
  const span = item({ kind: 'tripSpan', bookingStatus: null, eventCategory: null });
  const noSpan = DEFAULT_FILTERS.kinds.filter((k) => k !== 'tripSpan');
  assert.equal(includeItem(span, filters({ kinds: noSpan }), TODAY), false);
});

// --- 5. eventCategories is ignored for non-event kinds --------------------------

test('a hotel is not filtered by eventCategories', () => {
  const hotel = item({ kind: 'hotel', eventCategory: null });
  assert.equal(includeItem(hotel, filters({ eventCategories: [] }), TODAY), true);
});

// There is a real 'sports' row in the database ("FIFA World Cup 2026 Match 100"), a category
// that exists nowhere in EventCategory. The settings UI can only render checkboxes for known
// categories, so an unknown one could never be switched back on — it must not be droppable.
test('an event with a category outside the enum fails OPEN and is included', () => {
  const odd = item({ eventCategory: 'sports' });
  assert.equal(includeItem(odd, filters(), TODAY), true);
  assert.equal(includeItem(odd, filters({ eventCategories: [] }), TODAY), true);
  assert.equal(includeItem(odd, filters({ eventCategories: ['restaurant'] }), TODAY), true);
});

test('an unknown category still answers to every OTHER gate', () => {
  const odd = item({ eventCategory: 'sports' });
  // Failing open on category must not become a way to bypass hiding or the kind gate.
  assert.equal(includeItem({ ...odd, hidden: true }, filters(), TODAY), false);
  assert.equal(includeItem(odd, filters({ kinds: ['hotel'] }), TODAY), false);
  assert.equal(includeItem(odd, filters({ tripStatuses: ['completed'] }), TODAY), false);
  assert.equal(includeItem(odd, filters({ bookingStatuses: ['pending'] }), TODAY), false);
});

test('a known category is still filtered normally', () => {
  assert.equal(includeItem(item({ eventCategory: 'restaurant' }), filters({ eventCategories: [] }), TODAY), false);
});

test('the trip status gate drops every item on an unlisted trip', () => {
  assert.equal(includeItem(item({ tripStatus: 'completed' }), filters({ tripStatuses: ['planning'] }), TODAY), false);
});

// --- 6. windows gate on overlap ------------------------------------------------

test('an item that started before the past cutoff but ends after it is kept', () => {
  // Cutoff is 2026-08-03 minus 7 days = 2026-07-27. This hotel spans it.
  const straddling = item({
    kind: 'hotel',
    eventCategory: null,
    start: { date: '2026-07-20' },
    end: { date: '2026-07-30' },
  });
  assert.equal(includeItem(straddling, filters({ windowPastDays: 7 }), TODAY), true);
});

test('an item that ended before the past cutoff is dropped', () => {
  const old = item({
    kind: 'hotel',
    eventCategory: null,
    start: { date: '2026-07-01' },
    end: { date: '2026-07-05' },
  });
  assert.equal(includeItem(old, filters({ windowPastDays: 7 }), TODAY), false);
  // null = unbounded keeps everything.
  assert.equal(includeItem(old, filters({ windowPastDays: null }), TODAY), true);
});

test('an item with no end date uses its start date for the past cutoff', () => {
  const old = item({ start: { date: '2026-07-01', time: '19:00' }, end: null });
  assert.equal(includeItem(old, filters({ windowPastDays: 7 }), TODAY), false);
  assert.equal(includeItem(old, filters({ windowPastDays: 60 }), TODAY), true);
});

test('the future window gates on start date', () => {
  const far = item({ start: { date: '2026-12-25' } });
  assert.equal(includeItem(far, filters({ windowFutureDays: 30 }), TODAY), false);
  assert.equal(includeItem(far, filters({ windowFutureDays: 365 }), TODAY), true);
  assert.equal(includeItem(far, filters({ windowFutureDays: null }), TODAY), true);
});

test('a window of 0 keeps an item that spans today', () => {
  const now = item({ kind: 'hotel', eventCategory: null, start: { date: '2026-08-01' }, end: { date: '2026-08-05' } });
  assert.equal(includeItem(now, filters({ windowPastDays: 0, windowFutureDays: 0 }), TODAY), true);
});

// --- filterItems / countByKind -------------------------------------------------

test('filterItems keeps order and drops only what includeItem rejects', () => {
  const items = [item({ uid: 'a' }), item({ uid: 'b', hidden: true }), item({ uid: 'c' })];
  assert.deepEqual(filterItems(items, filters(), TODAY).map((i) => i.uid), ['a', 'c']);
});

test('countByKind reports every kind, zero included', () => {
  const counts = countByKind([item(), item(), item({ kind: 'hotel', eventCategory: null })]);
  assert.equal(counts.event, 2);
  assert.equal(counts.hotel, 1);
  assert.equal(counts.tripSpan, 0);
  assert.equal(counts.flightReturn, 0);
});

test('EXPORT_PRESET matches the defaults except that it publishes booking details', () => {
  assert.equal(EXPORT_PRESET.includeBookingDetails, true);
  assert.equal(DEFAULT_FILTERS.includeBookingDetails, false);
  assert.deepEqual(
    { ...EXPORT_PRESET, includeBookingDetails: false },
    { ...DEFAULT_FILTERS, includeBookingDetails: false }
  );
});

// --- redaction: booking details are opt-in for a feed ---------------------------

/** The feed URL is a bearer credential; a leak must not hand over confirmation numbers.
 *  DEFAULT_FILTERS therefore withholds DESCRIPTION and the user opts in. */
const withDesc = (over = {}) => item({ description: 'Conf: ABC123\nVISA ****8479', ...over });

test('the default filters withhold DESCRIPTION', () => {
  assert.equal(DEFAULT_FILTERS.includeBookingDetails, false);
  const [out] = redactItems([withDesc()], DEFAULT_FILTERS);
  assert.equal(out.description, null);
});

test('opting in publishes DESCRIPTION unchanged', () => {
  const f = filters({ includeBookingDetails: true });
  const [out] = redactItems([withDesc()], f);
  assert.equal(out.description, 'Conf: ABC123\nVISA ****8479');
});

test('redaction touches nothing but the description', () => {
  const original = withDesc({ location: 'Olympic Lodge, Port Angeles' });
  const [out] = redactItems([original], DEFAULT_FILTERS);
  assert.equal(out.summary, original.summary);
  assert.equal(out.location, original.location);
  assert.deepEqual(out.start, original.start);
  assert.equal(out.uid, original.uid);
  assert.equal(out.updatedAt, original.updatedAt);
});

test('redaction does not mutate the input item', () => {
  const original = withDesc();
  redactItems([original], DEFAULT_FILTERS);
  assert.equal(original.description, 'Conf: ABC123\nVISA ****8479', 'input was mutated');
});

test('an item with no description survives redaction untouched', () => {
  const bare = item({ description: null });
  const [out] = redactItems([bare], DEFAULT_FILTERS);
  assert.equal(out, bare, 'a description-free item should not be needlessly copied');
});

test('prepareItems filters AND redacts in one call', () => {
  const items = [withDesc({ uid: 'a' }), withDesc({ uid: 'b', hidden: true })];
  const out = prepareItems(items, DEFAULT_FILTERS, TODAY);
  assert.deepEqual(out.map((i) => i.uid), ['a'], 'hidden item should be filtered out');
  assert.equal(out[0].description, null, 'surviving item should be redacted');
});

test('prepareItems under EXPORT_PRESET keeps descriptions', () => {
  const out = prepareItems([withDesc()], EXPORT_PRESET, TODAY);
  assert.equal(out.length, 1);
  assert.equal(out[0].description, 'Conf: ABC123\nVISA ****8479');
});

// --- 7-10. parseFeedFilters / serializeFeedFilters ------------------------------

test('malformed, empty and non-object input all degrade to the defaults and never throw', () => {
  for (const raw of ['', '{', 'null', '[]', 'undefined', '42', '"x"', null, undefined]) {
    assert.deepEqual(parseFeedFilters(raw), DEFAULT_FILTERS, `input ${JSON.stringify(raw)}`);
  }
});

test('an array key that is not an array falls back to that key default', () => {
  const f = parseFeedFilters('{"kinds":"flight"}');
  assert.deepEqual(f.kinds, DEFAULT_FILTERS.kinds);
});

test('an absent key gets that key default', () => {
  const f = parseFeedFilters('{"windowPastDays":30}');
  assert.deepEqual(f.tripStatuses, DEFAULT_FILTERS.tripStatuses);
  assert.equal(f.windowPastDays, 30);
});

test('an empty array is meaningful and is preserved, not replaced by the default', () => {
  assert.deepEqual(parseFeedFilters('{"eventCategories":[]}').eventCategories, []);
  assert.deepEqual(parseFeedFilters('{"kinds":[]}').kinds, []);
  assert.deepEqual(parseFeedFilters('{"bookingStatuses":[]}').bookingStatuses, []);
});

test('unknown enum members are dropped, not rejected', () => {
  const f = parseFeedFilters('{"eventCategories":["restaurant","bogus"]}');
  assert.deepEqual(f.eventCategories, ['restaurant']);
});

test('non-string array members are dropped too', () => {
  assert.deepEqual(parseFeedFilters('{"kinds":["hotel",7,null,{}]}').kinds, ['hotel']);
});

test('unknown keys are dropped', () => {
  const f = parseFeedFilters('{"nope":1,"kinds":["hotel"]}');
  assert.equal('nope' in f, false);
  assert.deepEqual(Object.keys(f).sort(), Object.keys(DEFAULT_FILTERS).sort());
});

test('includeNoBookingNeeded is coerced to a real boolean', () => {
  assert.equal(parseFeedFilters('{"includeNoBookingNeeded":0}').includeNoBookingNeeded, false);
  assert.equal(parseFeedFilters('{"includeNoBookingNeeded":"yes"}').includeNoBookingNeeded, true);
  assert.equal(parseFeedFilters('{"includeNoBookingNeeded":false}').includeNoBookingNeeded, false);
  assert.equal(parseFeedFilters('{}').includeNoBookingNeeded, true);
});

test('a window is a non-negative integer or null; anything else is unbounded', () => {
  assert.equal(parseFeedFilters('{"windowPastDays":0}').windowPastDays, 0);
  assert.equal(parseFeedFilters('{"windowPastDays":90}').windowPastDays, 90);
  for (const bad of ['-1', '1.5', '"30"', 'true', 'null']) {
    assert.equal(parseFeedFilters(`{"windowPastDays":${bad}}`).windowPastDays, null, `input ${bad}`);
  }
});

test('serializeFeedFilters round-trips through parseFeedFilters', () => {
  const cases = [
    '{}',
    '{"eventCategories":[]}',
    '{"kinds":["tripSpan","hotel"],"windowPastDays":30,"includeNoBookingNeeded":false}',
    '{"bookingStatuses":["confirmed"],"windowFutureDays":365}',
  ];
  for (const raw of cases) {
    const once = parseFeedFilters(raw);
    const twice = parseFeedFilters(serializeFeedFilters(once));
    assert.deepEqual(twice, once, `input ${raw}`);
    // Byte-stable: serializing the same filters twice gives the same string.
    assert.equal(serializeFeedFilters(twice), serializeFeedFilters(once));
  }
});

test('parseFeedFilters returns a fresh object, so a caller cannot mutate DEFAULT_FILTERS', () => {
  const f = parseFeedFilters('{');
  f.kinds = [];
  assert.deepEqual(DEFAULT_FILTERS.kinds.length > 0, true);
});

// The management API (Phase 2) and the settings UI (Phase 3) both parse-then-modify. If a
// parsed result shares arrays with the module defaults, one edit silently redefines the
// defaults for every later parse in the process — a bug whose symptom appears nowhere near
// its cause. Asserting the top-level object is fresh is NOT enough; check the arrays.
test('a parsed result shares no array with the module defaults', () => {
  const f = parseFeedFilters('{}');
  for (const key of ['tripStatuses', 'kinds', 'eventCategories', 'bookingStatuses']) {
    assert.notEqual(f[key], DEFAULT_FILTERS[key], `${key} is the same array object`);
    assert.deepEqual(f[key], DEFAULT_FILTERS[key], `${key} has the wrong contents`);
  }
});

test('mutating a parsed result never leaks into DEFAULT_FILTERS or a later parse', () => {
  const before = [...DEFAULT_FILTERS.kinds];
  const f = parseFeedFilters('{}');
  f.kinds.push('BOGUS');
  f.eventCategories.length = 0;
  assert.deepEqual(DEFAULT_FILTERS.kinds, before);
  const later = parseFeedFilters('{}');
  assert.deepEqual(later.kinds, before);
  assert.deepEqual(later.eventCategories, DEFAULT_FILTERS.eventCategories);
});

test('two parses are independent of each other', () => {
  const a = parseFeedFilters('{}');
  const b = parseFeedFilters('{}');
  a.kinds.push('BOGUS');
  assert.equal(b.kinds.includes('BOGUS'), false);
});

test('DEFAULT_FILTERS and its arrays are frozen, so a stray write fails loudly', () => {
  assert.equal(Object.isFrozen(DEFAULT_FILTERS), true);
  for (const key of ['tripStatuses', 'kinds', 'eventCategories', 'bookingStatuses']) {
    assert.equal(Object.isFrozen(DEFAULT_FILTERS[key]), true, `${key} is not frozen`);
  }
  // Module code is strict, so mutating a frozen array throws rather than failing silently.
  assert.throws(() => DEFAULT_FILTERS.kinds.push('BOGUS'));
  assert.throws(() => { DEFAULT_FILTERS.includeNoBookingNeeded = false; });
});

// EXPORT_PRESET was an alias of DEFAULT_FILTERS until includeBookingDetails split them: the
// feed withholds descriptions, the authenticated per-trip download keeps them. It is now a
// separate object and must be frozen in its own right.
test('EXPORT_PRESET is a distinct object and is equally protected', () => {
  assert.notEqual(EXPORT_PRESET, DEFAULT_FILTERS);
  assert.equal(Object.isFrozen(EXPORT_PRESET), true);
  assert.throws(() => EXPORT_PRESET.kinds.push('BOGUS'));
  assert.throws(() => { EXPORT_PRESET.includeBookingDetails = false; });
});
