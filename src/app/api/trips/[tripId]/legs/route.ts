import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import type { TripLeg } from '@/types/travel';

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

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const legs = db.prepare('SELECT * FROM trip_legs WHERE trip_id = ? ORDER BY start_date ASC, sort_order ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<TripLeg>(legs));
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['place', 'startDate', 'endDate']);
  if (invalid) return invalid;

  const place = String(body.place).trim();
  if (!place) return NextResponse.json({ error: 'place is required' }, { status: 400 });
  const invalidStart = validateDate(body.startDate, 'startDate');
  if (invalidStart) return invalidStart;
  const invalidEnd = validateDate(body.endDate, 'endDate');
  if (invalidEnd) return invalidEnd;
  if (body.endDate < body.startDate) return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Leg writes intentionally do not touch trips.updated_at; that timestamp keys the itinerary
  // document, and bumping it would remount open client state. See docs/trip-legs/00-overview.md, rule 3.
  const leg = db.prepare(`
    INSERT INTO trip_legs (id, trip_id, place, start_date, end_date, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(id, tripId, place, body.startDate, body.endDate, normalizeSortOrder(body.sortOrder), now, now) as Record<string, unknown>;

  return NextResponse.json(camelize<TripLeg>(leg), { status: 201 });
});
