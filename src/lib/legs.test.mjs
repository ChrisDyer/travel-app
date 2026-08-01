import test from 'node:test';
import assert from 'node:assert/strict';
import { legForDate, placeForDate, segmentDates, legWarnings } from './legs.ts';

function leg(overrides) {
  return {
    id: 'A',
    tripId: 'T1',
    place: 'Seattle',
    startDate: '2026-08-05',
    endDate: '2026-08-06',
    latitude: null,
    longitude: null,
    resolvedName: null,
    sortOrder: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

test('placeForDate falls back when there are no legs', () => {
  assert.equal(placeForDate([], '2026-08-05', 'Pacific Northwest'), 'Pacific Northwest');
});

test('one leg covers inclusive dates only', () => {
  const legs = [leg({ id: 'SEA', startDate: '2026-08-05', endDate: '2026-08-06' })];
  assert.equal(legForDate(legs, '2026-08-05')?.id, 'SEA');
  assert.equal(legForDate(legs, '2026-08-06')?.id, 'SEA');
  assert.equal(placeForDate(legs, '2026-08-04', 'Fallback'), 'Fallback');
  assert.equal(placeForDate(legs, '2026-08-07', 'Fallback'), 'Fallback');
});

test('gap between legs falls back', () => {
  const legs = [
    leg({ id: 'SEA', place: 'Seattle', startDate: '2026-08-05', endDate: '2026-08-05' }),
    leg({ id: 'PA', place: 'Port Angeles', startDate: '2026-08-07', endDate: '2026-08-08' }),
  ];
  assert.equal(placeForDate(legs, '2026-08-06', 'Washington'), 'Washington');
});

test('overlap chooses greater startDate', () => {
  const legs = [
    leg({ id: 'SEA', place: 'Seattle', startDate: '2026-08-05', endDate: '2026-08-07' }),
    leg({ id: 'PA', place: 'Port Angeles', startDate: '2026-08-07', endDate: '2026-08-10' }),
  ];
  assert.equal(legForDate(legs, '2026-08-07')?.id, 'PA');
});

test('same startDate chooses greater sortOrder, then greater id', () => {
  assert.equal(legForDate([
    leg({ id: 'A', sortOrder: 1 }),
    leg({ id: 'B', sortOrder: 2 }),
  ], '2026-08-05')?.id, 'B');
  assert.equal(legForDate([
    leg({ id: 'A', sortOrder: 2 }),
    leg({ id: 'B', sortOrder: 2 }),
  ], '2026-08-05')?.id, 'B');
});

test('one-day leg covers exactly that date', () => {
  const legs = [leg({ id: 'ONE', startDate: '2026-08-06', endDate: '2026-08-06' })];
  assert.equal(legForDate(legs, '2026-08-06')?.id, 'ONE');
  assert.equal(legForDate(legs, '2026-08-07'), null);
});

test('reversed leg covers nothing and warns', () => {
  const legs = [leg({ id: 'BAD', startDate: '2026-08-07', endDate: '2026-08-06' })];
  assert.equal(legForDate(legs, '2026-08-07'), null);
  assert.equal(legWarnings(legs, '2026-08-05', '2026-08-10').some((w) => w.kind === 'reversed'), true);
});

test('segmentDates splits across leg boundary', () => {
  const segments = segmentDates([
    leg({ id: 'SEA', place: 'Seattle', startDate: '2026-08-05', endDate: '2026-08-06' }),
    leg({ id: 'PA', place: 'Port Angeles', startDate: '2026-08-07', endDate: '2026-08-08' }),
  ], ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'], 'Washington');
  assert.deepEqual(segments.map((s) => [s.place, s.dates]), [
    ['Seattle', ['2026-08-05', '2026-08-06']],
    ['Port Angeles', ['2026-08-07', '2026-08-08']],
  ]);
});

test('segmentDates keeps separated stays separate', () => {
  const segments = segmentDates([
    leg({ id: 'SEA1', place: 'Seattle', startDate: '2026-08-05', endDate: '2026-08-05' }),
    leg({ id: 'PA', place: 'Port Angeles', startDate: '2026-08-06', endDate: '2026-08-06' }),
    leg({ id: 'SEA2', place: 'Seattle', startDate: '2026-08-07', endDate: '2026-08-07' }),
  ], ['2026-08-05', '2026-08-06', '2026-08-07'], 'Washington');
  assert.deepEqual(segments.map((s) => s.place), ['Seattle', 'Port Angeles', 'Seattle']);
});

test('scrambled input resolves the same as sorted input', () => {
  const sorted = [
    leg({ id: 'A', place: 'A', startDate: '2026-08-05', endDate: '2026-08-06' }),
    leg({ id: 'B', place: 'B', startDate: '2026-08-06', endDate: '2026-08-07' }),
  ];
  assert.deepEqual(segmentDates([...sorted].reverse(), ['2026-08-05', '2026-08-06', '2026-08-07'], 'Fallback'), segmentDates(sorted, ['2026-08-05', '2026-08-06', '2026-08-07'], 'Fallback'));
});
