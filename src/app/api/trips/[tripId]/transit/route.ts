import { NextResponse } from 'next/server';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import { requireFields, withErrorHandling } from '@/lib/api-helpers';
import type { TripTransit } from '@/types/travel';

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = db.prepare('SELECT * FROM trip_transit WHERE trip_id = ? ORDER BY departure_date ASC, departure_time ASC').all(tripId) as Record<string, unknown>[];
  return NextResponse.json(camelizeAll<TripTransit>(items));
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const invalid = requireFields(body, ['operator']);
  if (invalid) return invalid;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const item = db.prepare(`
    INSERT INTO trip_transit (
      id, trip_id, transit_type, operator, route_number, from_location, to_location,
      departure_date, departure_time, arrival_date, arrival_time,
      confirmation_number, seat_info, booking_status, cost, currency, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, tripId, body.transitType ?? null, body.operator,
    body.routeNumber ?? null, body.fromLocation ?? null, body.toLocation ?? null,
    body.departureDate ?? null, body.departureTime ?? null,
    body.arrivalDate ?? null, body.arrivalTime ?? null,
    body.confirmationNumber ?? null, body.seatInfo ?? null,
    body.bookingStatus ?? 'unbooked', body.cost ?? null, body.currency ?? null,
    body.notes ?? null, now, now
  ) as Record<string, unknown>;

  return NextResponse.json(camelize<TripTransit>(item), { status: 201 });
});
