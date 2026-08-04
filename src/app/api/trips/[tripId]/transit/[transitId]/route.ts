import { NextResponse } from 'next/server';
import { db, camelize } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import type { TripTransit } from '@/types/travel';

type Params = { params: Promise<{ tripId: string; transitId: string }> };

export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, transitId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const colMap: Record<string, string> = {
    transitType: 'transit_type', operator: 'operator', routeNumber: 'route_number',
    fromLocation: 'from_location', toLocation: 'to_location',
    departureDate: 'departure_date', departureTime: 'departure_time',
    arrivalDate: 'arrival_date', arrivalTime: 'arrival_time',
    confirmationNumber: 'confirmation_number', seatInfo: 'seat_info',
    bookingStatus: 'booking_status', cost: 'cost', currency: 'currency', notes: 'notes',
    hideFromCalendar: 'hide_from_calendar',
  };
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in body) { setClauses.push(`${col} = ?`); values.push(body[key]); }
  }
  values.push(transitId, tripId);

  const item = db.prepare(
    `UPDATE trip_transit SET ${setClauses.join(', ')} WHERE id = ? AND trip_id = ? RETURNING *`
  ).get(...values) as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(camelize<TripTransit>(item));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { tripId, transitId } = await params;
  const userId = getUserId(request);
  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  db.prepare('DELETE FROM trip_transit WHERE id = ? AND trip_id = ?').run(transitId, tripId);
  return new NextResponse(null, { status: 204 });
});
