import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { TripLeg } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; legId: string }> };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(value: unknown, field: string): NextResponse | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return NextResponse.json({ error: `${field} must be YYYY-MM-DD` }, { status: 400 });
  }
  return null;
}

function normalizeSortOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, legId } = await params;
  const userId = getUserId(request);
  const existing = db.prepare(`
    SELECT trip_legs.*
    FROM trip_legs
    JOIN trips ON trips.id = trip_legs.trip_id
    WHERE trip_legs.id = ? AND trip_legs.trip_id = ? AND trips.user_id = ?
  `).get(legId, tripId, userId) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];

  if ('place' in body) {
    const place = String(body.place ?? '').trim();
    if (!place) return NextResponse.json({ error: 'place is required' }, { status: 400 });
    setClauses.push('place = ?');
    values.push(place);
    if (place !== existing.place) {
      // Changing the place invalidates the cached geocode. Clearing these in the same UPDATE is
      // what stops the weather strip showing the old city's forecast under the new city's label.
      // See docs/trip-legs/00-overview.md, rule 1.
      // resolved_timezone is derived from the same geocode, so it goes with them — otherwise the
      // calendar feed would keep stamping this leg's items with the previous city's timezone.
      setClauses.push('latitude = NULL', 'longitude = NULL', 'resolved_name = NULL', 'resolved_timezone = NULL');
    }
  }
  if ('startDate' in body) {
    const invalid = validateDate(body.startDate, 'startDate');
    if (invalid) return invalid;
    setClauses.push('start_date = ?');
    values.push(body.startDate);
  }
  if ('endDate' in body) {
    const invalid = validateDate(body.endDate, 'endDate');
    if (invalid) return invalid;
    setClauses.push('end_date = ?');
    values.push(body.endDate);
  }
  const nextStartDate = 'startDate' in body ? body.startDate : existing.start_date;
  const nextEndDate = 'endDate' in body ? body.endDate : existing.end_date;
  if (typeof nextStartDate === 'string' && typeof nextEndDate === 'string' && nextEndDate < nextStartDate) {
    return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });
  }
  if ('sortOrder' in body) {
    setClauses.push('sort_order = ?');
    values.push(normalizeSortOrder(body.sortOrder));
  }

  values.push(legId, tripId);
  // Leg writes intentionally do not touch trips.updated_at; that timestamp keys the itinerary
  // document, and bumping it would remount open client state. See docs/trip-legs/00-overview.md, rule 3.
  const leg = db.prepare(`UPDATE trip_legs SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`).get(...values) as Record<string, unknown> | undefined;
  if (!leg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripLeg>(leg));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, legId } = await params;
  const userId = getUserId(request);
  const existing = db.prepare(`
    SELECT trip_legs.id
    FROM trip_legs
    JOIN trips ON trips.id = trip_legs.trip_id
    WHERE trip_legs.id = ? AND trip_legs.trip_id = ? AND trips.user_id = ?
  `).get(legId, tripId, userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Leg writes intentionally do not touch trips.updated_at; that timestamp keys the itinerary
  // document, and bumping it would remount open client state. See docs/trip-legs/00-overview.md, rule 3.
  db.prepare('DELETE FROM trip_legs WHERE id = ? AND trip_id = ?').run(legId, tripId);
  return new NextResponse(null, { status: 204 });
});
